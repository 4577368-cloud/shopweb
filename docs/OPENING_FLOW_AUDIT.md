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
| `src/app/[locale]/products/page.tsx` | ~2400 | 选品+catalog+agents+扫描 全堆一页，改一处易牵全身 |
| `src/app/[locale]/logistics/page.tsx` | ~1800 | 模板/报价/分组/agent 耦合 |
| `src/context/onboarding-context.tsx` | ~840 | 步骤进度、镜像、物流表单、toast、dashboard 全集中 |

**建议方向（分批，每批 tsc + 目视一步）**

- products：按 **tab（shop / catalog）**、**agent 执行**、**ShopProductsPanel 容器** 拆 hook + 子模块（已有大量 `components/select/*` 可上移编排层）。
- logistics：按 **workflow step**（setup / estimate / confirm）拆 section 组件；复用已有 `logistics-*` 组件，page 只编排。
- onboarding：拆 **shop hydrate**、**workflow progress**、**logistics snapshot** 为独立 hook 或 `lib/onboarding/*`，context 只组合。

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
| P0 | 商品描述 **HTML 直出** | `shop-product-detail-drawer.tsx` `dangerouslySetInnerHTML` | sanitize 或 strip tags |
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
| **C · 拆页** | products Step 1：常量/Tab hook/扫描视图外置 | tsc + 选品页回归 | ✅ Step 1（2026-07-24） |
| **D · 拆页** | logistics 按 workflow step 拆 page 编排 | tsc + 物流三步回归 |
| **E · Context** | onboarding 拆 shop/progress  hook | tsc + 各步进度条一致 |
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

*下一动：产品页 **Step 2**（shop tab 壳）；订单线后置。*
