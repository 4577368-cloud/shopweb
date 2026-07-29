# 订单中心 · 代发简版采购单（基于 tang-plugin `purchaseOrder`）

> **参考仓库**（本地只读，不提交）：`.reference/tang-plugin` ← `git@gitlab.tangbuy.cc:tangbuy/backend/common/tang-plugin.git`  
> **实现仓库**：前端 `shopify_qianru` · 插件后端 `4577368-cloud/shop.git`（本地 `tangbuy-plugin/`）  
> **对标入口**：`com.tang.plugin.controller.order.DraftOrderController#purchaseOrder`  
> **订单类型**：代发（`orderType = 1`），**全部走采购**，不做备货/库存碰撞。

---

## 1. 我们要抄什么、不抄什么

### 1.1 tang-plugin 主链路（摘要）

```
POST /draft/order/purchaseOrder
  → DraftOrderManagerImpl.purchaseOrder(userId, DraftOrderPurchaseReq)
      ① checkStockNums(req)              // 库存碰撞校验
      ② directOrderFlag → createOrder    // orderType=3 直发 / 直备
      ③ 订单状态 = AWAITING
      ④ Redis 锁 orderId
      ⑤ list AWAITING 行 + checkLines（goodsId 必须已匹配）
      ⑥ innerOrderSyncManager.uniOrderByLines(...)
           → buildPluginDiscounts        // 优惠
           → reCalRangePriceForOrderLines // 阶梯价（有 orderLineStock 时）
           → orderMaterialManager         // 物料
           → calDraftPurchasedOrderAmount2 // 包裹运费
           → remoteOrderService.uniOrder  // 调主站生成 TO/TI + tradeNo
      ⑦ 返回 CreateDraftOrderPurchaseVO { tradeNo, expireTime, type }
```

### 1.2 60s Sourcing 简版范围

| 能力 | tang-plugin 全量 | 我们（代发简版） |
|------|------------------|------------------|
| 订单类型 | 1 代发 / 2 备货 / 3 直发 | **仅 1 代发** |
| 库存碰撞 `orderLineStock` | 有 | **去掉** |
| 阶梯价重算 | 有 | **去掉** |
| 优惠 `buildPluginDiscounts` | 有 | **去掉**（`couponId`/`passwordDiscount` 传空） |
| 组合商品 / 拆单 | 有 | **去掉**（一行 Shopify line → 一行采购） |
| 备货 `refundToStock` / `validateStock` | 有 | **不做** |
| 询盘 `inquiryId` | 可选 | **首期不传** |
| 物料 `useMaterials` | 直购用 | **不传** |
| 物流线路 `packageCreateInfo` | 必填 | **保留**（代发仍要算国际段运费） |
| 商品匹配 `goodsId` | 行上必须有 | **保留**（来自 SKU 对齐 binding → `tangbuySkuId`） |
| 支付单号 `tradeNo` | 返回 | **保留**（待支付 Tab + 支付弹窗） |
| 并发锁 | Redis | **保留**（按 `outerOrderId` 或 plugin orderId） |

---

## 2. 数据前提（B 轨依赖）

当前 `shop.git` 已有：

- Shopify webhook / 轮询 → `ThirdPlatformOrder` + `ThirdPlatformOrderLine`
- 行级 binding：`OrderBindingResolver` → `tangbuySkuId` / `BOUND`
- 采购 outbox：`ProcurementTaskService.createFromOrder`（**仅任务记录，不是真下单**）

仍缺（阻塞「下单」按钮接真 API）：

| 编号 | 缺口 | 说明 |
|------|------|------|
| B1 | 列表带 `line_items` | `GET /api/plugin/order/header/list` 需嵌套行或另开 `/lines` |
| B1.5 | 插件侧 draft 与主站 draft 对齐 | 简版可先 **在 shop 内聚合成 purchase 请求**，再 **转发主站**；或 shop 内自建 thin draft 表 |
| B2 | 下单 API | 本文 §3 |
| B2.1 | 物流线路选择 | 前端需选 `lineId`（可复用 logistics 模块已有线路查询） |

---

## 3. 建议 API 契约（shop.git → 前端 BFF）

### 3.1 创建代发采购单

```
POST /api/plugin/order/purchase/dropship
Authorization: Bearer <app session>
Content-Type: application/json

{
  "shopName": "my-shop",
  "outerOrderId": "5204812367890",
  "packageCreateInfo": {
    "lineId": 152927962808352,
    "lineName": "GD-EMS",
    "deliveryTime": "5-7日",
    "packageComment": "",
    "packageChoosedContent": {
      "currency": "USD",
      "couponId": "",
      "passwordDiscount": "",
      "incrementList": [],
      "insure": 0,
      "useInsure": 0,
      "queryForm": {
        "currencyId": 388648745304065,
        "declareMode": 0,
        "registrationType": 0,
        "tax": 0
      }
    }
  }
}
```

**服务端逻辑（简版 `purchaseOrder`）：**

1. `ShopAccessGuard.assertOwner`
2. 加载 `outerOrderId` 下全部 **未删** 行；拒绝存在 `UNBOUND` 行
3. Redis 锁 `dropshipPurchase:{shopName}:{outerOrderId}`
4. 幂等：若已有进行中的 `tradeNo` / 采购快照 `ord_stat ∈ {待支付,处理中}` → 返回已有
5. 组装 `DraftOrderPurchaseReq`：
   - `orderType = 1`
   - `orderLineStock = null`（不碰撞）
   - `packageCreateInfo` 原样转发
   - `orderId` = 主站 draft id（见 §4 集成策略）
6. 调主站采购创建 → 拿 `tradeNo` / `expireTime`
7. 可选：对该单 `ProcurementTaskService.createFromOrder` 补 outbox
8. 持久化 `{ outerOrderId, tradeNo, expireTime, placedAt }` 供列表合并

**响应：**

```json
{
  "outerOrderId": "5204812367890",
  "tradeNo": "PAY202607290001",
  "expireTime": "2026-07-29T20:00:00Z",
  "payableAmountCny": 286.50,
  "tangbuyOrderNo": "TO26070000072",
  "lineNos": ["TI26070000095"]
}
```

### 3.2 试算应付（可选，对标 `calDraftPurchasedAmount`）

```
POST /api/plugin/order/purchase/dropship/preview
```

入参同上，出参 `{ goodsAmountCny, packageAmountCny, totalCny }`，**不算优惠、不算阶梯**。

### 3.3 支付（已有 billing 模块可接）

前端 `PaymentModal` 在拿到 `tradeNo` 后：

- 余额：`/billing/consume/balance`（已有）
- 或跳转主站合并支付（对标 `orderMergePay`，二期）

---

## 4. 与主站 tang-plugin 的集成策略（二选一）

### 方案 A — 转发全量 tang-plugin（推荐首期）

shop.git 作为 **BFF + 鉴权**，HTTP 调内网 `tang-plugin`：

- 前提：Shopify 订单已在主站生成 `TDraftOrder` + 行上写好 `goodsId`（与 binding 同步任务）
- shop 只负责：校验 binding、选物流、POST `/draft/order/purchaseOrder`
- **优点**：复用 `uniOrderByLines` / 支付 / MQ 状态回写，改动最小  
- **缺点**：要维护「Shopify 行 → 主站 draft 行」映射

### 方案 B — shop 内 thin draft + Admin 直调

shop 自建最小 draft 表，直接调 `remoteOrderService.uniOrder` 等价 Admin API。

- **优点**：不依赖主站 draft 同步  
- **缺点**：需复制地址解析、申报、包裹费计算；与 tang-plugin 分叉

**当前建议**：走 **方案 A**；参考代码以 `.reference/tang-plugin` 为准，shop 只实现 **代发子集** 的 Controller + 转发层。

---

## 5. 前端改造点（`shopify_qianru`）

| 文件 | 改动 |
|------|------|
| `src/lib/order/mock-store.ts` | `handlePlace` 改为调 B2；失败回退 mock（开发旗标） |
| `src/app/[locale]/order-center/page.tsx` | `handlePlace` / `handlePaid` 接真实 API |
| `src/lib/order/api.ts` | 新增 `placeDropshipOrder`；`mapShopOrderHeader` 合并 `lineItems` |
| `order-detail-drawer.tsx` | 待下单前校验：全部 line 已 binding，否则引导 sku-align |
| 物流 | 下单前弹窗选线路（`packageCreateInfo.lineId`） |

状态流转（与现有 Tab 一致）：

```
Shopify PAID → pendingOrder（待下单）
  → POST purchase/dropship → pendingPayment（待支付，带 tradeNo）
  → 支付成功 → preparing（处理中，等 Admin 快照 ord_line_stat）
  → … merchant-fulfillment-phase 已有映射
```

---

## 6. 参考：tang-plugin 请求体最小代发样例

摘自 `OrderServiceTest#createPurchaseOrder`（已去掉 `orderLineStock`）：

```json
{
  "orderId": 178722397208624,
  "orderType": 1,
  "packageCreateInfo": {
    "packageComment": "",
    "lineId": 152927962808352,
    "lineName": "GD-EMS-测试",
    "deliveryTime": "1-2日",
    "packageChoosedContent": {
      "couponId": "",
      "passwordDiscount": "",
      "incrementList": ["11"],
      "insure": 0,
      "useInsure": 0,
      "currency": "USD",
      "queryForm": {
        "currencyId": 388648745304065,
        "declareMode": 0,
        "registrationType": 0,
        "tax": 10
      }
    }
  }
}
```

---

## 7. 实施顺序

1. **B1** — `header/list` 返回行 + binding 快照（含 `previewImageUrl`）  
2. **B2** — shop.git `DropshipPurchaseController`（简版 purchaseOrder + 转发）  
3. **C** — 前端 `handlePlace` 接 B2 + 物流选线 UI  
4. **快照** — 定时拉 Admin `listOrderDetail` → `procurementLine`（见 `ORDER_CENTER_PROCUREMENT_LINE_CONTRACT.md`）  
5. **支付** — tradeNo 接 billing / 主站合并支付  

---

## 8. 验收

- [ ] 全部行 `BOUND` 的 Shopify 代发单，点「下单」返回真实 `tradeNo`  
- [ ] 未绑定行阻断并跳转 sku-align  
- [ ] 无 `orderLineStock`、无阶梯价、无优惠券字段参与计价  
- [ ] 支付后列表 Tab 进入「待支付 → 处理中」，采购快照与 Admin 一致  
- [ ] 重复点击下单幂等（同一 outerOrderId 不重复建 TO）
