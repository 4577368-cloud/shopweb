# Bundle 子功能（Fixed Product Bundle）

> 详见双轨说明：[`BUNDLE_DUAL_TRACK.md`](./BUNDLE_DUAL_TRACK.md)。  
> 隶属于 Tangbuy AI Sourcing / 60s，**不是**独立 Shopify App。  
> 折扣 Function 脚手架见 `extensions/bundle-discount/`（**未部署**，跨商品折扣 UI 暂隐藏；同商品组合可先存 metafield）。

## 入口

商品关联 · Shopify 商品卡 footer：「组套装」/「编辑套装」/「重新组套」→ `BundleComposerDrawer`（居中弹窗：左套装信息+商品表，右选品列表）。  
已组套（ACTIVE / STALE）且存在 `parentProductId` 时，旁侧 icon-only「在 Shopify 打开」→ Admin 父商品页。

抽屉侧约束：

- 当前商品须已绑定货源（`bound` + `tangbuyProductId`，且 `bindStatus` 为空或 `ACTIVE`）才可提交。
- 候选组件未绑定时禁用，文案 `bundle.needBinding`。
- 编辑 ACTIVE/STALE：打开时 `GET /bundle/{id}` 回填标题、售价、组件数量与 `variantId`；提交走 `update`。
- FAILED：CTA 为「重新组套」；回填上次配置后走 **create**（不调用 update，避免假编辑）。
- 提交：新建/更新均传 `contextVariantId`（主商品规格）与 `components[].variantId`；多规格未选时拦截。
- 折扣 `%`：Function 未上线前不传 `discountPercent`、不展示输入。
- **套装父商品卡片**：`asParent` 时视为「套装货源」——不进未匹配/查找候选/图搜批量；履约按组件绑定展开，禁止再给父商品另选货源。
- **父商品装修**：创建/更新 ACTIVE 后自动从主商品拷贝详情 HTML + 主图/图库，并设为 `ACTIVE`（`productBundleCreate` 本身不支持图/详情）。
- 本 App 托管的套装可「解散」→ `dissolve`；Shopify 父商品删除失败则硬失败（已不存在除外）。
- 毛利估算：绑定 `offerPrice`（CNY）经 `purchase-cost-display` 换算后求和，对照上架价。

> `ShopMirrorProduct` 列表行无 variants；选中组件后会 `getShopProductDetail` 拉取变体并展示选择器（多 SKU 时）。

## API（plugin）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/plugin/bundle/feature?shopName=` | `BundlesFeature` |
| GET | `/api/plugin/bundle/status-map?shopName=` | 列表卡状态 |
| GET | `/api/plugin/bundle/{id}?shopName=` | 详情（编辑/失败重试回填） |
| POST | `/api/plugin/bundle/create` | `productBundleCreate` + 轮询；body 含 `contextVariantId?`、`components[].variantId?` |
| POST | `/api/plugin/bundle/update` | 更新托管套装（拒绝 FAILED）；含 `contextVariantId?` |
| POST | `/api/plugin/bundle/{id}/dissolve?shopName=` | 解散托管套装（父商品删除失败则 abort） |

## 语义

- 在 Shopify **新建**固定套装父商品；当前卡片商品作为默认组件，须再选 ≥1 件。
- 组件编辑权归本 App（平台规则）；`managedByApp` 才可 dissolve / update。
- 表：`shop_product_bundle`。
- 父商品 metafield：`tangbuy_bundle.discount_percent`（Function 上线后再写入；当前前端不传折扣）。

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

**尚未接入 App 部署流水线**；需在 Shopify Partner 侧挂载 Automatic discount + Function。上线前 UI 隐藏折扣输入。

## 前端

- [`src/lib/bundle/api.ts`](../src/lib/bundle/api.ts)
- [`src/components/select/bundle-composer-drawer.tsx`](../src/components/select/bundle-composer-drawer.tsx)
- [`src/components/select/shop-products-panel.tsx`](../src/components/select/shop-products-panel.tsx)（传入 `bindings` / `pricingTemplate`）
