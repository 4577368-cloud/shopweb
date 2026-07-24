# 开店流程 · 变更记录（回溯用）

按时间倒序记录**已提交**的开店相关改动。出问题时用 `git show <commit>` / `git revert <commit>` 对照本表。

| 日期 | Commit / 定位 | 摘要 | 涉及路径 | 行为变化 | 回溯 |
|------|--------|------|----------|----------|------|
| 2026-07-24 | **`5611a44`** | **产品页 Step 1**：常量/Tab hook/扫描视图外置 | `products/page.tsx`、`lib/products/page-constants.ts`、`hooks/use-products-page-tab.ts`、`components/select/products-page/products-scan-view.tsx`、`OPENING_FLOW_AUDIT.md`、`OPENING_FLOW_UPDATES.md` | **无**（纯重构，扫描仪式与 `?tab=` 逻辑等价） | `git revert 5611a44` |
| 2026-07-24 | `d7bf222` | 批次 A+B：删 3 dead 组件 + 商品描述 HTML sanitize + 审计文档 | `OPENING_FLOW_AUDIT.md`、`sanitize-product-html.ts`、`shop-product-detail-drawer.tsx`、删 `match-compare-row` 等 | 抽屉只读描述经白名单过滤；无路由变化 | `git revert d7bf222` |

## Step 1 细节（便于 diff 对照）

**抽出模块**

- `productsEntryShouldSkipCeremony`、`SCAN_FINISH_DELAY_MS`、`ProductsSummary` → `src/lib/products/page-constants.ts`
- URL `?tab=shop|catalog` ↔ state → `src/hooks/use-products-page-tab.ts`
- `phase === "scan"` UI → `src/components/select/products-page/products-scan-view.tsx`

**未改**

- `ShopProductsPanel` / `CatalogPublishPanel` 仍 inline 在 `page.tsx`
- mirror 加载、batch link、Copilot command 仍在 `SelectContent`

**建议验证**

```bash
npx tsc --noEmit -p tsconfig.json
# /zh/products、?tab=catalog、扫描进结果页
```

---

_新条目请插在表首，并写清「行为变化」与「回溯」命令。_
