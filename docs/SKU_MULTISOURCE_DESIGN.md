# SKU 多货源数据模型设计（N 货源并存）

> 状态：设计稿（待评审）。对应架构决策中优先级 ②——"先做入库规范化，同时设计 N 货源数据模型，UI 可暂不展开"。
> 调研日期：2026-07-23。配合 `src/lib/sku-align/spec-canon.ts`（① 读时规范化）使用。

## 1. 目标

支持 **N 个货源各自映射不同 SKU**：
- 替换主货源（reassign 全部变体到新货源）
- 补充货源（新增货源，只覆盖缺口变体）
- N 货源并存（以上两类的泛化）

今天系统只支持 **1 主 + 至多 1 补充**（硬上限在 Java 后端）。

## 2. 现状（已确认）

**类型层**（`src/lib/sku-align-v1/types.ts`）：
- `SkuAlignProductDetail.primaryOffer?` + `supplementOffer?`（**单数**，`types.ts:127-128`）。
- `SourceRole = "PRIMARY" | "SUPPLEMENT"`（`types.ts:13`）。
- `SkuAlignCurrentBinding` 已含 `offerId` + `sourceRole` + `manualLocked`（`types.ts:76-84`）——**变体层每变体已能指向某个货源**。
- `MAX_SUPPLEMENT_SOURCES_V1 = 1`（`src/lib/sku-align-v1/state-machine.ts:18`，前端判定用；硬上限在 Java）。

**前端读取/写入点**（改 N 源必须动）：
| 位置 | 用途 |
|---|---|
| `sku-align-v1/supplement-source.ts:12` | `if (detail.supplementOffer?.offerId?.trim()) return false;` 决定"能否再加补充货源" |
| `components/sku-align/sku-product-workbench.tsx:271` | `hasSupplementOffer` 展示判断 |
| `sku-product-workbench.tsx:387-388` / `:457-458` | 把 `supplementOfferId/Url` 塞进 `ExcludedOfferContext`（候选去重） |
| `sku-align/drawer-helpers.ts:179-180,192,195,238` | `supplementOfferId/Url` 字段声明与使用 |

**Java 后端断点**（外部轨道，并行推）：
- `SkuAlignProductDetailVO.java:13`：`private SkuAlignOfferSummaryVO supplementOffer;`
- `SkuOfferScopeHelper.java:21-41`：`buildScopeJson` / `buildSupplementJson` 写死单条 SUPPLEMENT。
- `SkuAlignV1Service.java`、`SkuAlignEngineService.java` 多处（`:124-128,151-156,337-345,409-444`）。

> 注：前端这些 `.supplementOffer?.offerId` 读取若拿不到值会**静默降级为"无 supplement"**（不抛错但功能退化），所以扩 N 必须同步改前端读取点。

## 3. 提案模型

```ts
// 取代 primaryOffer + supplementOffer 单数
export type SourceRoleV2 = "PRIMARY" | "SUPPLEMENT"; // 角色可保留；N 序由 order 解决

export interface ProductSourceOffer {
  offerId: string;
  detailUrl?: string | null;
  role: "PRIMARY" | "SUPPLEMENT";
  order: number;                    // 解决 N 的排序（PRIMARY 恒为 0）
  coversVariantIds: string[];       // 该货源覆盖的变体（冗余但便于 UI/校验/去重）
}

export interface SkuAlignProductDetailV2 {
  sources: ProductSourceOffer[];     // 替代 primaryOffer + supplementOffer
  // variants 不变：SkuAlignVariantRow.currentBinding.offerId 已可指向 sources 中任一
}
```

**关键复用**：变体层 `SkuAlignCurrentBinding.offerId + sourceRole` 已存在（workbench `:775` PRIMARY / `:966` SUPPLEMENT），扩 N 时**无需改变体层**，只是货源数组化。每个变体通过其 `offerId` 指向 `sources` 中某个货源——天然支持"同一商品不同变体来自不同货源"。

## 4. 迁移策略（向后兼容）

1. **双写/双读过渡期**：`SkuAlignProductDetail` 同时保留 `primaryOffer`/`supplementOffer`（旧）与 `sources`（新）。新增 `deriveSources(detail)` 工具：
   - `sources` 存在 → 直接用；
   - 否则由 `primaryOffer` + `supplementOffer` 合成（order: PRIMARY=0, SUPPLEMENT=1）。
2. 前端读取点改为遍历 `sources`；写点（add supplement）改为 `sources.push(...)` 并经新 endpoint。
3. 先放开前端数组（UI 不展开多于 2 的复杂编辑），后端 `MAX_SUPPLEMENT_SOURCES_V1` 上限随 Java 改造一同放开。
4. 变体覆盖关系 `coversVariantIds` 可由 `variants[].currentBinding.offerId` 反推生成，减少双源不一致。

## 5. UI 暂不展开（克制原则）

- **不做**多余货源管理面板。仅在发生真实 N>1（如补充货源已加、或替换后存在多源）时，于 SKU 对照 Workbench 显示一个**紧凑"供应图"**：哪些变体来自哪个货源 + 采购价对比。
- 替换/补充的入口与今天一致（↔ 替换、＋ 补充），只是底层从"单数"变为"数组追加"。
- 不新增"货源设置"页、不新增"AI 全自动多货源"按钮。

## 6. 开放问题（评审时定）

- `SourceRoleV2` 是否还需区分 PRIMARY/SUPPLEMENT？N 源场景下角色意义弱化，可仅保留 `order` + 一个 `isPrimary` 布尔。倾向：保留角色以兼容现有 `sourceRole` 写入，order 解决 N 序。
- 缺口变体（NO_SOURCE）的"建议补充货源"逻辑是否要支持一次推荐多个？当前 `supplementGapVariants` 是单源补充，扩 N 时建议改为"按变体分组推荐"。
- Java 侧 `SkuOfferScopeHelper` 的 scope JSON 是否需要版本化？建议新增 `sources` 字段而非覆盖 `supplementOffer`，双写过渡。
