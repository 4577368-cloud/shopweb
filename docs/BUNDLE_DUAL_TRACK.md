# 套装双轨（Tangbuy Fixed Kit + Same-Product Combo）

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
2. ACTIVE 后：拷图/详情、设 ACTIVE、父商品视为「套装货源」（不重匹配）。
3. 父商品 metafield：
   - `tangbuy_bundle.components_json` — 组成列表（标题、数量、productId），供主题 / App block 展示。
   - `tangbuy_bundle.discount_percent` — 结账折扣（Function 上线后）。
4. 组件清单权威源：Tangbuy「编辑套装」；Admin 打开父商品改装修。

**分期**

| 期 | 内容 |
|----|------|
| 已完成 | create/update/dissolve、变体 pin、FAILED 重试、父商品货源语义、装修 enrich |
| 进行中 | composition metafield；入口文案标明「跨商品 · 新建父商品」 |
| 下一步 | Theme App Block「套装含…」；可选 Online Store publish |

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

### B3 · 赠品福利（可选后置）

- 面膜作为赠品：满条件送；与 Fixed Kit 分开，避免和「可售组合」混按钮。
- 实现：Free gift / Discount Function；另入口「赠品规则」。

### 轨 B metafield 约定（草稿）

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

Function 未部署前：UI 可保存配置，结账折扣不生效，界面标明「规则已保存，结账折扣待开通」。

## 入口信息架构

商品卡 footer 仍用一个入口，打开后先选轨：

1. **跨商品套装** — 现有 composer（新建父商品）
2. **同商品组合** — B1/B2 配置面板（不新建商品）

文案禁止再用笼统「组套装」暗示两种都是新建父商品。

## 明确不做（现阶段）

- BYOB / 购物车随意搭配（Cart Transform）
- 把轨 B 伪装成 `productBundleCreate` 父商品
- 给套装父商品再绑一个虚假单一货源

## 验收

| 场景 | 通过标准 |
|------|----------|
| A 跨商品 | 父商品有图/详情；Tangbuy 可编辑组件；订单按组件货源展开 |
| A PDP | metafield 含组成；主题可读（block 可后补） |
| B 件数 | 原商品上可保存「买 N 件折扣」；不出现新镜像商品 |
| B 双规格 | 原商品上可保存两 variant 组合配置 |
| 选错防护 | 父商品卡不出现「查找候选」 |
