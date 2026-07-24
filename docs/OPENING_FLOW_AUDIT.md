# 开店流程 · 代码审计与优化 backlog

> **范围**：安装 → 授权 → 选品 → SKU 对齐 → 物流 → 同步（+ 首页概览）。  
> **排除**：订单中心 / 运营中枢 / Hub / `src/components/order/**` / `order-center` 路由 — **暂不审计、暂不改**。  
> **日期**：2026-07-24 · **复审计**（批次 A–E 在 `dev` 落地后）· 静态走查 + `tsc`，未含 E2E 与 `tangbuy-plugin` Java。

---

## 0. 总览（复审计结论）

### 0.1 一句话

开店线的 **「上帝页面 / 上帝 Context」重构主战役已结束**：产品、物流、`OnboardingProvider` 均已变成 **薄编排 + hooks/组件**；继续无需求地拆 page **收益递减**。当前更值得关注的是 **SKU 对齐列表页体量**、**产品 Agent 命令单文件**、**API 与 session 绑定（P0）**，以及 **首页与步骤页 UI 壳不一致** 的产品决策。

### 0.2 体量快照（`wc -l`，2026-07-24）

| 区域 | 文件 | 行数 | 角色 |
|------|------|------|------|
| 选品 | `products/page.tsx` | ~550 | 编排壳 ✅ |
| 物流 | `logistics/page.tsx` | ~566 | 编排壳 ✅ |
| Context | `onboarding-context.tsx` | ~435 | 组合层 ✅ |
| **SKU** | **`sku-align/page.tsx`** | **~810** | 编排壳；mirror/entry 已外置（H2+H3） |
| SKU 子页 | `sku-align/product/page.tsx` | ~394 | 可接受 |
| 同步 | `sync/page.tsx` | ~564 | 仪式 + 摘要，暂不动 |
| 重 hook | `use-products-commands.ts` | ~1143 | 认知负荷 ⚠️ |
| 重 hook | `use-logistics-quote-estimate.ts` | ~922 | 域内聚，可接受 |

### 0.3 已提交重构（`dev`，回溯见 [OPENING_FLOW_UPDATES.md](./OPENING_FLOW_UPDATES.md)）

| 批次 | 摘要 | 代表 commit |
|------|------|-------------|
| A | 死组件删除 | `d7bf222` |
| B | 商品描述 HTML sanitize | `d7bf222` |
| C | 产品页 Step 1–9 | `5611a44`、`c27ccb4` |
| D | 物流 Step 1–6 | `2690d05` … `a62c402` |
| E | Onboarding shop auth + workflow progress | `6fb5ebc` |

### 0.4 建议优先级（开店 only）

| 优先级 | 项 | 说明 |
|--------|-----|------|
| **P0 安全** | Plugin/BFF **shop 与 session 绑定** | 前端 `shopName` 参数仍不可信；与后端威胁模型对齐 |
| **P1 质量** | 端到端 **手工回归**（§0.5） | 拆页多、无 E2E；发 `main`/大演示前必做 |
| **P2 架构** | SKU 列表页拆页（**批次 H**，可选） | 仅在 SKU 功能迭代时做；勿为拆而拆 |
| **P2 架构** | `use-products-commands` 拆 preview/executor 纯函数 | 与 SKU 无关，可独立小 PR |
| **产品** | 首页 `AppShell` vs `WorkbenchShell`（批次 F） | IA 决策，非纯技术 |
| **工程** | 开店路径 ESLint scope（批次 G） | 随触达文件顺手清 |
| **不做** | Onboarding E2、物流/产品 page 再拆 | 除非新需求 |

### 0.5 端到端手工回归清单（发版前）

1. **授权**：冷启动恢复 domain；OAuth 回跳 `hydrateAuthorizedShop`；未授权页链到 `/authorize`。
2. **选品**：扫描进结果 / 跳过仪式；Shop tab 筛选与 batch link；Catalog tab 刊登入口；Agent 定价/待确认 ack（抽样 1 条命令）。
3. **SKU**：列表扫描与工作台；进 `sku-align/product` 绑定/纠偏；侧栏 SKU 步状态与列表一致。
4. **物流**：`?step=setup|estimate|confirm`；保存模板 → estimate；增量 pipeline + 单条报价/accept；完成度 gate → 去同步。
5. **同步**：launch 仪式与 `completeSyncCeremony`；侧栏 sync 步 completed。
6. **首页**：概览指标与 `refreshWorkflowProgress` 不报错（授权后 2s 内拉数）。

---

## 1. 流程与路由（真相源）

| 顺序 | 步骤 id | 路由 | 主文件 |
|------|---------|------|--------|
| — | install | `/[locale]/install` | `src/app/[locale]/install/page.tsx` |
| 1 | authorize | `/authorize` | `authorize/page.tsx` |
| 2 | products | `/products`（`?tab=catalog`） | `products/page.tsx` |
| — | catalog | `/catalog` → redirect `/products?tab=catalog` | `catalog/page.tsx` |
| 3 | sku-align | `/sku-align`、`/sku-align/product` | `sku-align/page.tsx`、`product/page.tsx` |
| 4 | logistics | `/logistics` | `logistics/page.tsx` |
| 5 | sync | `/sync` | `sync/page.tsx` |
| 概览 | — | `/` | `page.tsx`（**仍用 `AppShell`**，与步骤页 `WorkbenchShell` 不一致） |

**左栏**：开店步骤页 → `StepSidebar`（`hub-mode` 关）或 `HubAwareSidebar`（hub 开）。

**状态与数据**：`onboarding-context.tsx`（组合） + `use-onboarding-shop-auth` / `use-onboarding-workflow-progress` + 各页 hooks + `/api/plugin/**`（rewrite → `NEXT_PUBLIC_API_BASE`）。

**关键约定（坑）**

- `shopify/auth/*`：**全域名** `xxx.myshopify.com`
- `order/header/list`、`product/list`：**短名** `xxx`（`normalizeShopName` / `resolveShopApiName`）
- 验证：`npx tsc --noEmit -p tsconfig.json`

---

## 2. 死代码（开店相关）

| 文件 | 状态 |
|------|------|
| `match-compare-row.tsx`、`products-decision-panel.tsx`、`sku-picker-tray.tsx` | ✅ 已删（`d7bf222`） |

**仓库脚本**：`scripts/patch-*-i18n.mjs`、`eval-sku-commands.ts` 为一次性工具，不参与运行时。

---

## 3. 架构与可维护性

### 3.1 页面与 Context（当前）

| 文件 | 行数 | 结论 |
|------|------|------|
| `products/page.tsx` | ~550 | 编排壳；逻辑在 `use-products-*`（11 个 hook） |
| `logistics/page.tsx` | ~566 | 编排壳；mirror / quote / page-actions / workflow 组件 |
| `onboarding-context.tsx` | ~435 | mock 产品·SKU·物流表单·sync·toast + 组合两个 onboarding hooks |
| `sku-align/page.tsx` | ~982 | **下一处可选拆页**；已有 `use-sku-align-scan` 等，主体仍在 page |

**Hook 地图（开店编排）**

- **产品**：`use-products-page-tab`、`entry`、`mirror`、`batch-link`、`new-arrivals`、`pricing`、`focus`、`agent-rail`、`commands`、`shop-tab-props`（+ `lib/products/*`）
- **物流**：`use-logistics-workflow-step`、`workflow-navigation`、`mirror-load`、`quote-estimate`、`page-actions`、`agent-commands`、`incremental-pipeline`（+ `logistics-workflow-*` 组件）
- **Onboarding**：`use-onboarding-shop-auth`、`use-onboarding-workflow-progress`（+ `lib/onboarding/auth-session-ready`）

### 3.4 产品页拆页回顾（Step 1–9 · `c27ccb4`）

**好处**：可定位性、行为边界、依赖顺序显式、与 `components/select/products-page/*` 分工、CHANGELOG 可 revert。

**残留风险**：`use-products-commands` 体量大；hook 宽参数面；无自动化回归 — 见下表。

| 风险 | 缓解 |
|------|------|
| commands ~1100 行 | 拆 `lib/products/command-*` 纯函数（可选） |
| memo deps 遗漏 | 面板不刷新时查 hook deps |
| 手工回归 | §0.5 选品段 |

**结论**：产品页 god page **已解决**。

### 3.5 物流页拆页回顾（Step 1–6 · `2690d05`–`a62c402`）

| 层 | 职责 |
|----|------|
| URL / 导航 | `page-constants`、`use-logistics-workflow-step`、`use-logistics-workflow-navigation` |
| 数据入站 | `use-logistics-mirror-load` |
| 报价 / pipeline / accept | `use-logistics-quote-estimate` |
| 模板 / gate / 发布 snapshot | `use-logistics-page-actions` |
| UI 块 | `logistics-workflow-body`、`setup`、`decision-workspace` |

**好处**：与产品页同构；物流页可只读 shell + Agent 接线。

**残留**：`use-logistics-quote-estimate` 仍大但 **域内聚**；API shop 校验不在此次重构范围。

**结论**：物流 god page **已解决**；无功能需求时 **停拆**。

### 3.6 Onboarding（E1 · `6fb5ebc`）

- **抽出**：冷启动店铺恢复、workflow API 刷新、侧栏 step 推导、`publishLogistics*`。
- **留在 context**：mock 演示数据（productMatches/skuAlignments）、物流表单、sync 仪式、toast、dashboard activities。

**结论**：上帝 Context **已降到可维护**；E2（mock 动作外置）**明确不做**除非 mock 要删改。

### 3.2 UI 栈不一致（未变）

- 步骤页：`WorkbenchShell` + `WorkbenchPanel` + `StepSidebar`
- 首页：`AppShell` + `PageHeader` + `MetricCard` → 批次 **F**，产品决策

### 3.3 i18n / mock

- `initialSteps` 中文硬编码；侧栏已 `steps.*` — 低优清理。

---

## 4. 隐患与安全（开店相关 API）

| 级别 | 问题 | 状态 |
|------|------|------|
| P0 | Next/plugin：**shopName 无 session 绑定** | ❌ 待 plugin/BFF |
| P0 | 商品描述 HTML | ✅ `sanitize-product-html` |
| P1 | `/api/oss/upload` 鉴权/限流 | 未做 |
| P1 | `/api/translate` 开放 POST | 未做 |
| P1 | `NEXT_PUBLIC_TANGBUY_*_TOKEN` 进浏览器 | 威胁模型需文档化 |
| P2 | 授权乐观 UI（localStorage） | 已知；可加强 loading |

---

## 5. 工程质量

- **tsc**：开店改动后应保持 `npx tsc --noEmit` 绿。
- **ESLint**：全仓仍有存量；开店触达：`shop-products-panel.tsx`、`workflow-step-snapshots.ts`。
- **测试**：`src/lib/logistics/test-*.ts` 等为 CLI 样本，不打包。

---

## 6. 批次状态（仅开店）

| 批次 | 内容 | 状态 |
|------|------|------|
| **A · 清理** | 死组件 | ✅ |
| **B · 安全** | HTML sanitize；API shop 校验 | 半 ✅ |
| **C · 拆页** | products Step 1–9 | ✅ `dev` |
| **D · 拆页** | logistics Step 1–6 | ✅ `dev` |
| **E · Context** | onboarding E1 | ✅ `dev` |
| **F · UI** | 首页 Workbench 与否 | 待定 |
| **G · Lint** | 开店目录 lint scope | 待定 |
| **H · 拆页（可选）** | `sku-align` H2 mirror + H3 entry | tsc + 扫描/深链回归 | ✅ H2+H3 `dev` |

---

## 7. Workbuddy / AI 启动提示（开店专项）

```text
范围：开店流程 only。不要改 order-center、Hub 运营（除非用户明确）。

必读：本文件、OPENING_FLOW_UPDATES.md、OPERATIONS_CENTER_DESIGN.md §4.1（写 UI 时）

默认：拆页已完成 — 新需求优先小 diff；SKU 列表 / P0 API / 手工回归 见 §0.4。

验证：npx tsc --noEmit -p tsconfig.json
```

---

## 8. 关联文档

- 变更 commit 表：[OPENING_FLOW_UPDATES.md](./OPENING_FLOW_UPDATES.md)
- 视觉：`OPERATIONS_CENTER_DESIGN.md` §4.1
- SKU：`.workbuddy/memory/MEMORY.md` §SKU 对齐

---

## 9. 文档历史

| 日期 | 说明 |
|------|------|
| 2026-07-24 | 初版 + 批次 A/B |
| 2026-07-24 | **复审计**：批次 C/D/E 落地后更新 §0、§3.5–3.6、优先级与回归清单 |
