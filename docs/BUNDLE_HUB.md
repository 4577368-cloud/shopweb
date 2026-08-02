# 套装与组合（Bundle Hub）

商家在 **商品关联 → 套装与组合** 一个入口配置全部玩法；商品卡只保留单一「套装」入口（不再并列「赠品规则」）。

## 玩法

| 玩法 | 商家心智 | Shopify | 采购 |
|------|----------|---------|------|
| **固定套装** `fixed_kit` | 固定组合，新建可售父商品 | `productBundleCreate` + `tangbuy_bundle.*` | 父行 `expandBundleParents` |
| **任选 N 件** `mix_match` | 池内任选满件一口价/折扣% | `tangbuy_mix.rule` + Discount Function | **多行**，按行采 |
| **单品玩法** `product_offer` | 件数/双规格折扣或满件赠品 | `tangbuy_combo` / `tangbuy_gift` | 触发品与赠品各行 |
| **自组礼盒** `byob` | 槽位自选（主品/配件/赠品） | `tangbuy_byob.rule` + Theme Block | **多行**，按行采 |

## 入口

1. **店铺级**：商品关联页 Tab「套装与组合」— 活动列表 → 新建选玩法 → 向导。
2. **商品卡**：单一「套装」；已组固定套装显示「编辑套装」。点击跳进 Hub（可预填该商品）。

## 采购原则（不变）

- Fixed Kit：订单父行展开为组件行后再绑定/采购。
- Mix / BYOB / 赠品触发：结账保持多商品行，与普通多商品订单同一套绑定与采购。
- **不要**为 Mix/BYOB 再建父货源（除非将来有强需求）。

## 配置与部署

- 规则只在 60s 配置，不进主题编辑器手填池。
- Theme Block（套装组成 / BYOB）与 Discount Function 变更后需 `shopify app deploy`。
- 后端活动表：`shop_bundle_campaign`；Fixed 明细仍用 `shop_product_bundle`。

## 相关文档

- 历史双轨说明：`BUNDLE_DUAL_TRACK.md`（心智已收进 Hub，该文作子玩法参考）
- Function 部署：`BUNDLE_DISCOUNT_DEPLOY.md`
