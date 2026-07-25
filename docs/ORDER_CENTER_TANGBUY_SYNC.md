# 订单中心对接 Tangbuy 采购系统 — 接口分析与字段透出方案

> **目标**：识别 Shopify 订单支付后进入采购流程时的真实采购订单状态，将其映射到前台订单中心，让用户看到订单当前所处的阶段。本文档汇总目前收到的接口与状态枚举，并给出字段透出/屏蔽判断、状态映射方案、后端改造建议。
>
> **范围**：围绕订单中心优化，tab 分类保持不变（all / pendingOrder / pendingPayment / preparing / shipped / delivered / canceled）。判断每个接口哪些字段可暴露给前台用户、哪些是 tangbuy 内部信息（如真实采购成本）不可透出。
>
> **认证**：admin token 与 add 商品接口共用同一个。

---

## 一、用户原始需求

1. Shopify 订单支付后 → 进入 tangbuy 采购流程
2. 采购订单有一套真实的状态流转（含订单状态 + 物流状态 + 各时间点）
3. 目标：把采购侧真实状态映射到前台订单中心，让用户看到订单"现在到哪了"
4. **优化围绕订单中心进行**，tab 分类不变
5. 给出的多个接口需逐个判断：
   - 哪些适合前台用户使用
   - 哪些是 tangbuy 内部信息（如实际采购某商品花了多少钱）不可透出
6. 判断哪些字段需要体现出来、如何合理展示
7. 判断后端是否需要更新代码来监控这部分内容

---

## 二、接口清单（截至目前已收到）

| # | 接口 | 方法 | 用途 | 判断结论 |
|---|---|---|---|---|
| 1 | `/prod-api/resource/goodsCategory/listByGoodsIds` | POST | 根据商品 ID 查询类目信息 | **混合型** — 部分字段可透出 |
| 2 | `/prod-api/order/changeItemCategory` | POST | 更新商品类目（海关申报用） | **纯内部** — 不暴露给前台 |
| 3 | `/prod-api/order/listOrderDetail` | POST | 查询采购订单详情列表 | **待响应体** — 请求体已知 |

---

## 三、接口 1：`listByGoodsIds`（根据商品 ID 查类目）

### 请求

```
POST https://admin.tangbuy.cc/prod-api/resource/goodsCategory/listByGoodsIds
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json;charset=UTF-8

{
  "goodsIds": ["204050968100896", "683451269189"]
}
```

### 响应示例

```json
{
  "code": 200,
  "msg": null,
  "data": [
    {
      "sourceGoodsId": "alibaba_683451269189",
      "storeSource": "alibaba",
      "goodsId": "683451269189",
      "itemNo": "TI26070000091",
      "goodsName": "姿趣情趣开档丝袜子女免脱可撕诱惑性感内衣调情床上黑丝批发5003",
      "goodsImg": "https://cbu01.alicdn.com/img/ibank/O1CN01hEH7Oj2B2kbbLv2jG_!!2212877588281-0-cib.jpg",
      "categoryId": 50010159,
      "status": 0,
      "companyId": 100,
      "hsCodeDTO": {
        "pageNum": 1,
        "pageSize": 20,
        "orderByColumn": null,
        "isAsc": "asc",
        "cid": 50010159,
        "isParent": 2,
        "cnName": "卫衣",
        "enName": "Sweater",
        "parentId": 30,
        "providerType": "TB",
        "decCnName": "卫衣1",
        "decEnName": "Sweater1",
        "declareLevel": 1,
        "currentLevel": 2,
        "zipRate": 90,
        "hsCode": "6110200090",
        "needConfirm": 0,
        "attrId": null,
        "hotStatus": 1,
        "deName": "Sweatshirt",
        "esName": "Sudadera",
        "msName": "sweater",
        "frName": "Sweat-shirt",
        "orderBy": ""
      }
    }
  ]
}
```

### 字段判断

#### ✅ 可透出给用户的字段

| 字段 | 用途 | 前台展示位置 |
|---|---|---|
| `goodsName` | 商品名 | 订单详情商品行 |
| `goodsImg` | 商品图 | 订单详情商品行缩略图 |
| `storeSource` | 来源平台（alibaba 等） | 显示"采购自 1688/Alibaba" |
| `itemNo` | 商品货号（TI26070000091） | 作为商品识别码 |

#### ❌ 不可透出（内部字段）

| 字段 | 理由 |
|---|---|
| `sourceGoodsId` | 内部货源系统 ID |
| `categoryId` | 内部类目 ID |
| `companyId` | 公司主体 ID |
| `status` | 商品上下架状态，与订单无关 |
| `hsCodeDTO`（整个对象） | 海关申报信息（hsCode、申报中英文名、申报级别、zipRate、providerType 等）— 报关专用，用户不需要知道 |

### 使用建议

订单创建时调用此接口，把 `goodsName/goodsImg/storeSource/itemNo` 写入订单商品快照表（不存 categoryId/hsCodeDTO），作为订单详情的商品信息展示。

---

## 四、接口 2：`changeItemCategory`（更新商品类目）

### 请求

```
POST https://admin.tangbuy.cc/prod-api/order/changeItemCategory
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json;charset=UTF-8

{
  "ids": ["TI26070000095"],
  "cid": 50010159,
  "updateGoodsCategory": true
}
```

### 判断结论：**纯内部操作，不暴露给前台**

**理由**：
- 这是 tangbuy 后台设置海关类目的操作，用户既不关心也无法操作
- 请求体里的 `cid`、`updateGoodsCategory` 都是报关参数
- 走 admin token，属于后台管理操作
- 这个流程的存在意义是：Shopify 订单进入采购后，**tangbuy 后台需要先设置好类目才能报关发货**。对前台用户而言，这个阶段统一显示为"备货中"即可

### 对前台的影响

仅在状态映射上体现 — 类目未设置/设置中的订单处于"备货中"的前置阶段，用户不需要看到"设置类目中"这个细分状态。

### 后端建议

类目设置应作为**纯后台自动化任务**：
- 定时任务自动执行 `changeItemCategory`
- 失败时记录日志，不影响前台
- 不暴露任何 API 给前端

---

## 五、采购订单状态枚举（tangbuy 后台）

### 完整状态码表

| 状态码 | 常量名 | 中文语义 |
|---|---|---|
| -1 | WaitPay | 待支付 |
| 0 | General | 正常状态 |
| 1 | WaitConfirm | 待确认状态 |
| 2 | WaitPurchase | 等待补款 |
| 3 | ItemReturn | 商品退货 |
| 4 | ItemExchange | 商品换货 |
| 5 | Delivery | 已发货 |
| 6 | SeparateDelivery | 分开发货 |
| 7 | Deferred | 延期处理 |
| 8 | Signed | 已签收 |
| 9 | Arrived | 已到货 |
| 10 | InStorage | 已入库 |
| 11 | InvalidItem | 作废订单 |
| 12 | DestroyItem | 销毁商品 |
| 13 | ExceedItem | 超期订单 |
| 14 | InfoConfirm | 信息确认 |
| 15 | PayConfirm | 购买确认 |
| 16 | ReturnWait | 退货等待中 |
| 17 | ExchangeWait | 换货等待中 |
| 18 | ReturnProcess | 退货处理中 |
| 19 | ExchangeProcess | 换货处理中 |
| 20 | ReturnComplete | 退货完成 |
| 21 | ExchangeComplete | 换货完成 |
| 22 | Purchased | 已订购 |
| 23 | Pending | 处理中 |
| 24 | Cancel | 取消订购 |
| 25 | Exception | 异常订单 |
| 26 | ReturnWaitRefund | 退货等待退款 |
| 27 | ExchangeWaitDelivery | 换货等待卖家发货 |
| 28 | OutStorage | 出库中 |
| 29 | OutPackage | 出库打包完毕 |
| 30 | OutBoard | 寄送海外 |
| 31 | OutFinish | 已收到货 |
| 32 | Refusal | 拒付订单 |
| 33 | Risk | 风控审核 |
| 34 | UndoList | 撤单列表 |
| 35 | FreezeList | 冻结列表 |
| 36 | BookedFil | 预定补款 |
| 37 | WaitOut | 等待出库 |
| 38 | RefundFreeze | 退款冻结 |
| 39 | SignRefuse | 拒签商品 |
| 40 | SignRefuseComplete | 拒签完成 |
| 41 | ExceptionUnStorage | 异常未入库 |
| 42 | ExceptionInStorage | 异常已经入库 |
| 43 | ReturnItemCancel | 退货取消 |
| 44 | ExchangeItemCancel | 换货取消 |
| 45 | SignedWaitProcess | 已签收待处理 |
| 46 | BnmWaitGenerate | 巴拿马待生成 |
| 47 | BnmWaitPay | 巴拿马待支付 |
| 48 | PaySuccess | 支付完成 |
| 49 | GiveUP | 放弃商品 |
| 50 | ForceComplete | 强制完成 |
| 51 | ReturnWaitSellerAgree | 退货等待卖家同意 |
| 52 | ExchangeWaitSellerAgree | 换货等待卖家同意 |
| 53 | PackageBackVoid | 退包作废 |
| 54 | AlibabaWaitGenerate | 1688待生成 |
| 55 | AlibabaWaitPay | 1688待支付 |

---

## 六、采购状态 → 前台 OrderStatus 映射方案

### 主状态映射

前台 tab 分类保持不变：`all / pendingOrder / pendingPayment / preparing / shipped / delivered / canceled`

| 前台状态 | 采购状态码 | 采购状态语义 |
|---|---|---|
| **pendingOrder**（待下单） | `-1` WaitPay, `14` InfoConfirm, `33` Risk, `46` BnmWaitGenerate, `54` AlibabaWaitGenerate | 待支付/信息确认/风控/平台待生成 |
| **pendingPayment**（待支付） | `2` WaitPurchase, `36` BookedFil, `47` BnmWaitPay, `55` AlibabaWaitPay | 等待补款/预定补款/平台待支付 |
| **preparing**（备货中） | `0` General, `1` WaitConfirm, `7` Deferred, `10` InStorage, `15` PayConfirm, `22` Purchased, `23` Pending, `28` OutStorage, `29` OutPackage, `37` WaitOut | 正常/待确认/延期/入库/购买确认/已订购/处理中/出库中/打包完毕/等待出库 |
| **shipped**（已发货） | `5` Delivery, `6` SeparateDelivery, `30` OutBoard | 已发货/分开发货/寄送海外 |
| **delivered**（已签收） | `8` Signed, `9` Arrived, `31` OutFinish, `45` SignedWaitProcess, `48` PaySuccess, `50` ForceComplete | 已签收/已到货/已收到货/签收待处理/支付完成/强制完成 |
| **canceled**（已取消） | `11` InvalidItem, `13` ExceedItem, `24` Cancel, `32` Refusal, `34` UndoList, `49` GiveUP, `53` PackageBackVoid | 作废/超期/取消订购/拒付/撤单/放弃/退包作废 |

### 异常分支处理（主状态 + 标签双层展示）

tab 分类不变，但订单卡片上增加"异常标签"小徽章，让用户在"备货中"tab 里也能识别出"这个订单其实在退货"。

| 异常类型 | 状态码 | 主状态归入 | 前台标签 |
|---|---|---|---|
| 退货类 | `3, 16, 18, 20, 26, 43, 51` | 视进度归入 preparing/delivered/canceled | "退货中"/"已退款" |
| 换货类 | `4, 17, 19, 21, 27, 44, 52` | 视进度归入 preparing/delivered | "换货中" |
| 拒签类 | `39, 40` | canceled | "已拒签" |
| 异常类 | `25, 41, 42` | preparing（待处理） | "异常处理中" |
| 冻结类 | `35, 38` | pendingPayment | "已冻结" |
| 销毁 | `12` DestroyItem | canceled | 内部状态，不单独显示 |

---

## 七、接口 3：`listOrderDetail`（采购订单详情列表）⏳ 待响应体

### 请求（已收到）

```
POST https://admin.tangbuy.cc/prod-api/order/listOrderDetail
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json;charset=UTF-8

{
  "pageNum": 1,
  "pageSize": 10,
  "storageNo": 1,
  "buyer": null,
  "goodsStatus": 23,
  "orderStatus": 2,
  "orderByColumn": "5",
  "returnStatus": 0,
  "confirmStatus": 0,
  "eventType": 5888,
  "buyerCidList": null,
  "rangPriceItem": null
}
```

### 请求体字段初步判断

| 字段 | 含义推测 | 备注 |
|---|---|---|
| `pageNum` / `pageSize` | 分页 | 标准字段 |
| `storageNo` | 仓库编号（1 = 主仓） | 内部字段 |
| `buyer` | 采购员筛选 | 内部字段 |
| `goodsStatus` | 商品状态码（23 = 处理中） | 对应第五节状态枚举 |
| `orderStatus` | 订单状态码（2 = 等待补款） | 对应第五节状态枚举 |
| `orderByColumn` | 排序字段 | 内部字段 |
| `returnStatus` | 退货状态筛选 | 内部字段 |
| `confirmStatus` | 确认状态筛选 | 内部字段 |
| `eventType` | 事件类型位掩码（5888） | 内部字段 |
| `buyerCidList` | 采购员客户 ID 列表 | 内部字段 |
| `rangPriceItem` | 价格区间筛选 | 内部字段 |

### 判断待补充

**待收到响应体后**，再判断：
- 哪些字段可透出给前台用户（预计：订单号、商品信息、状态、物流单号、各时间点）
- 哪些字段是内部信息（预计：采购成本、供应商信息、采购员、利润等）
- 时间点字段如何映射到前台时间线

---

## 八、后端改造建议

### 需要新增

#### 1. 采购订单状态同步任务（Java `@Scheduled`）

- 定时调用 tangbuy 采购订单查询接口（`listOrderDetail` 等）
- 把采购状态码 + 各时间点写入本地订单表
- 同步频率建议：每 5-10 分钟一次（避免压力，订单状态不需要秒级实时）

#### 2. 状态映射服务

- Java 侧维护 `tangbuyStatus → frontOrderStatus` 的映射表
- 异常类状态同时写入 `exceptionTag` 字段
- 映射规则参见第六节

#### 3. 商品信息快照同步

- 订单创建时调用 `listByGoodsIds`
- 把 `goodsName/goodsImg/storeSource/itemNo` 写入订单商品快照表
- **不存** categoryId/hsCodeDTO

#### 4. 类目设置自动化任务（纯后台，不暴露 API）

- 内部定时任务自动执行 `changeItemCategory`
- 失败时记录日志，不影响前台
- 用户不可见

### 需要新增的前台 API

| API | 用途 |
|---|---|
| `GET /api/orders/{id}/tracking` | 返回映射后的状态 + 时间线 + 商品快照 |
| `GET /api/orders`（增强） | 复用现有列表接口，响应里增加 `tangbuyStatus`、`exceptionTag`、`goodsSnapshot` 字段 |

### 不可暴露给前台的接口

- `listByGoodsIds` — 后台用
- `changeItemCategory` — 后台用
- 真实采购价格、供应商信息 — 不可透出

---

## 九、待确认的问题

1. **状态映射方案是否符合预期**？尤其是"支付完成(48)"归入 delivered 是否合理（这看起来是采购侧的支付完成，不是用户侧）
2. **异常分支**用"主状态 + 标签"双层展示是否可以？还是希望新增"异常"tab？
3. **类目设置**这部分确认是纯后台自动化、对前台不可见？
4. **`listOrderDetail` 的响应体**待补充 — 收到后判断可透出字段
5. **其他接口**待补充（订单详情、物流、时间点等）

---

## 十、复用采购系统已有能力（不必从 0 映射）

商家订单中心与内部采购指挥中心共用 **Admin `listOrderDetail` → 宽表字段** 契约，实现已落在采购仓库，Shopify 侧只 port 映射层：

| 采购系统（真相源） | Shopify 订单中心 |
|---|---|
| `tangbuy-procurement-api/app/integrations/tangbuy_admin/mapper.py` | plugin Java 同步时复用同一套字段名 |
| `app/services/orders/queue_filters.py` → `resolve_order_queue` | `src/lib/order/tangbuy/procurement-queue.ts` |
| `tangbuy-procurement-web/src/lib/tangbuy/status-enums.ts` | `src/lib/order/tangbuy/status-enums.ts` |
| `ord-line-ui-mappers.ts`（内部 UI） | `src/lib/order/tangbuy/merge-order-summary.ts`（商家脱敏子集） |

**数据流**：

1. plugin 定时拉 `listOrderDetail`（多 `goodsStatus` 桶并集，见采购 `queue_filters.pending_procurement_admin_filters`）。
2. 按 shop 过滤 `pluginOrderId` / `out_ord_no`，映射为 `MerchantOrdLineSnapshot`（白名单字段，见 `ord-line-snapshot.ts`）。
3. `GET /api/plugin/order/header/list` 每条 header 附带 `procurementLine`（或走批量接口 `GET /api/plugin/order/procurement/snapshots`，见 `docs/ORDER_CENTER_PROCUREMENT_LINE_CONTRACT.md`）。
4. 前端 `mapShopOrderHeader` 自动 `applyProcurementSnapshot`，**采购状态覆盖** Shopify 头启发式 `deriveStatus`。

根目录 curl 文档（自动接单 / 1688 下单 / 预订购 / 订单回传 / 品类映射）均为 **后台作业**，不直连商家 UI；其效果通过子单 `goodsStatus` 变化体现。

### 商家侧履约阶段（对用户展示）

| 订单中心 Tab | 含义 | 典型 `goodsStatus` / 来源 |
|---|---|---|
| **待下单** | 用户（店铺顾客）**尚未支付**，最初状态 | Shopify `financialStatus` ≠ paid |
| **待支付** | 向 **Tangbuy** 支付采购款；Admin 到账后生成采购订单 | -1/-2/2/55 |
| **备货中**（文案：处理中） | 采购款已付，至 1688 发货前 | 0/22/23/54… |
| **待发货**（文案：**已发货**） | 1688 已发货 | 5/6 |
| **备货中**（文案：已到仓） | 到仓 / 入库 / 出库准备 | 8/9/10/28/29/37/58 |
| **待送达**（文案：已发出） | 寄送海外 | 30 |
| **已送达**（文案：已妥投） | 签收完成 | 31 |

实现：`src/lib/order/tangbuy/merchant-fulfillment-phase.ts`。

## 十一、后续接口接收清单

用户将继续提供以下接口，收到后逐个判断：

- [ ] `listOrderDetail` 响应体
- [ ] 物流查询接口
- [ ] 时间点/时间线接口
- [ ] 其他相关接口

---

## 附录：敏感信息处理建议

> 用户在发送 curl 时遇到了敏感词拦截问题，主要原因是 cookie 中包含 `password`、`Admin-Token` 等敏感字段名，以及大量凭证堆叠。

**发送接口时的建议格式**（只保留结构和业务字段，凭证用占位符）：

```bash
curl 'https://admin.tangbuy.cc/prod-api/xxx' \
  -H 'Authorization: Bearer <ADMIN_TOKEN>' \
  -H 'Content-Type: application/json;charset=UTF-8' \
  --data-raw '{
    "field1": "value1",
    "field2": "value2"
  }'
```

或直接发请求体 JSON + 响应体 JSON 即可，主要看字段结构。
