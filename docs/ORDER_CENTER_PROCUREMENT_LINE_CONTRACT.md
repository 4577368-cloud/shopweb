# 订单中心 — `procurementLine` BFF 契约（tangbuy-plugin）

> 前端实现：`src/lib/order/tangbuy/` · 合并入口：`mapShopOrderHeader`（`src/lib/order/api.ts`）  
> 映射真相源：`/Users/panda/Documents/采购系统/tangbuy-procurement-api/app/integrations/tangbuy_admin/mapper.py`

## 1. 两种下发方式（二选一或并存）

### A. 嵌在订单头列表（推荐首期）

`GET /api/plugin/order/header/list?shopName={shortName}`

每条 `ShopOrderHeader` 增加可选字段 `procurementLine`（子单快照，见 §2）。

### B. 批量快照接口（列表头未嵌套时用）

`GET /api/plugin/order/procurement/snapshots?shopName={shortName}`

响应：

```json
[
  {
    "outerOrderId": "5204812367890",
    "procurementLine": { }
  }
]
```

前端在 `fetchOrders` 中 **静默合并**（接口 404/空数组不影响现有列表）。

关联键：`outerOrderId` === Shopify `ThirdPlatformOrder.outerOrderId` === Admin `order.pluginOrderId` / 宽表 `out_ord_no`。

## 2. `procurementLine` 字段白名单

**只允许**下列字段（snake_case，与宽表一致）。禁止：`pur_prc`、`pur_sugg_prc`、`settlement_real_amt`、`buyer`、`bd_usr_nm`、`hsCode`、`categoryId`、盈亏类字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| `ord_line_no` | string | 子单 TI* |
| `ord_no` | string | 采购主单 TO* |
| `out_ord_no` | string | 插件/Shopify 外单号 |
| `ord_line_stat` | number | Admin `goodsStatus` |
| `ord_line_stat_nm` | string | 中文状态名（可选，无则前端按枚举补） |
| `ord_stat` | number | Admin `orderStatus` |
| `rtn_stat` | number | 退货状态 |
| `abn_type_cd` | number | 异常类型 |
| `item_nm` | string | 商品标题（详情展示） |
| `item_img` | string | 商品图 URL |
| `item_url` | string | 货源链接（可选） |
| `shop_pltf_cd` | string | 如 `1688` |
| `ord_cnt` | number | 数量 |
| `pay_time` | string | ISO 或 `yyyy-MM-dd HH:mm:ss` |
| `pur_no` | string | 1688/平台采购单号（可展示） |
| `pur_time` | string | 采购下单时间 |
| `sign_time` | string | 签收时间 |
| `exprs_no` | string | 国内快递单号 |
| `exprs_nm` | string | 承运商名称 |
| `pkg_rcv_cntry` | string | 目的国（展示名） |
| `usr_cntry_nm` | string | 用户国家（兜底） |
| `usr_rmk` | string | 用户备注（非内部备注） |
| `store_source` | string | 如 `alibaba` |
| `timeline` | array | `{ time, action, actor? }` 来自 `trackList` |

TypeScript 类型：`MerchantOrdLineSnapshot`（`src/lib/order/tangbuy/ord-line-snapshot.ts`）。

## 3. 响应示例

```json
{
  "outerOrderId": "5204812367890",
  "orderName": "#1024",
  "financialStatus": "PAID",
  "fulfillmentStatus": null,
  "currency": "USD",
  "totalPrice": 86.0,
  "platformCreatedAt": "2026-07-01T12:00:00Z",
  "procurementLine": {
    "ord_line_no": "TI26070000095",
    "ord_no": "TO26070000072",
    "out_ord_no": "5204812367890",
    "ord_line_stat": 23,
    "ord_line_stat_nm": "处理中",
    "ord_stat": 2,
    "rtn_stat": 0,
    "abn_type_cd": 0,
    "item_nm": "示例商品标题",
    "item_img": "https://cbu01.alicdn.com/...jpg",
    "shop_pltf_cd": "1688",
    "ord_cnt": 2,
    "pay_time": "2026-07-06T09:59:29Z",
    "pkg_rcv_cntry": "United States",
    "exprs_no": "78825735743908",
    "exprs_nm": "中通快递(ZTO)",
    "timeline": [
      {
        "time": "2026-07-07 10:00:00",
        "actor": "系统",
        "action": "已进入采购处理"
      }
    ]
  }
}
```

## 4. 后端同步建议（复用采购系统）

1. **定时任务**（5–10 分钟）：按 shop 增量拉 Admin `POST /order/listOrderDetail`。  
2. **多桶并集**（勿只查单一 `goodsStatus`）：复制采购 `pending_procurement_admin_filters` + `QUEUE_GOODS_STATUS_BUCKETS`（`tangbuy-procurement-api/app/services/orders/queue_filters.py`）。  
3. **映射**：每条 `order.items[]` 调与 `map_admin_line` 等价的 Java 方法，再 **投影为 §2 白名单**。  
4. **落库**：`outerOrderId` + `procurementLine` JSON + `upd_time`；列表接口读出。  
5. **商品图/标题**：可叠加 `listByGoodsIds` 快照（仍不落 hsCode）。

## 5. 前端行为（已实现）

- 有 `procurementLine` → `applyProcurementSnapshot` 覆盖 Tab 状态（优先于 Shopify `deriveStatus`）。  
- 对用户展示 **履约阶段**（待下单 → 待支付 → 处理中 → **已发货** → 到仓 → 发出 → 妥投），见 `merchant-fulfillment-phase.ts`。  
- 无快照 → 保持现有 Shopify 头启发式 + mock 回退逻辑。

## 6. 验收清单

- [ ] `easybrandkit` 店铺至少 1 单返回非空 `procurementLine`  
- [ ] `ord_line_stat` 从 23→22→5→30 变化时，商家中心 Tab 随之变化（无需改前端）  
- [ ] 响应中不出现 `pur_prc` / `buyer` / `benefit*`  
- [ ] `outerOrderId` 与 binding/lines 接口一致
