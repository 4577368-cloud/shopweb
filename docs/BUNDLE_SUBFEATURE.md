# Bundle 子功能（Fixed Product Bundle）

> 隶属于 Tangbuy AI Sourcing / 60s，**不是**独立 Shopify App。  
> 折扣 Function 脚手架见 `extensions/bundle-discount/`；批量组套见分期计划。本目录代码与匹配/上架主路径解耦，便于合并主仓。

## 入口

商品关联 · Shopify 商品卡 footer：「组套装」/「编辑套装」→ `BundleComposerDrawer`（居中弹窗：左套装信息+商品表，右选品列表）。  
已组套（ACTIVE / STALE）且存在 `parentProductId` 时，旁侧 icon-only「在 Shopify 打开」→ Admin 父商品页。

抽屉侧约束：

- 当前商品须已绑定货源（`bound` + `tangbuyProductId`，且 `bindStatus` 为空或 `ACTIVE`）才可提交。
- 候选组件未绑定时禁用，文案 `bundle.needBinding`。
- 编辑 ACTIVE/STALE：打开时 `GET /bundle/{id}` 回填标题、售价、折扣%、组件数量与 `variantId`。
- 提交：编辑走 `update`，新建走 `create`；可选 `discountPercent`（0–100）；有 `variantId` 时一并提交。
- 本 App 托管的套装可「解散」→ `dissolve` → 同步镜像 + 刷新 status-map。
- 毛利估算：用绑定的 `offerPrice`（CNY）经 `purchase-cost-display` 换算后求和，对照父售价与折扣%。

> `ShopMirrorProduct` 列表行无 variants；选中组件后会 `getShopProductDetail` 拉取变体并展示选择器（多 SKU 时）。

## API（plugin）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/plugin/bundle/feature?shopName=` | `BundlesFeature` |
| GET | `/api/plugin/bundle/status-map?shopName=` | 列表卡状态 |
| GET | `/api/plugin/bundle/{id}?shopName=` | 详情（编辑回填） |
| POST | `/api/plugin/bundle/create` | `productBundleCreate` + 轮询；body 含 `discountPercent?`、`components[].variantId?` |
| POST | `/api/plugin/bundle/update` | 更新托管套装标题/价/折扣/组件 |
| POST | `/api/plugin/bundle/{id}/dissolve?shopName=` | 解散托管套装 |

## 语义

- 在 Shopify **新建**固定套装父商品；当前卡片商品作为默认组件，须再选 ≥1 件。
- 组件编辑权归本 App（平台规则）；`managedByApp` 才可 dissolve / update。
- 表：`shop_product_bundle`。
- 父商品 metafield：`tangbuy_bundle.discount_percent`（由后端写入；前端传 `discountPercent`）。

## P1 · Webhook 状态

`products/delete` / `products/update` 经现有 Shopify webhook handler 调用 `ShopBundleService`（仅 `managed_by_app=1`）：

| 事件 | 条件 | 状态 |
|------|------|------|
| delete | id = parent | `DISSOLVED`（不再出现在 status-map） |
| delete | id ∈ components / context | `STALE` |
| update | id = parent 或 component，且当前 `ACTIVE` | `STALE`（`synced_at` 后 180s 内忽略，避免自写回声） |

前端：窗口 focus + 约 60s 轮询重拉 `status-map`；抽屉对 STALE 显示提示；已被其他套装占用的商品不可选。  
创建 / 更新 / 解散后：`syncShopProducts` → `load({ silent, force })` → `refreshBundleStatus`。

## Discount Function（脚手架）

路径：[`extensions/bundle-discount/`](../extensions/bundle-discount/)

- Target：`purchase.product-discount.run`
- Input：cart line → `ProductVariant.product.metafield(namespace: "tangbuy_bundle", key: "discount_percent")`
- 行为：对有有效正百分比 metafield 的行应用 percentage product discount

尚未接入 App 部署流水线；需在 Shopify Partner 侧挂载 Automatic discount + Function。

## 前端

- [`src/lib/bundle/api.ts`](../src/lib/bundle/api.ts)
- [`src/components/select/bundle-composer-drawer.tsx`](../src/components/select/bundle-composer-drawer.tsx)
- [`src/components/select/shop-products-panel.tsx`](../src/components/select/shop-products-panel.tsx)（传入 `bindings` / `pricingTemplate`）
