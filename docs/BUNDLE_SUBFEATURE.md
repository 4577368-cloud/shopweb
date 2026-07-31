# Bundle 子功能（Fixed Product Bundle）

> 隶属于 Tangbuy AI Sourcing / 60s，**不是**独立 Shopify App。  
> 折扣 Function、批量组套见分期计划；本目录代码与匹配/上架主路径解耦，便于合并主仓。

## 入口

商品关联 · Shopify 商品卡 footer：「组套装」/「编辑套装」→ `BundleComposerDrawer`。  
已组套（ACTIVE / STALE）且存在 `parentProductId` 时，旁侧 icon-only「在 Shopify 打开」→ Admin 父商品页。

## API（plugin）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/plugin/bundle/feature?shopName=` | `BundlesFeature` |
| GET | `/api/plugin/bundle/status-map?shopName=` | 列表卡状态 |
| GET | `/api/plugin/bundle/{id}?shopName=` | 详情 |
| POST | `/api/plugin/bundle/create` | `productBundleCreate` + 轮询 |

## 语义

- 在 Shopify **新建**固定套装父商品；当前卡片商品作为默认组件，须再选 ≥1 件。
- 组件编辑权归本 App（平台规则）。
- 表：`shop_product_bundle`。

## P1 · Webhook 状态

`products/delete` / `products/update` 经现有 Shopify webhook handler 调用 `ShopBundleService`（仅 `managed_by_app=1`）：

| 事件 | 条件 | 状态 |
|------|------|------|
| delete | id = parent | `DISSOLVED`（不再出现在 status-map） |
| delete | id ∈ components / context | `STALE` |
| update | id = parent 或 component，且当前 `ACTIVE` | `STALE`（`synced_at` 后 180s 内忽略，避免自写回声） |

前端：窗口 focus + 约 60s 轮询重拉 `status-map`；抽屉对 STALE 显示提示；已被其他套装占用的商品不可选。

## 前端

- [`src/lib/bundle/api.ts`](../src/lib/bundle/api.ts)
- [`src/components/select/bundle-composer-drawer.tsx`](../src/components/select/bundle-composer-drawer.tsx)
