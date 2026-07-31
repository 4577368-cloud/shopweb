# Bundle 子功能（Fixed Product Bundle）

> 隶属于 Tangbuy AI Sourcing / 60s，**不是**独立 Shopify App。  
> 折扣 Function、批量组套见分期计划；本目录代码与匹配/上架主路径解耦，便于合并主仓。

## 入口

商品关联 · Shopify 商品卡 footer：「组套装」/「编辑套装」→ `BundleComposerDrawer`。

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

## 前端

- [`src/lib/bundle/api.ts`](../src/lib/bundle/api.ts)
- [`src/components/select/bundle-composer-drawer.tsx`](../src/components/select/bundle-composer-drawer.tsx)
