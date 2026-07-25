# 同步页 i18n 全面审查报告

> 生成时间：2026-07-23
> 范围：sync 页及相关组件（`src/app/[locale]/sync/page.tsx`、`src/components/sync/*`、`src/lib/sync/*`）引用的全部翻译键
> 方法：用 `tsx` 导入四语字典，对 5 个命名空间逐键做四语值对比 + 自动检测（缺失键 / 字面量 `${` / 同语言重复值），再人工逐值核验

## 一、覆盖范围（174 键）

| 命名空间 | 键数 | 主要使用处 |
|---|---|---|
| `sync` | 44 | page / shopify-summary-card / launch-metrics-grid / fulfillment-summary-card |
| `syncUi` | 14 | strategy-summary-card / follow-up-list / product-flip-card / launch-report-stream / sync-timeline |
| `syncCeremony` | 29 | completion-screen / progress-panel / ceremony-progress |
| `launchSummary` | 61 | assemble-launch-summary |
| `launchReport` | 26 | compose-launch-report |
| **合计** | **174** | |

## 二、核心结论：系统性损坏（比物流页严重）

物流页的损坏主要是 `en/fr/es` 错配、**zh 源正常**；而 sync 页**连 zh 源都大量是英文 PascalCase 占位桩**，并叠加键位串号、插值语法错误、变量名被翻译、甚至把 JS 表达式写进字典。

## 三、问题分类（含抽样）

### 1. zh 源未翻译（英文桩）—— 中文 UI 直接显示英文
约 90+ 键的 zh 值仍是 `"Xxx Yyy"` 形式桩，例如：
- `syncCeremony`：`completionHeading="Completion Heading"`、`enterWorkbench="Enter Workbench"`、`statProducts="Stat Products"`、`taskLogistics="Task Logistics"`、`viewSummary="View Summary"`
- `launchSummary`：`checkInLaunchList="Check In Launch List"`、`followUpBindingPendingAction="Follow Up Binding Pending Action"`、`marketsNotConfigured="Markets Not Configured"`、`timelineAi="Timeline Ai"`、`unnamedProduct="Unnamed Product"`
- `launchReport`：`defaultShopLabel="Default Shop Label"`、`demoNote="Demo Note"`、`followUpList="Follow Up List"`、`logisticsQuoted="Logistics Quoted"`
→ 中文用户会在完成页、报告流等区域看到大段英文。

### 2. 键位串号（值填错键）
- `launchSummary.followUpBindingPending*`：`Action` 键值是描述句、`Desc` 键值是"去处理"、`Title` 键值是另一句 —— 三键互串。
- 部分 `check*` 键 zh 值与 key 语义不符（如 `checkSkuComplete` zh="货源候选待确认"）。

### 3. 插值语法错误 `${...}`（本应 `{{...}}`）—— UI 原样显示 `${...}` 垃圾文本
- `sync.pricing`：`${fulfillment.logisticsConfirmed}/${fulfillment.logisticsTotal}`（整段表达式）
- `syncCeremony.progressTitle` / `statSourcesConfirmed`：`${displayPercent}%`
- `syncCeremony.taskProductsDetail` / `taskSourceLinks`：`${shownSources} / ${p.sourceLinksTotal}…`
- `launchSummary.statSourceDetail`：`${skuAligned} / ${skuTotal}…`；`statSourceLinks`：`${binding.confirmed + binding.pending} / ${binding.analyzed}…`
- `launchReport.sourcePending`：`${count}` 形式
→ 定价行、进度条、启动报告流会显示 `${...}` 原文字符串。

### 4. 变量名被机器翻译（插值失效 / 错误变形）
- `Confirmered` / `Confirmared` 错误变形（fr/es 把分词缀 `-ed` 当成可翻译词）：`mLogisticsConfirm`、`mSourceConfirmed`、`checkLogisticsConfirmed`、`taskLogisticsConfirmed`、`statLogisticsConfirmed`、`timelineAiSummaryConfirmed`、`sourceConfirmed`、`logisticsConfirmed` 等。
- es 把**插值变量名**翻译：`taskProductsDetail` 用 `shownFuentes`/`FuenteLinksTotal`（应为 `shownSources`/`sourceLinksTotal`）；`statSourceLinks` 用 `binding.Confirmared`/`Confirmered`。
→ 即使改成 `{{}}`，变量名对不上也不会插值，且会破坏数据展示。

### 5. JS 表达式写进字典（需改调用处）
- `launchSummary.statSourceLinks` = `${binding.confirmed + binding.pending} / ${binding.analyzed} Product`：i18n 引擎只支持 `{{单变量}}`，不支持表达式。需改为预计算参数 + 调用处（`assemble-launch-summary.ts`）传参。

## 四、受影响的 UI 区域
- 完成页 `completion-screen`（几乎全英文桩）
- 进度面板 `progress-panel`（`${displayPercent}%`）
- 指标网格 `launch-metrics-grid`（定价行 `${...}`）
- 关注列表 `follow-up-list`（键串）
- 产品翻转卡 `product-flip-card`（"下一个商品" 5 键重复值）
- 启动报告流 `launch-report-stream`（`${...}`）
- 策略卡、时间线等

## 五、修复方案（深度待确认，见对话提问）
- **A 全量修复**：逐键从组件上下文定正确中文文案，修正四语；修 `${}`→`{{}}`、变量名还原、`Confirmered` 变形、键错位；表达式键同步改调用处。一次到位，改动约 170 键。
- **B 仅修破坏性 bug**：只修会导致 UI 显示 `${...}` 垃圾文本 / 变量名失效的项（字面量、变量名误翻、变形）；桩与键错位暂留。
- **C 先出明细清单**：每个问题键的当前值 + 建议值列清单，逐条确认后再改。
