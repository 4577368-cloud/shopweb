# 套装双轨（Tangbuy Fixed Kit + Same-Product Combo）

> **入口已统一为 Bundle Hub**（见 [`BUNDLE_HUB.md`](./BUNDLE_HUB.md)）。本文保留为 Fixed Kit / 同商品组合的实现细节参考。
>
> 隶属于 60s / AI Sourcing，不是独立 Shopify App。  
> 目标：**两条都要**——跨商品可独立售卖的组合，与同商品上的组合价/多规格组合。

## 产品对照

| 轨 | 商家心智 | Shopify 模型 | 顾客看到 |
|----|----------|--------------|----------|
| **A · 跨商品套装** | 洗发水 + 面膜 → 一个可售组合 | `productBundleCreate` **新建父商品**；组件扣库存 | 父商品 PDP；详情列出组成 |
| **B · 同商品组合** | 同款 2 件更便宜；上衣+裤子两规格；或赠品福利 | **不新建父商品**；挂在原商品 metafield + 折扣 Function / 赠品 Function | **仍在原商品详情页** |

A 解决「独立礼盒 SKU」；B 解决「原 PDP 上的组合价 / 多规格 / 赠品」，互不替代。

## 轨 A（已有主路径 · 继续增强）

1. 创建 Fixed Bundle 父商品（须 ≥1 个其他已绑定组件）。
2. ACTIVE 后：拷图/详情、设 ACTIVE、父商品视为「套装货源」（不重匹配）；**自动**打 Shopify tag `tangbuy-kit` + metafield `tangbuy_bundle.is_kit=true`。
3. 父商品 metafield：
   - `tangbuy_bundle.components_json` — 组成列表（标题、数量），供主题 App Block 展示。
   - `tangbuy_bundle.is_kit` — boolean，供 Block / Liquid 判断。
   - `tangbuy_bundle.discount_percent` — 结账折扣（Discount Function）。
4. 组件清单权威源：Tangbuy「编辑套装」；Admin 打开父商品改装修。
5. 解散套装：删除父商品前清 tag + `is_kit`。

**分期**

| 期 | 内容 |
|----|------|
| 已完成 | create/update/dissolve、变体 pin、FAILED 重试、父商品货源语义、装修 enrich、kit tag、composition metafield |
| 已完成 | Theme App Block「套装组成」；同商品组合 / 赠品入口 |

## 轨 B（新建 · 同商品组合）

**不调用 `productBundleCreate`。** 配置写在**当前商品**上。

### B1 · 件数优惠（同 SKU 多件）

- 配置：数量门槛 + 折扣%（例：买 2 件 9 折）。
- 实现：商品 metafield `tangbuy_combo` + 产品折扣 Function（复用/扩展 `extensions/bundle-discount`）。
- UI：在组合弹窗选「同商品组合 → 件数优惠」。

### B2 · 多规格组合（同商品两 variant）

- 配置：variant A + variant B（例：上衣色码 + 裤子色码）+ 套装价或折扣。
- 实现优先：metafield 描述组合 + Function 校验加购；或后续 `productVariantRelationshipBulkUpdate` / variant fixed bundle。
- UI：选两个规格 + 成交价。

### B3 · 赠品福利（独立入口）

- 商品卡 footer **「赠品规则」**（与组套装并列，不进双轨 picker）。
- 首版：满件数门槛 + 赠品商品/规格 → metafield `tangbuy_gift.rule`。
- 结账自动加赠品行：Function 迭代（Phase 2）；Phase 1 只存规则。

### 轨 B metafield 约定

Namespace `tangbuy_combo`，key `config`（json）：

```json
{
  "kind": "qty_discount" | "variant_pair",
  "qty": 2,
  "discountPercent": 10,
  "variantIds": ["gid://.../1", "gid://.../2"],
  "label": "买2件更优惠"
}
```

赠品 `tangbuy_gift.rule`：

```json
{
  "kind": "qty_gift",
  "triggerProductId": "...",
  "minQty": 1,
  "giftProductId": "...",
  "giftVariantId": "...",
  "giftQty": 1,
  "label": "送面膜"
}
```

## 入口信息架构

| 入口 | 行为 |
|------|------|
| **组套装** | 打开后先选轨：跨商品套装 / 同商品组合 |
| **赠品规则** | 独立抽屉，不进双轨 |

文案禁止再用笼统「组套装」暗示两种都是新建父商品。

---

## 商家配置一页纸

1. **60s 商品关联**：商品卡 →「组套装」→ 跨商品套装 → 保存（自动带「套装」标签 / `tangbuy-kit`）。
2. **主题编辑器加 Block**（店铺级，一次性）：
   - 在线商店 → 主题 → **自定义**
   - 打开 **商品** 模板
   - **添加区块** → Apps → **60s / Tangbuy · 套装组成**（`Kit components`）
   - 拖到标题/加购附近 → 保存
3. **结账折扣（Partner / 运维，一次性）**：见 [`docs/BUNDLE_DISCOUNT_DEPLOY.md`](./BUNDLE_DISCOUNT_DEPLOY.md) — `shopify app deploy` + Admin 创建 Automatic app discount。
4. **同商品组合 / 赠品**：商品卡对应入口保存即可；不影响 Tangbuy 采购成本。

---

## 明确不做（现阶段）

- BYOB / 购物车随意搭配（Cart Transform）
- 把轨 B 伪装成 `productBundleCreate` 父商品
- 给套装父商品再绑一个虚假单一货源
- 为折扣改造 Tangbuy 待下单/采购金额
- 要求运营在 Admin 手打套装 tag

## 验收

| 场景 | 通过标准 |
|------|----------|
| A 跨商品 | 父商品有图/详情/tag；Tangbuy 可编辑组件；订单按组件货源展开 |
| A PDP | metafield 含组成；主题 App Block 可展示 |
| B 件数 | 原商品上可保存「买 N 件折扣」；不出现新镜像商品 |
| B 双规格 | 原商品上可保存两 variant 组合配置 |
| 赠品 | footer 独立入口；规则写入 `tangbuy_gift.rule` |
| 选错防护 | 父商品卡不出现「查找候选」 |
