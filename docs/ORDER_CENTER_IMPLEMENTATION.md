# 订单中心开发实施步骤方案（仅订单板块）

> 本文档是 `docs/ORDER_CENTER_DESIGN.md`（产品/架构冻结稿 v1.1）的**开发落地路线图**。
> 范围：**只做订单中心**。运营中心 / 履约中心不在本实施范围内（设计稿已冻结，但暂不开发）。
> 严守铁律：逐文件手术式 + 每次改动 `git diff` 自检 + 绝不 `checkout`/`reset` 用户文件 + 用 `tsc` 轻量检查替代完整 `build`。

---

## 0. 当前地基（已完成，不重做）

| 项 | 状态 | 说明 |
|----|------|------|
| 路由 `/[locale]/order-center` | ✅ | 本地门禁 `HUB_ENABLED`（`src/lib/hub/flags.ts`） |
| 三栏壳 | ✅ | `WorkbenchShell` + `HubSidebar` + `AssistantRail` 占位 |
| 8 Tab + 全部视图 | ✅ | 骨架 `order-center/page.tsx` 已搭 |
| 基础 `OrderCard` | ✅ | 通用字段矩阵（不分状态） |
| 跳 Shopify Admin | ✅ | 独立站形态新窗口；嵌入式 `Redirect.dispatch` 预留 |
| PII 隔离 | ✅ | 列表仅显示「国家」，不渲染收件人 |
| 用户菜单切换开关 | ✅ | `HubModeProvider` + `HubAwareSidebar`，hub 开时轮播隐藏 |
| 产品定义 | ✅ | `docs/ORDER_CENTER_DESIGN.md` v1.1（状态机 / 字段矩阵 / 跳 Shopify / 物流双轨 / AI） |

---

## 1. 实施步骤总览（7 个 Phase）

| Phase | 主题 | 主要产出 | 验证 | 外部依赖 |
|-------|------|----------|------|----------|
| **1** | 数据层与领域模型 | `src/lib/order/*`（类型 / 状态机 / mock）外提 | tsc | 无 |
| **2** | 列表与卡片字段矩阵（按状态） | `OrderCard` 按状态渲染 + `LogisticsTracks` 双轨组件 | tsc + dev 目视 | 无 |
| **3** | 筛选与「全部」视图 | 多维筛选 + 搜索框 | tsc | 无 |
| **4** | 真实数据接入（待下单优先） | `/api/plugin/order/list` 契约 + 待下单真实数据 | tsc + 联调 | **tangbuy-plugin 订单接口** |
| **5** | 物流双轨真实接入 | `LogisticsTracks` 接实时轨迹 | dev 联调 | **tangbuy-plugin 五楼/承运商 API** |
| **6** | 右侧 AI 面板 | 订单域 command-schema + Copilot | tsc + 联调 | sku command 范式 |
| **7** | i18n 全量键 + 双形态收尾 | 四语补全 + 双形态验证 | **build** | 无 |

每步**独立可验证**，仅 Phase 7 跑完整 `npm run build`（验证路由注册 / 构建）。

---

## 2. 各 Phase 详细

### Phase 1 · 数据层与领域模型（设计地基）
**目标**：把骨架内联的 `MockOrder` 类型 + `MOCK_ORDERS` 抽成可维护、可接 API 的领域层，page 行为不变。

**涉及文件**
- `src/lib/order/types.ts`（新建）
  - `OrderStatus` 枚举：`pendingOrder | pendingSupplement | pendingPayment | preparing | pendingShipment | inTransit | delivered | canceled`
  - `OrderSummary`：通用常驻字段（shopOrderNo / tangbuyOrderNo / shopifyOrderId / createdAt / destinationCountry / status）+ **按状态可选字段**（如 `wulouNo` 仅待发货/待送达、`supplementReason` 仅待补款、`paidAmount` 仅待支付、`signedAt` 仅已送达…）
  - `LineItem`：image / title / sku / qty / unitCost
  - `LogisticsTrack`：境内段 + 国际段各含 `{ status, steps[] }`
  - `DestinationCountry`：`{ code: string; name: string }`（ISO code + 中文名，PII 隔离）
  - 派生字段：`routeLine`（美向/欧向…）、`templatePrice`（模板价）、`needsQuote`（无模板标「待核价」）
- `src/lib/order/state-machine.ts`（新建）
  - `STATUS_ORDER`、`TAB_STATUS_LIST`、`ALL_VIEW_KEY`
  - `statusLabelKey(status)` → i18n 键
  - `statusBadge(status)` → 徽标色级
  - `nextStatus(status)`、`countByStatus(orders)`
- `src/lib/order/mock.ts`（新建）
  - `makeMockOrders()` 覆盖 8 状态 + 全部视图
  - 含**目的地国 → 线路 / 模板价派生**（预设规则表；无匹配 `needsQuote=true`）
  - 保留 PII 仅国家
- `src/app/[locale]/order-center/page.tsx`（改）
  - 删除内联 `MockOrder` / `MOCK_ORDERS`，改为 `import` 上述模块

**不做**：UI 变更、真实后端、重下单按钮。

---

### Phase 2 · 列表与卡片字段矩阵（按状态渲染）
**目标**：`OrderCard` 按当前 Tab 状态渲染设计稿 §2.3 的**专属字段**；物流双轨可视化。

**涉及文件**
- `src/components/order/order-card.tsx`（新建，从 page 抽出并升级）
  - 接收 `order: OrderSummary` + `status`
  - 通用常驻字段块（店铺订单号 / Tangbuy 单号 / 国家 / 跳 Shopify / 状态徽标）
  - 按 `status` 渲染专属字段块：
    - 待下单：商品明细 + 供应商单号 + 成本汇总（商品/物流/合计）+ 备注 + **重新下单按钮占位（隐藏，用户暂缓）**
    - 待补款：补款原因 / 金额 / 确认补款·取消
    - 待支付：供应商 / 应付金额 / 标记已支付
    - 备货中：预计发货时间 / 催促·取消
    - 待发货：**五楼单号** + 境内物流（双轨①）
    - 待送达：五楼单号 + 国际物流单号 + 承运商 + 国际物流（双轨②）+ ETA
    - 已送达：签收时间 / 签收人 / 物流状态 / 归档
    - 已取消：取消时间 / 原因 / 退款状态
- `src/components/order/logistics-tracks.tsx`（新建）
  - 境内段 / 国际段**双迷你进度条**（mock 状态枚举：`待揽收/已揽收/运输中/已入仓` 与 `已出库/干线/清关/末端派送/已签收`）
  - 异常态用 warning/danger 色
- `page.tsx`（改）：用 `OrderCard`；待发货/待送达 Tab 渲染 `LogisticsTracks`

**不做**：真实物流 API（Phase 5）。

---

### Phase 3 · 筛选与「全部」视图（多维筛选）
**涉及文件**：`page.tsx` 加筛选栏
- 维度：时间范围 / 目的地国 / 供应商 / 异常态（物流停滞 / 待核价）
- 搜索框：店铺订单号 / Tangbuy 单号 / SKU
- 「全部」视图横在 Tab 行右侧，应用筛选

**验证**：tsc。

---

### Phase 4 · 真实数据接入（待下单优先）
**目标**：待下单 Tab 接真实 Shopify 已付款订单；其余 Tab 按状态机接真实数据。

**涉及文件**
- `src/lib/order/api.ts`（新建）：`/api/plugin/order/list` 请求 / 响应类型（含 Shopify 已付款订单映射 + 目的地国 + 货源反查）
- `page.tsx`：接真实数据（定期拉取 webhook 主 + cron 兜底，`order.id` 幂等；目的地国 → 线路/模板价派生）

**依赖（外部，最大阻塞点）**：tangbuy-plugin 提供订单列表接口（含 Shopify 已付款订单 → 我们系统映射）。
**验证**：tsc + dev 联调（需后端就绪）。

---

### Phase 5 · 物流双轨真实接入
**目标**：`LogisticsTracks` 接实时轨迹。

**依赖（外部）**：tangbuy-plugin 新增五楼 / 承运商 API 集成（前端只消费）。
**验证**：dev 联调。

---

### Phase 6 · 右侧 AI 面板（订单域 Copilot）
**目标**：复用已验证的 `command-schema / plan-command`（sku 已落地）。

**涉及文件**
- `src/lib/order/command-schema.ts`（新建）：订单域意图 `mark_shipped` / `fill_wulou_no` / `list_stuck` / `filter_no_quote` 等
- `page.tsx`：右侧 `AssistantRail` 接订单 Copilot（自然语言操作 + 批量指令 + 澄清循环 + 序列执行）

**验证**：tsc + 联调。

---

### Phase 7 · i18n 全量键 + 双形态收尾
**涉及文件**：四语字典补 `order.*` 键（各状态字段、物流双轨状态、筛选器、AI 指令示例）
**验证**：**仅此步跑 `npm run build`**（验证路由注册 / 构建 / 四语类型）。
**双形态**：嵌入式 `App Bridge Redirect.dispatch` + 独立站新窗口，门禁确认。

---

## 3. 关键设计决策（贯穿全程）

1. **数据层外提**：所有订单类型 / mock / 状态机集中在 `src/lib/order/*`，page 只做编排，便于 Phase 4 平滑接 API。
2. **按状态字段矩阵**：`OrderCard` 接收 `status`，渲染该状态专属字段（设计稿 §2.3），非通用卡片。
3. **物流双轨组件化**：独立 `LogisticsTracks`，mock 先行、Phase 5 接真实，UI 不返工。
4. **PII 隔离**：列表仅 `destinationCountry`（国家），收件人详情只在 Shopify 端（跳 Admin），我们不持久化。
5. **重新下单暂缓**：Tab1「重新下单」按钮本阶段**不做**（用户明确），字段矩阵里该位置留占位/隐藏，待后端下单接口就绪后在 Phase 4 补。
6. **验证纪律**：每步 `npx tsc --noEmit -p tsconfig.json`（**单独跑，不可并行**——并行竞争 `.tsbuildinfo` 会误报）；仅 Phase 7 跑 build。

## 4. 风险与外部依赖（ blockers ）
- **Phase 4**：tangbuy-plugin 订单列表接口（含 Shopify 已付款订单映射 + 货源反查）——最大阻塞。
- **Phase 5**：tangbuy-plugin 五楼 / 承运商 API 集成。
- **Phase 6**：订单域 command-schema 意图定义（可并行准备）。
- **模板价已拍板·复用共享数据**：不新建配置界面；物流模板=`LogisticsTemplate`、商品重量体积=`variant-measures`、算价=`estimate-gateway`/`quote-cache`（详见设计稿 §5-#6）。Phase 1 的 `deriveLogisticsRoute/deriveTemplatePrice` 为占位，Phase 4 改为消费真实共享链路。

---

*本方案为订单中心开发路线图，Phase 1 已启动（数据层外提）。开发严格遵循「逐文件手术式 + git diff 自检 + 绝不 checkout 用户文件 + tsc 替代 build」铁律。*
