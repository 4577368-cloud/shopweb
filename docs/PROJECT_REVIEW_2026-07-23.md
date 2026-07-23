# Shopify 供应链准备应用 · 联合审查报告

> 审查视角：Shopify 应用产品专家 + AI workflow 专家 + 供应链产品专家 + 资深 UX 架构师 + Shopify embedded app 架构顾问
> 审查对象：实际代码库 `/Users/panda/Documents/shopify`（Next.js 16 App Router + React 19，287 个源文件）
> 审查日期：2026-07-23
> 方法：直接读取源码 + 全量路由/服务梳理 + 关键链路数据流追踪。所有结论附文件:行号证据。

---

## 先说结论（给赶时间的人）

你的产品**底层是认真的**：AI 不是玩具，商品关联和 SKU 映射两条链路是真闭环（前端正确调用后端 → 后端持久化 → 商品写回 Shopify 且带校验）。但有两处**明显"能演示但业务不闭环"的假动作**，以及一个**对 embedded app 改造来说是地基级缺失**的问题（完全没有 Shopify App Bridge / Polaris / 会话令牌体系）。这三点现在就该改，不是后期。

---

# A. 项目总体判断

### A.1 最核心的产品价值
**"开店前把货源准备好"** —— 帮商家在销售发生前完成 三件事的统一建模：① Shopify 在售商品 ↔ 货源商品 ② Shopify 变体 ↔ 货源 SKU ③ 运费/履约可性预判。这不是 ERP，是"上架前的采购供应链准备台"。这个切入点是对的，且和 Tangbuy(1688/阿里系货源)打通后形成了真实供给壁垒，不是泛泛的"选品工具"。

### A.2 当前最强的能力
**SKU 映射链路 + AI 编排层**。
- SKU 映射：先当前货源内匹配 → 不够再"新增货源入池"(`src/lib/tangbuy/preferred-pool.ts:121-169` `resolveIdentityWithPreferredPool` 真实登记到 `admin.tangbuy.cc` 商品库)，两个状态清晰，链路真实。
- AI 编排：`src/lib/agents/*` 是**规则优先 + LLM 增强 + 事实校验**的严谨管线（`runtime/fact-check.ts` 锁定数字只能来自页面上下文，防 LLM 编造），`page-agent` 做"解释/建议"层，真正动作由用户点确认触发。这是成熟的做法，不是 `Math.random()` 伪 AI。

### A.3 当前最短板
1. **首页仪表盘是写死 mock**：`mockOverview`(analyzedProducts:42 / matched:31…) + `mockActivities` 直接渲染（`src/app/page.tsx:19` 引 `mockActivities`，`:142-156` 引 `overview` 来自 `useOnboarding()`，而 `onboarding-context` 的 `overview` 种子就是 `mockOverview`）。授权后**只翻转 `authStatus`，真实计数永不回填**。这是最显眼的"演示逻辑"。
2. **物流"接受决策"不闭环**：写只落本地 `.data/logistics/<shop>-acceptances.json`（`src/lib/logistics/accept-decisions-store.ts:63-69` `fs.writeFileSync`），没有推送给后端/履约系统；但 sync 页文案声称"保存在履约侧" —— 半真半假，最危险。
3. **embedded app 地基缺失**：全仓 grep `app-bridge|polaris|authenticatedFetch|useAppBridge` → **0 命中**。当前是独立站式 OAuth + localStorage 会话，不是 Shopify Admin 内应用。

### A.4 是否真的适合做 Shopify embedded app
**适合，但当前代码形态离 embedded 还差一个"架构代差"。** 你的主流程（关联/SKU/物流）天然就是"在 Admin 里帮商家完成工作"，非常契合 embedded 心智。但前提是必须先解决：① 会话体系从 localStorage 换成 Shopify session token ② UI 从自绘换成 Polaris + App Bridge ③ 决策落点从本地文件换成后端/DB。否则不是"改造"，是"重写壳"。

---

# B. 功能链路审查（逐模块，附闭环判定）

## B.1 商品关联页 `/products`（1957 行）
- **使用逻辑**：Shopify 在售商品 ↔ 货源候选左右对照；支持 AI 图搜、候选列表、自动选第一项、人工改选、一键关联排队。
- **按钮/调用逻辑**：`api.getShopProducts` / `api.imageSearch`(真实图搜) / `api.getRecommendations` / `api.batchAckImageBindings`(确认关联) / `api.updateShopProduct`(写回 Shopify) / `api.translateText`(本地 LLM)。
- **数据回写**：`src/lib/shop-product-write.ts:137-188` `writeShopListingPrice` → `api.updateShopProduct` → 后端 → Shopify，**写后还做 `listingPriceApplied` 校验，失败抛错**。
- **闭环判定：✅ 真实闭环**。关联确认、文案/价格/状态改写都真实落 Shopify。这是你最稳的页。
- **注意点**：1957 行单文件，**状态散在本地 `useState` + `api.*`**，全局 `onboarding-context` 只取 `authSessionReady`/`isAuthorized`，不读其 mock `productMatches` —— 说明页面已现代化，但 context 是遗留包袱（见 F）。

## B.2 SKU 映射页 `/sku-align`（799 行）+ `/sku-align/product`（261 行）
- **使用逻辑**：单商品变体 ↔ 货源 SKU 对齐；先当前货源内匹配，不够再新增货源；未匹配项允许手工下拉确认。
- **按钮/调用逻辑**：`api.getSkuOverview` / `api.skuAlignV1Overview` / `api.skuAlignV1ConfirmSuggestions` / `api.autoAlignSku` / `api.bindSkuBinding` / `api.ackSkuBinding` / `api.skuAlignV1ProductDetail`。
- **"新增货源"子流程（你需求 #2 的重点）真实存在**：`confirmPageNeedsReview`(`src/lib/sku-align/batch-confirm.ts`) → `confirmSuggestionsWithFallback`(`src/lib/sku-align-v1/compat.ts:74`) → 真实外部 API；新增货源走 `resolveIdentityWithPreferredPool` → `/api/tangbuy/preferred-pool/add` 真实登记。
- **闭环判定：✅ 真实闭环**。当前货源匹配、新增货源、人工绑定都真实落外部后端。
- **短板**：`confirmSuggestionsWithFallback` 的"fallback"语义（自动跳过失败项还是进人工队列）需要确认是否对用户透明；界面上"待确认/冲突/缺货源"三态虽在（`mockSkuAlignments` 里有 `needs_confirm`/`conflict`/`blocked`），但真实数据是否也带这三类状态标签需后端对齐。

## B.3 物流页 `/logistics`（1231 行）
- **使用逻辑**：物流类型分析 → 国际运费预估 → 接受决策 → 模板配置。
- **调用逻辑**：
  - 分析 `api.analyzeLogistics` → 本地 `/api/logistics/analyze`（外部后端 `analyze` + 合并本地接受），真实。
  - 预估 `api.estimateLogistics` → `estimateLogisticsFromBrowser`(`src/lib/logistics/estimate-gateway.ts:77`) **浏览器直连 `tangbuy.cc/gateway/plugin/logistic/estimateSkuSaleFeePrice`**，真实。
  - 接受 `api.acceptLogisticsDecision` → 本地 `/api/logistics/accept-decision` → **只写本地 `.data` JSON**。
  - 模板 `api.upsertLogisticsTemplate` → 本地 `/api/logistics/templates` → **只写本地 `.data` JSON**。
- **闭环判定：🔶 半闭环（能演示但不闭环）**。预估真，但"接受决策"和"模板"是本地文件，没有流入任何履约/采购系统。
- **假动作/误导点**：`sync` 页 `fulfillmentPrep.logisticsConfirmed` 展示该本地"已确认"数，脚注写"SKU 与物流配置保存在履约侧，用于后续采购和订单处理" —— **实际仅本地 JSON，后端/履约系统完全不知道**。这是当前最该修的"看似 AI/已保存，实则没保存"问题。
- **死代码**：`/api/logistics/estimate`（旧服务端预估）在 `resolveServerMallToken()` 未配置时直接 `503`，真实预估已走浏览器 `estimate-gateway`，属遗留端点，应删。

## B.4 同步/总结页 `/sync`（293 行）
- **职责**：开店准备完成回顾 + 庆祝，诚实区分"已写入 Shopify" vs "仅履约侧准备好"。
- **闭环判定：✅ 已授权时真实聚合**（`assembleLaunchSummary` 真实聚合 `getShopProducts`/`listImageBindings`/`skuAlignV1Overview`/`getLogisticsAnalysis`/`getPricingTemplate`/`listLogisticsTemplates`）；未授权走 `launchSummary.json` mock 降级（设计合理）。
- **诚实度加分**：`shopifyWrites.titleOptimizations/priceAdjustments` 恒为 0，但附 `footnote:"需接入工作流审计后展示"` + `showAuditGap:true` —— **明确标注缺口，不伪造**。这种"诚实区分"正是 embedded app 审核喜欢的气质。
- **唯一隐患**：它把物流"本地接受数"算进 `fulfillmentPrep.logisticsConfirmed` 并宣称"履约侧已准备好"，而该数据根本没出本地文件（呼应 B.3）。

## B.5 install / authorize / 首页
- **install**：`launchShopifyInstall` → 后端生成 `shop-x2mw.onrender.com/api/plugin/shopify/auth/install?shop=…` → 302 到 Shopify consent。真实 OAuth 入口；页面有 `// Honest preview frames... no fabricated dashboards` 注释，无假数据。✅
- **authorize**：OAuth 回调后 `syncShopProducts`/`getShopStatus`/`getShopProducts` 真实恢复 + 镜像同步。✅
- **首页（⚠️ 唯一硬伤）**：见 A.3 #1。仪表盘指标与活动流是写死 mock，授权后不回填。这是"页面能演示、业务不闭环"的典型。

---

# C. 智能化升级建议

### C.1 适合 AI 自动完成（高置信 → 自动落）
- **高匹配商品关联**（score ≥ 85，`HIGH_MATCH_THRESHOLD`，`src/data/mock.ts:15`）：自动确认，无需人工。✅ 已部分实现（"自动选推荐第一项"）。
- **SKU 单位/命名归一化**（18"→45cm、颜色名映射）：`systemHint` 已自动归一化，应直接 auto-align 而非仍停留 `needs_confirm`。
- **运费预估初选**：基于市场/重量/模板自动出推荐线路（你已有 `recommended` 标记），可直接默认采纳，仅异常时人工。

### C.2 必须人工确认（低置信 → 人决策）
- **中匹配候选**（70–85）：必须人工改选/确认，不能自动落。
- **SKU 冲突/单位偏差 >阈值**（`conflict`/`unit` 类，如 20oz≈591ml vs 600ml）：人眼对照再定。
- **新增货源入池**：涉及采购关系建立，必须人工确认货源真实性（防图搜误匹配到山寨供货）。

### C.3 适合做 AI repair / suggestion / queue 的地方
- **AI repair（自动修）**：SKU 页的低置信项，AI 给出"最可能正确"下拉默认值 + 理由，人只需"确认/改"，不要从空白下拉开始。
- **AI suggestion（建议）**：商品关联页对"无候选"商品，AI 主动建议"换图搜/放宽类目/补充关键词"，而不是只显示空态。
- **AI queue（队列）**：未关联商品进"一键关联排队"（`batch-link` 已有雏形），但应让用户看到**队列进度 + 每条的置信度 + 失败原因**，不是只顶部一个进度条（呼应 D）。
- **AI 兜底补全**：物流预估失败时，AI 基于商品类目/重量推断"最可能线路区间"并标 `estimated` 而非报错空白。

### C.4 "看似 AI，实则只是普通自动化"的地方（直说）
- **首页"AI 面板"**：`src/app/page.tsx:68` 的 `ai` 是 `useMemo` 拼的静态文案（根据 `isAuthorized`/步骤状态切换几段话），**不是实时 agent 响应**。它长得像 AI 助手，实质是步骤门控的条件渲染。建议：要么接真实 `page-agent` 解释，要么明确它就是"进度助手"，别让用户以为在和 AI 对话。
- **"智能选推荐第一项"**：若只是"取 candidates[0]"，那是排序结果展示，不是 AI 决策。要标清楚"系统推荐"的依据（图搜分？标题分？），否则用户无法判断能否信。

---

# D. UX / 流程体验问题

### D.1 用户容易迷失的页面
- **物流页（1231 行单文件）**：分析 / 预估 / 接受 / 模板 / 异常 全挤一页，信息密度过高。复杂任务页应拆成"分析 → 逐 SKU 预估 → 接受确认"的工作台步骤，而不是一个长滚动。
- **首页**：仪表盘假数字 + 左侧步骤 + 右侧 AI 面板 + 活动流，四套信息源，新用户不知先看哪。

### D.2 状态表达不清
- **商品关联结果"只落顶部进度"**：你自己在需求里点名"结果落到商品卡上，不能只是顶部有进度"。需确认每个商品卡是否实时显示 `high_match / medium / needs_review` 角标 + 已选货源；目前 `mockProductMatches` 有 `status` 字段，但真实数据渲染是否同样带角标需查。
- **SKU 三态**：`auto_aligned / needs_confirm / conflict / pending` 应在每行常驻可视，不要折叠进"详情"。
- **物流"已接受" vs "仅本地预览"**：当前二者视觉无区分，导致用户误以为已生效（见 B.3）。

### D.3 结构不适合高复杂度任务的页面
- **物流页应"抽屉 → 工作台"**：当前把分析/预估/接受塞在单页；建议改成**以 SKU 为单位的逐行工作台**，每行：重量/市场/推荐线路/接受按钮/异常标记，和 SKU 页的"逐变体对照"一致的心智。
- **商品关联页 1957 行**：单文件过大，建议拆 `product-card` / `match-drawer` / `pricing-panel` / `queue-panel` 子组件，降低迷失感。

### D.4 结果应实时写回，而非等批量完成
- **商品关联确认**：当前 `batchAckImageBindings` 是批量 ack。高匹配项应在用户点"确认"时**即时**写回并刷新卡片角标，不必等整批跑完。批量仅用于"一键关联排队"的低优项。
- **SKU 单项绑定**：`bindSkuBinding` 已支持单条，保持；但界面要让人感觉"点一下就存了"，给即时 toast + 角标变更。

---

# E. Shopify Embedded App 改造建议

### E.1 必须留在 Shopify Admin 内的主流程
- **商品关联、SKU 映射、物流确认** 三个工作台 —— 这是商家"在 Admin 里完成工作"的核心，必须 embedded。
- **install 后的首次引导/授权恢复**（authorize）可在 Admin 内以轻量帧呈现。

### E.2 可以外置、但不影响审核的内容
- **营销落地页（当前 `/install` 的 hero/价值点/预览）**：独立站式落地页可外置（甚至独立域名），OAuth 仍从外站发起跳 Shopify —— **这是合规的**（Shopify 允许 install 从外站开始）。
- **帮助文档 / 定价页 / 博客**：外置。
- **重计算任务（大批量图搜/预估）**：可用 App Proxy 或后端队列，UI 在 Admin 内只展示进度，不阻塞 iframe。

### E.3 当前改造成 embedded app 的风险点（按致命度）
1. **🔴 会话体系**：当前 `src/lib/shopify-install.ts` 用 `localStorage`(`SHOP_STORAGE_KEY`) 存店铺态。embedded 内 iframe 受 Shopify 签名约束，**必须用 App Bridge `authenticatedFetch` 拿 session token**，localStorage 方案既不安全也不被 App Store 接受。→ 必须重做 auth/session 层。
2. **🔴 UI 技术栈**：无 Polaris / App Bridge。App Store 审核期望 embedded UI 用 Polaris 设计语言、由 App Bridge 托管导航/弹窗/Toast。当前自绘 + framer-motion 需逐步替换关键组件（导航、Modal、Toast、ResourcePicker）。
3. **🟠 决策持久化**：`.data/` 本地文件在 serverless / 多实例下会丢、会不一致。物流接受/模板必须进后端或 DB（你已有 `tangbuy-plugin` 后端，应扩展它承接这些写）。
4. **🟠 无 Webhook**：`products/update`、`app/uninstalled`、`shop/update` 缺失 → 商品镜像会 stale，卸载后数据不清理（GDPR 风险）。
5. **🟠 无 Billing**：收费类 App 必须接 Shopify Billing API，否则审核不通过（免费 App 可豁免，但要在配置声明）。

### E.4 导航结构建议（embedded 心智）
- **顶部**：Polaris `TopBar`（搜索/通知/帮助），由 App Bridge 渲染。
- **左侧**：不是"流程步骤"作为主导航，而是**资源导航**（商品 / SKU 映射 / 物流 / 设置）+ 一个"开店准备进度"常驻 widget。当前"步骤门控"适合做 widget，不适合做唯一导航（商家会反复进出某资源）。
- **主工作区**：商品关联、SKU 映射、物流都用 **Polaris `IndexTable` / `ResourceItem` + 右侧 `Drawer`** 做逐行处理，和 Admin 原生列表一致，降低学习成本。

### E.5 数据模型 / shop context / workflow event 建议
- **统一 Shop Context**：所有写操作必须带 `shopId`（domain），当前 API 大多已传 `shopName`，但前端 `localStorage` 态没有服务端 session 绑定 → 引入 `ShopSession { id, domain, accessToken(加密存储), scopes, installedAt }`，由后端 session 服务管理。
- **Workflow Event 建模**（你项目天然是状态机）：建议显式建模
  `ProductLinked` / `SkuAligned` / `LogisticsQuoted` / `DecisionAccepted` / `SyncCompleted`，每个事件带 `{shopId, entityId, confidence, actor:'ai'|'human', at}`。这样 sync 页的"诚实回顾"就有真实事件源，而不是重新聚合猜测。
- **Confidence 作为一等公民**：商品关联 score、SKU 对齐 judgment、物流推荐置信度，统一存 `confidence` + `actor`，驱动"高置信自动 / 低置信人工"的策略，也驱动后续审计。

### E.6 迁移路线（Phase 1/2/3）
- **Phase 1 — 先止血 + 打地基（2–4 周，现在就做）**
  1. 首页去掉 `mockOverview`/`mockActivities`，授权后由真实 API/`assembleLaunchSummary` 回填。
  2. 修 `batch-ack/route.ts`：删除该本地路由（它遮蔽全局 rewrite），或去掉 `API_BASE` 缺失时的假成功分支。
  3. 物流接受决策：要么新增 `POST /api/plugin/logistics/accept` 推后端，要么 sync 页脚注改为"仅本地预览，未同步履约"。**二选一，不能再半真半假。**
  4. 引入 `ShopSession` + 后端 session 管理雏形，替换 `localStorage` 关键路径。
  5. 删 `/api/logistics/estimate` 死端点 + 清理 `src/data/mock.ts` 中 `mockProductMatches`/`mockSkuAlignments`/`MatchCompareRow` 死代码。
- **Phase 2 — Embeddify（4–8 周）**
  1. 引入 `@shopify/app-bridge` + `@shopify/polaris`，TopBar/Modal/Toast/ResourcePicker 替换自绘。
  2. 全部写操作走 `authenticatedFetch` + session token；后端校验 session。
  3. 物流决策/模板接入 `tangbuy-plugin` 后端持久化（替换 `.data/`）。
  4. 加 webhook：`products/update`、`app/uninstalled`（含数据清理）。
  5. 导航重构：资源导航 + "开店准备进度" widget。
- **Phase 3 — App Store 化（2–4 周）**
  1. 接 Shopify Billing API（如收费）。
  2. GDPR webhook：`customers/data_request`、`customers/redact`、`shop/redact`。
  3. App 审核设计合规检查（Polaris 一致性、无外链跳出、权限最小化）。
  4. 性能/错误监控、卸载反馈。

---

# F. 代码与架构建议（直接指出）

### F.1 目录结构
- **整体合理**：`app/(pages+api)` / `components/(by-feature)` / `lib/(by-domain)` / `context` / `hooks` / `data` 分层清晰，按 feature 组织（`products`/`sku-align`/`logistics`/`sync`/`tangbuy`）是对的。
- **问题**：`lib/agents` 与 `lib/sku-align` + `lib/sku-align-v1` **并存**（`sku-align` 和 `sku-align-v1` 两个版本目录），说明 SKU 逻辑经历过一次重写但旧版未清。→ 明确弃用其一，避免后人踩坑。

### F.2 模块边界不清
- **`onboarding-context` 是"上帝 context"**（700 行，既管 auth、又管 steps、又管 mock overview、又管 toast）。活跃页面已不读它的 mock 数据，但首页仍读 `overview`(mock) → 形成"页面现代化、context 遗留"的分裂。→ 拆成 `AuthContext`(真实会话) + `WorkflowProgressContext`(真实步骤)，彻底移除 mock 种子。
- **`src/data/mock.ts` 是"诱惑源"**：真实页面与 mock 同仓，容易被误引用。→ mock 仅限未授权降级 + 测试 fixture，加 lint 注释禁止业务页 import。

### F.3 应重构的 service / route / state
- **`src/app/api/plugin/match/image-search/batch-ack/route.ts`**：本地路由遮蔽全局 rewrite + 假成功分支 → 删。
- **`src/lib/logistics/accept-decisions-store.ts`**：`fs.writeFileSync` 本地持久 → 改为调后端 API。
- **`src/lib/sync/assemble-launch-summary.ts`**：物流确认数应来自后端事件源，而非本地 `.data` 读取。
- **商品关联页 1957 行**：拆组件，状态从散 `useState` 收敛到 `use-products-scan` 这类已有 hook 的统一编排。

### F.4 必须为 Shopify auth/session/webhooks/billing 预留的结构
- **Session**：引入服务端 session store（DB 或 Redis），线上/离线 token 分离（offline token 用于 webhook/后台任务，online token 用于前台请求）。当前 `localStorage` 完全不满足。
- **Webhook 校验**：`/api/webhooks/*` 需 HMAC 校验（用 `shopify` 官方 `@shopify/shopify-app-remix` 或自实现 `crypto` 校验），当前无。
- **Billing**：预留 `recurring_application_charge` / `appSubscription` 创建与回调处理。
- **Scopes 最小化**：install 页宣称"只读访问/不修改店铺数据"，但商品关联页实际 `updateShopProduct` 写回 Shopify → **scope 与文案/实际行为不一致**，审核会卡。要么改文案为"按需写入商品"，要么收敛写入范围。

### F.5 未来会阻碍 App Store 化的逻辑
1. 假数据渲染（首页 mock）—— 审核 demo 抓到直接拒。
2. localStorage 会话 —— 不安全，不符 embedded 规范。
3. 自绘 UI 无 Polaris —— 设计一致性不达标。
4. 物流"已保存履约侧"误导文案 —— 若审核方实测发现未生效，视为欺诈性描述。
5. scope 与写入行为不一致（见 F.4）。
6. `.data/` 本地文件持久 —— serverless 部署会丢，且多实例不一致。

---

## 优先级速查（现在就该改的关键问题）

| 优先级 | 问题 | 位置 | 动作 |
|---|---|---|---|
| 🔴 P0 | 首页假数字/活动流 | `page.tsx:19,142-156` + `mock.ts` | 授权后回填真实数据 |
| 🔴 P0 | 物流接受决策不闭环 + 误导文案 | `accept-decisions-store.ts` + sync 脚注 | 推后端 或 改文案为"本地预览" |
| 🔴 P0 | `batch-ack` 假成功分支 + 遮蔽 rewrite | `batch-ack/route.ts:29-35` | 删本地路由/去假成功 |
| 🟠 P1 | 会话用 localStorage，无 App Bridge | `shopify-install.ts` | 引入 session token 体系 |
| 🟠 P1 | scope 与"只读"文案不符实际写回 | install 页 + `updateShopProduct` | 对齐文案或收敛 scope |
| 🟠 P1 | `.data/` 本地持久 | logistics 模板/接受 | 迁后端 |
| 🟡 P2 | 物流页 1231 行单文件 | `logistics/page.tsx` | 拆逐 SKU 工作台 |
| 🟡 P2 | `sku-align` 与 `sku-align-v1` 并存 | `lib/` | 弃用旧版 |
| 🟡 P2 | 死端点 + mock 死代码 | `/api/logistics/estimate` + `mock.ts` | 清理 |

---

> 备注：本审查基于本仓库前端代码 + 对外部 `tangbuy-plugin`/Shopify 调用的静态分析。外部后端（Render）与 Shopify 侧的真实持久化不在本仓，无法逐行验证；上述"闭环"结论依据"前端已正确发出真实写请求"这一事实推断。若后端本身是桩，则商品/SKU 两链也会塌缩 —— 但本仓前端无此迹象，且 install/authorize/products 的写回路径均带校验，可信度较高。
