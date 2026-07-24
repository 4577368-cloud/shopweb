# 开店流程 · 变更记录（回溯用）

按时间倒序记录**已提交**的开店相关改动。出问题时用 `git show <commit>` / `git revert <commit>` 对照本表。

| 日期 | Commit / 定位 | 摘要 | 涉及路径 | 行为变化 | 回溯 |
|------|--------|------|----------|----------|------|
| 2026-07-24 | **`65ccf9e`** | **SKU 对齐 H4–H6**：静默对齐/滚动 + Agent 预览执行 + scan/result 视图 | `use-sku-align-auto-align.ts`、`use-sku-align-agent-commands.ts`、`sku-align-scan-view.tsx`、`sku-align-result-body.tsx`、`sku-align/page.tsx` | **无** | `git revert 65ccf9e` |
| 2026-07-24 | **`2218107`** | **SKU 对齐 H2+H3**：mirror 加载 + 进页扫描仪式 | `use-sku-align-mirror-load.ts`、`use-sku-align-entry.ts`、`sku-align/page.tsx` | **无** | `git revert 2218107` |
| 2026-07-24 | **`6fb5ebc`** | **Onboarding E1**：shop auth 恢复 + workflow 进度 hook | `use-onboarding-shop-auth.ts`、`use-onboarding-workflow-progress.ts`、`onboarding-context.tsx` | **无** | `git revert 6fb5ebc` |
| 2026-07-24 | **`a62c402`** | **物流页 Step 6**：模板/完成度/onboarding 桥接 + decision workspace props | `use-logistics-page-actions.ts`、`use-logistics-decision-workspace-props.ts`、`logistics/page.tsx` | **无** | `git revert a62c402` |
| 2026-07-24 | **`9108ed2`** | **物流页 Step 5**：报价/accept/pipeline → `use-logistics-quote-estimate` | 见上 | **无** | `git revert 9108ed2` |
| 2026-07-24 | **`8774c2b`** | **物流页 Step 4**：mirror 加载 + agent accept_all_ready hook | `use-logistics-mirror-load.ts`、`use-logistics-agent-commands.ts`、`default-template.ts`、`logistics/page.tsx` | **无** | `git revert 8774c2b` |
| 2026-07-24 | **`e3233d6`** | **物流页 Step 3**：workflow body + setup + decision workspace | `logistics-workflow-*.tsx`、`logistics/page.tsx` | **无** | `git revert e3233d6` |
| 2026-07-24 | **`b04bf92`** | **物流页 Step 2**：workflow 导航 hook | 见 OPENING_FLOW_UPDATES | **无** | `git revert b04bf92` |
| 2026-07-24 | **`2690d05`** | **物流页 Step 1**：`?step=` hook + page-constants | 见上 | URL 走 locale 路径 | `git revert 2690d05` |
| 2026-07-24 | **`c27ccb4`** | **产品页 Step 2–9**（与 Step 1 合看开店选品拆页） | `use-products-*`、`products-page/*`、`products/page.tsx` | **无** | `git revert c27ccb4`（含 Step 2–9） |
| 2026-07-24 | **`5611a44`** | **产品页 Step 1**：常量/Tab hook/扫描视图 | 见 OPENING_FLOW_UPDATES 脚注 | **无** | `git revert 5611a44` |
| 2026-07-24 | `d7bf222` | 批次 A+B：删 3 dead 组件 + 商品描述 HTML sanitize + 审计文档 | `OPENING_FLOW_AUDIT.md`、`sanitize-product-html.ts`、`shop-product-detail-drawer.tsx`、删 `match-compare-row` 等 | 抽屉只读描述经白名单过滤；无路由变化 | `git revert d7bf222` |

## Step 8 细节（便于 diff 对照）

**抽出模块**

- 定价模板 state / demo reset / 保存清空 → `src/hooks/use-products-pricing.ts`
- 焦点商品 + filter preset + AI 字段编辑 ref → `src/hooks/use-products-focus.ts`
- 批量关联结束（force refresh、baseline、toast）→ `src/lib/products/batch-link-finish.ts`

**未改**

- Tab 壳、rail、三态授权/扫描/结果 UI 仍在 page

**建议验证**：`?resetPricingGuide=1`、`?previewPricingGuide=1`、定价抽屉、批量关联完成 toast；`npx tsc --noEmit -p tsconfig.json`

## Step 7 细节（便于 diff 对照）

**抽出模块**

- PageContext / `applyAgentAction` / intent / focus / highlight → `src/hooks/use-products-agent-rail.ts`
- Copilot command 预览生成器 + 执行器 + AI 字段编辑消费 → `src/hooks/use-products-commands.ts`
- `resolveTitleCopyStyle` → `src/lib/products/resolve-title-copy-style.ts`

**未改**

- 定价模板 CRUD、Shop/Catalog tab 编排、batch link 回调仍在 page

**建议验证**：侧栏 Agent 快捷操作、待确认批量 ack、文案/价格/上下架命令确认流、寻源刊登；`npx tsc --noEmit -p tsconfig.json`

## Step 6 细节（便于 diff 对照）

**抽出模块**

- `phase`、`scanHandoff`、`finishToResult`、`exitScanToProducts`、`restartScan`
- 店铺切换 bootstrap（跳过仪式 / resume job / startScan）
- 扫描完成 dwell → `finishToResult`
- 结果页 `consumeScanHandoff` + `visibilitychange` 静默 `loadSummary`
→ `src/hooks/use-products-entry.ts`

**未改**

- Copilot command、`applyAgentAction` 等大段 handler 仍在 page
- `use-products-mirror` 仅负责数据加载（visibility 已迁至 entry）

**建议验证**：首次进页扫描、跳过仪式直进结果、扫描中退出、结果页切后台再回前台、`重新扫描`；`npx tsc --noEmit -p tsconfig.json`

## Step 5 细节（便于 diff 对照）

**抽出模块**

- `summary` / `shopProducts` / `bindingsMap`、`loadSummary`、`syncSummaryFromShopData`、`mirrorRefreshSignal`、`refreshProductsQuietly` → `src/hooks/use-products-mirror.ts`（Step 6 后 visibility 在 entry）

**未改**

- 扫描进结果、店铺 bootstrap effect 仍在 `SelectContent`（Step 6 已外置）
- Copilot command、agent handlers 仍在 page

**建议验证**：进页缓存命中、切 tab 回前台刷新、批量关联后 `force` 刷新、定价模板随 mirror 拉取；`npx tsc --noEmit -p tsconfig.json`

## Step 4 细节（便于 diff 对照）

**抽出模块**

- 批量关联 state / enqueue → `src/hooks/use-products-batch-link.ts`
- 上新 baseline / stats → `src/hooks/use-products-new-arrivals.ts`
- 顶栏汇总数字（summary 或 mirror peek）→ `src/lib/products/display-metrics.ts`

**未改**

- `loadSummary`、mirror bootstrap、扫描进结果、Copilot command 仍在 `SelectContent`

**建议验证**：shop tab 批量关联、上新 CTA、Tab 计数与汇总条数字；`npx tsc --noEmit -p tsconfig.json`

## Step 3 细节（便于 diff 对照）

**抽出模块**

- `filtersMountEl` state + portal 宿主 + `CatalogPublishPanel` → `products-catalog-tab.tsx`

**未改**

- `filterPresetRequest` / `filterSummary` state 仍在 page（Copilot / PageContext）

**建议验证**：`/zh/products?tab=catalog` — 筛选条位置、刊登、关联跳转。

## Step 2 细节（便于 diff 对照）

**抽出模块**

- 顶栏搜索 / 批量关联 / 跳 SKU → `products-page-header-actions.tsx`
- Shop Tab：`SmartSourcingSummaryBar` + `ShopProductsPanel` → `products-shop-tab.tsx`（`summary` + `panel` props）

**未改**

- Catalog tab 仍在 `page.tsx`；state/handlers 仍在 `SelectContent`

**建议验证**

```bash
npx tsc --noEmit -p tsconfig.json
# shop tab：汇总条、筛选、商品卡、批量关联、搜索框
```

## Step 1 细节（便于 diff 对照）

**抽出模块**

- `productsEntryShouldSkipCeremony`、`SCAN_FINISH_DELAY_MS`、`ProductsSummary` → `src/lib/products/page-constants.ts`
- URL `?tab=shop|catalog` ↔ state → `src/hooks/use-products-page-tab.ts`
- `phase === "scan"` UI → `src/components/select/products-page/products-scan-view.tsx`

**未改**

- Catalog tab 仍在 `page.tsx`（Step 2 后 shop 区已外置）
- mirror 加载、扫描进结果、Copilot command 仍在 `SelectContent`（Step 4 后 batch link / 上新已外置 hook）

**建议验证**

```bash
npx tsc --noEmit -p tsconfig.json
# /zh/products、?tab=catalog、扫描进结果页
```

---

_新条目请插在表首，并写清「行为变化」与「回溯」命令。_
