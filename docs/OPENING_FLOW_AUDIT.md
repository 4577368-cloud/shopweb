# 开店流程 · 代码审计与优化 backlog

> **范围**：安装 → 授权 → 选品 → SKU 对齐 → 物流 → 同步（+ 首页概览）。  
> **排除**：订单中心 / 运营中枢 / Hub / `src/components/order/**` / `order-center` 路由 — **暂不审计、暂不改**。  
> **日期**：2026-07-24 · 静态走查 + `tsc` / 抽样 `eslint`，未含 E2E 与 `tangbuy-plugin` Java。

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

**左栏**：开店步骤页 → `StepSidebar`（`hub-mode` 关）或 `HubAwareSidebar`（hub 开，与开店并行调试）。

**状态与数据**：`src/context/onboarding-context.tsx` + `/api/plugin/**`（`next.config` rewrite → `NEXT_PUBLIC_API_BASE`）。

**关键约定（坑）**

- `shopify/auth/*`：**全域名** `xxx.myshopify.com`
- `order/header/list`、`product/list`：**短名** `xxx`（`normalizeShopName` / `resolveShopApiName`）
- 验证：`npx tsc --noEmit -p tsconfig.json`（勿并行多次）

---

## 2. 确认无引用的死代码（开店相关 · 可安全删除）

| 文件 | 说明 |
|------|------|
| `src/components/products/match-compare-row.tsx` | 全仓无 import |
| `src/components/products/products-decision-panel.tsx` | 全仓无 import |
| `src/components/sku-align/sku-picker-tray.tsx` | 已被 `sku-picker-dialog.tsx` 替代，无 import |

**不在本次删除（属订单域）**：`src/components/order/order-card.tsx` 等 — 等订单线单独清理。

**仓库脚本**：`scripts/patch-*-i18n.mjs`、`eval-sku-commands.ts` 为一次性工具，不参与运行时；可归档或文档说明，避免误执行。

---

## 3. 架构与可维护性（精细化优化主战场）

### 3.1 God Page / 上帝 Context

| 文件 | 约行数 | 风险 |
|------|--------|------|
| `src/app/[locale]/products/page.tsx` | ~500（Step 9 后） | **编排壳**：路由三态 + Tab + rail；逻辑在 `use-products-*` |
| `src/app/[locale]/logistics/page.tsx` | ~565 | 编排壳；逻辑在 mirror/quote/page-actions hooks |
| `src/context/onboarding-context.tsx` | ~435 | 组合层；auth + workflow 在 onboarding hooks |

**建议方向（分批，每批 tsc + 目视一步）**

- products：**Step 1–9 已完成**（见 §3.4）；余量仅为目视/E2E 回归与 `use-products-commands` 体量治理。
- logistics：按 **workflow step**（setup / estimate / confirm）拆 section 组件；复用已有 `logistics-*` 组件，page 只编排。
- onboarding：拆 **shop hydrate**、**workflow progress**、**logistics snapshot** 为独立 hook 或 `lib/onboarding/*`，context 只组合。

### 3.4 产品页拆页回顾（Step 1–9 · 本地待提交）

**模块地图**

| 层 | 文件 | 职责 |
|----|------|------|
| 页面壳 | `products/page.tsx` | 授权/扫描/结果布局、Tab、header、挂 drawer/rail |
| Tab UI | `products-*-tab.tsx`、`products-scan-view.tsx` | Shop / Catalog / 扫描阶段展示 |
| 编排 hooks | `use-products-page-tab`、`entry`、`scan`、`mirror`、`batch-link`、`new-arrivals` | 生命周期与数据 |
| 交互 hooks | `pricing`、`focus`、`agent-rail`、`commands`、`shop-tab-props` | 定价、焦点、Agent、命令、Shop 面板 props |
| 纯逻辑 | `lib/products/*`（display-metrics、batch-link-finish、page-constants、resolve-title-copy-style） | 可单测的推导与收尾 |

**拆完的好处**

1. **可定位性**：改扫描仪式 → `use-products-entry`；改静默刷新/mirror → `use-products-mirror`；改 Copilot 命令 → `use-products-commands`；不再在 2400 行里全文搜索。
2. **行为边界清晰**：`page.tsx` 基本无业务分支，降低「改 Agent 误伤 batch link」的概率。
3. **依赖顺序显式**：mirror 在 batch 之后、entry 在 mirror 之后、agent 在 pricing 之后 — 避免 phase/template 环依赖（entry 收 visibility，pricing 收 template state）。
4. **与组件目录一致**：`components/select/products-page/*` 管展示，hooks 管编排，符合现有 SKU/物流「page 薄、组件厚」方向。
5. **可回溯**：`OPENING_FLOW_UPDATES.md` 按 Step 记录路径与 revert 粒度。

**带来的成本 / 风险（需知情）**

| 风险 | 说明 | 缓解 |
|------|------|------|
| **Hook 参数面宽** | `useProductsShopTabProps`、`useProductsAgentRail` 入参多，改签名要改两处 | 保持 hook 与 page 同 PR；必要时再收一层 `ProductsPageStore` context（非必须） |
| **`use-products-commands` 体量大** (~1100 行) | 预览/执行仍在单文件，认知负荷未完全消失 | 后续可拆 `lib/products/command-preview-generators.ts` + `command-executors.ts`（纯函数） |
| **无自动化回归** | 拆页未改 API 契约，但扫描/batch/命令路径多 | 提交前清单：扫描进结果、跳过仪式、batch 完成 toast、Agent 定价/待确认 ack、catalog 刊登 |
| **useMemo 依赖遗漏** | shop-tab-props / mirror 等靠 memo 稳定引用 | 异常表现多为「面板不刷新」— 对照 hook deps；`tsc` 不捕此问题 |
| **双处 template** | mirror `loadSummary` 与 pricing hook 共用 `setTemplate` | 已约定 pricing hook 先创建 state，mirror 只写入 — 勿再在 page 建第二份 template state |
| **行为声称「无变」** | 重构意图为搬运；边缘时序（如 batch 中 visibility refresh）理论上一致 | 以 `OPENING_FLOW_UPDATES` 行为列 + 上表手工回归为准 |

**结论**：产品页 **god page 问题在开店线内已基本解决**；剩余主战场是 **logistics page**、**onboarding context**，以及 commands 大文件的二次拆分。**不建议**在无需求时继续拆 `page.tsx`（收益递减）；下一步优先 **提交 Step 2–9** 或 **批次 D logistics**。

### 3.2 UI 栈不一致

- 步骤页：`WorkbenchShell` + `WorkbenchPanel` + `StepSidebar`
- 首页：`AppShell` + `PageHeader` + `MetricCard`

**建议**：要么首页迁 Workbench（与 §4 运营中心设计一致），要么文档明确「首页 = 营销/dashboard 例外」。

### 3.3 i18n / mock

- `src/data/mock.ts` 中 `initialSteps` 的 title/description 仍为中文硬编码；侧栏展示已走 `steps.*`，mock 字段主要用于初始 state — 可逐步删冗余或改为 key。

---

## 4. 隐患与安全（开店相关 API）

| 级别 | 问题 | 位置 | 建议 |
|------|------|------|------|
| P0 | Next 路由仅校验 `shopName` 参数，**无 Shopify session 绑定** | `/api/logistics/*` 等 | 与 plugin 约定：服务端按 session 解析 shop，或 BFF 校验 cookie；威胁模型写进 AGENTS |
| P0 | 商品描述 **HTML 直出** | `shop-product-detail-drawer.tsx` | ✅ 批次 B：`sanitize-product-html.ts` |
| P1 | **`/api/oss/upload`** 无鉴权/限流 | `app/api/oss/upload/route.ts` | 同源 session + rate limit |
| P1 | **`/api/translate`** 开放 POST | 滥用成本 | 鉴权或内网 only |
| P1 | **`NEXT_PUBLIC_TANGBUY_*_TOKEN`** 进浏览器包 | mall/admin 直连 | 最小权限 token；敏感能力仅 server route |
| P2 | 授权 **乐观 UI** | `getAuthSessionReadySnapshot` + localStorage domain | 冷启动短闪「已授权」；可加强 loading 态 |

---

## 5. 工程质量

- **ESLint**：全仓约 261 项（含大量 `prefer-const`、未使用 import）；开店路径重点：`shop-products-panel.tsx`、`onboarding-context.tsx`、`workflow-step-snapshots.ts`
- **Lint 未用符号（开店抽样）**：`icons.tsx` 部分 export；`sourcing/search.ts` 常量；`workflow-step-snapshots.ts` 内部函数 — 删或用起来
- **测试脚本**：`src/lib/logistics/test-*.ts`、`sourcing/test-*.ts` 为 CLI 样本，不打包；保留

---

## 6. 推荐优化批次（仅开店 · 不动订单）

| 批次 | 内容 | 验收 |
|------|------|------|
| **A · 清理** | 删 §2 三个 dead 组件；清开店相关 unused export | tsc | ✅ 2026-07-24 |
| **B · 安全** | HTML sanitize；梳理 logistics API shop 校验（前后端对齐） | 手工 + plugin 确认 | ✅ sanitize 已做；API 待 plugin |
| **C · 拆页** | products Step 1–9：hooks + shop tab props | tsc + §3.4 回归清单 | ✅ Step 9 本地（2026-07-24，待提交） |
| **D · 拆页** | logistics Step 1–6：hooks + workflow body + 报价/模板编排 | tsc + 三步 UI 回归 | ✅ 批次 D 收尾 |
| **E · Context** | onboarding：shop auth + workflow progress hooks | tsc + 侧栏进度一致 | ✅ E1 本地 |
| **F · UI 统一** | 首页是否迁 Workbench（产品决策） | 目视 |
| **G · Lint** | 开店目录 `eslint` 清零或 CI scope | lint green |

---

## 7. Workbuddy / AI 启动提示（开店专项）

```text
范围：开店流程 only。不要改 src/components/order/**、order-center、Hub 运营。

必读：docs/OPENING_FLOW_AUDIT.md、docs/OPERATIONS_CENTER_DESIGN.md §4.1（视觉规范，写 UI 时遵）

当前批次：[填 A–G 之一]

约束：逐文件小改、git diff 自检、不 checkout 用户文件；验证 npx tsc --noEmit -p tsconfig.json
```

---

## 8. 关联文档

- 步骤产品：`ORDER_CENTER_DESIGN.md` 仅中枢 IA 参考；开店步骤字段以各页 + `workflow-progress` 为准
- 视觉：`OPERATIONS_CENTER_DESIGN.md` §4.1（Hub 与开店共享 token/组件）
- SKU 架构：`.workbuddy/memory/MEMORY.md` §SKU 对齐

---

## 9. 变更记录

提交后的开店改动见 **[OPENING_FLOW_UPDATES.md](./OPENING_FLOW_UPDATES.md)**（含 commit、路径、是否改行为、revert 提示）。

---

*下一动：onboarding **E2**（mock 产品/SKU 动作、toast、dashboard 活动可继续外置）；或运营中心设计落地。*
