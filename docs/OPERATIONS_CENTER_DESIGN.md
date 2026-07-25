# 运营中心 · 产品设计 + 架构 + UI 样式规划（筹备稿 v2）

> 状态：**设计冻结 / 筹备阶段**（pipispy 多接口评估已合并，2026-07-24）。暂不开发；本文档对齐产品、架构、商业化页面结构与积分记账。
> 范围：运营中心（日常营销运营）。三栏壳、中枢导航、双形态沿用 `ORDER_CENTER_DESIGN.md`。
> 数据源：**pipispy** 竞品情报（多 URI，经 `tangbuy-plugin` `/api/plugin/marketing` 代理）。
> 详细评估过程见 `.cursor/plans/pipispy_tts_shop_list_5c8e574d.plan.md`（可选查阅）。

---

## 0. 一句话定位

运营中心是面向**日常店铺营销运营**的情报中枢：通过 **pipispy** 实现 **发现（榜/搜/店）→ 竞店分析 → 素材学习（含文案详情）** 闭环。产品灵魂是 **黄金链路**：`ad-product-rank-list` / `adlibrary-products-search` → 免费 `competition/products` → **`store/detail/competition`**（竞店 + `good_source`）→ **`adlibrary-product-detail`** 抽屉。与开店解耦，支持嵌入式 + 独立站双形态；**积分账本（预估→结算）** 为后续商家定价基础。

---

## 1. 信息架构：与订单中心同源的两段式中枢

左导航延续 `ORDER_CENTER_DESIGN.md` 的「两段式中枢导航」：

```
开店流程                        运营中枢
  1. 安装授权                     ◆ 订单中心
  2. 选品                         ◆ 运营中心  (active)
  3. SKU 对齐                     ◆ 履约中心
  4. 同步
[进度条]
```

- 运营中心点进去后，进入自身的「三栏工作区」（新模式，与订单中心同壳 `WorkspaceLayout`）。
- 三中心边界（沿用订单中心定义，运营中心负责「指标 / 利润 / 库存健康 / 异常大盘」与本次新增的「竞品营销情报」）：
  | 中心 | 职责 | 数据主轴 |
  |------|------|----------|
  | 订单中心 | 订单状态机、采购、物流追踪 | Shopify 订单 + 货源 + 物流 |
  | 运营中心 | 竞品营销情报、榜单、素材学习、指标大盘 | **外部竞品 API (pipispy) + 跨订单聚合** |
  | 履约中心 | 入仓/出库/集运/清关作业台 | 仓库 + 承运商 |

---

## 2. 运营中心 · 产品与字段设计

### 2.1 三栏工作区结构

> 决策（2026-07-24）：**不设左栏二级菜单**。Top Tab 在中栏顶部分段切换；左栏 = watchlist + **用量（商业化）**。

- **左**：**Watchlist**（TTS 店 / 竞店 / 广告商品 分组）+ **本店本月用量**（账本 `SUM(actual_consumed)`）+ 可选 pipispy 池余额（内测）+ **用量明细**抽屉（最近分录 estimate vs actual）。
- **中**：Top Tab 并列 **`发现 | 竞店 | 素材`**（URL `?view=discovery|competition|creatives`）+ **上下文条**（当前操作、本次预估、上次 actual）+ 主内容 + **统一详情抽屉**。
- **右**：`AssistantRail` + 营销 Copilot（指令需 **计划步骤 + 总预估** 后确认执行）。

### 2.2 Top Tab 与 pipispy 映射（评估定稿）

| Top Tab | 用户一句话 | 主接口 | 文档 |
|---------|------------|--------|------|
| **发现** | 什么品/店值得看？ | 广告：`ad-product-rank-list` + `adlibrary-products-search`；TTS：`tiktok-shop-list` | [rank-list](https://www.pipispy.com/doc/ad-product-rank-list) · [products-search](https://www.pipispy.com/doc/adlibrary-products-search) · [tts-shop-list](https://www.pipispy.com/doc/tiktok-shop-list) |
| **竞店** | 谁在投、投得怎样？ | `store/detail/competition` + 免费 `competition/products` | [store-detail-competition](https://www.pipispy.com/doc/store-detail-competition) |
| **素材** | 长什么样、文案怎么写？ | `competition` → `good_source[]`；详情 **`adlibrary-product-detail`** | [adlibrary-product-detail](https://www.pipispy.com/doc/adlibrary-product-detail) |

**发现 Tab 内部分段**（不占左栏）：`TTS 店铺 | 广告商品`；商品内 `排行（默认）| 搜索 |（v1.5 以图搜 submit→status→result-summary）`。

**中枢（S+）**：[`store/detail/competition`](https://www.pipispy.com/doc/store-detail-competition) 同时驱动 **竞店 Tab** 与 **素材列表**；发现层选中 `product_id` 后汇入此接口。

> 文案（⚠️ **数据源限制**）：`good_source` 与 `adlibrary-product-detail` **均无广告创意文案正文字段**（detail 仅返回 product / store / advertisers / ad_started_history）。即 pipispy 不提供创意文案，「改写文案」类功能须降级为基于 product `title` / 卖点做有限生成，或在 UI 标注「文案不可用」。
> 榜单：正式接口为 **`ad-product-rank-list`**，不再单独第四个 Top Tab「榜单」；派生榜仅作无 Key 演示。

**pipispy 真实接口 path 映射**（代理统一 `POST /open-api/v1/data`，body `{ key, uri, params }`；下表把文档友好名对齐到 pipispy 真实 `uri`）：

| 文档友好名 | pipispy 真实 `uri`（path） | 状态 | 备注 |
|------------|---------------------------|------|------|
| `store/detail/competition` | `/v3/api/open/store/detail/competition` | 设计沿用 | 中枢 S+ |
| `competition/products`（免费） | 待 Phase 0 试调用确认（文档原写作 `competition/products`） | ⚠️ 待核实 | 免费 0 点 |
| `ad-product-rank-list` | `/v3/api/open/rank/ad-product/list` | ✅ 官网核实 | 发现 · 排行 |
| `adlibrary-products-search` | `/v3/api/open/ppspy/ad-products/search` | ✅ 官网核实（detail 文档 Note 01） | 发现 · 搜索 |
| `adlibrary-product-detail` | `/v3/api/open/ppspy/ad-products/detail` | ✅ 官网核实 | 文案 / 详情 |
| `tiktok-shop-list` | 待 Phase 0 试调用确认 | ⚠️ 待核实 | 发现 · TTS 店榜 |
| AI 图搜三件套 | 见 pipispy doc（submit / status / result-summary） | ⚠️ 待核实 | Phase 6 |

> ⚠️ 凡标「待核实」的 path，Phase 0 须以真实调用回填，**禁止前端硬编码猜测 path**；前端 / 代理一律使用上表真实 `uri`，不再使用友好名。

### 2.2.1 接口优先级（MVP 选型）

| 优先级 | 接口 | 说明 |
|--------|------|------|
| S+ | `store/detail/competition` | 中枢 |
| S | `competition/products`（免费） | 先选 product_id |
| S | `ad-product-rank-list` | 发现 · 排行 |
| A | `adlibrary-product-detail` | 文案/详情/可能视频 URL |
| A | `adlibrary-products-search` | 发现 · 搜索 / Copilot |
| B | `tiktok-shop-list` | 发现 · TTS 店榜（ID 可能与 store_id 分型） |
| B+ | AI 图搜三件套 | [submit](https://www.pipispy.com/doc/ai-search-image-submit) · [status](https://www.pipispy.com/doc/ai-search-image-status) · [result-summary](https://www.pipispy.com/doc/ai-search-image-result-summary) · Phase 6 |

**交付档位**：档位 1 = competition + products + rank；**档位 2（推荐）** + detail + search；档位 3 + TTS 店榜；图搜 = 2.5/6。

**与开店隔离**：`/api/plugin/match/image-search` 为 **1688 货源**；pipispy 图搜为 **广告情报**，不得混路由/文案。

### 2.2.2 原「三大视图」对照（兼容旧读法）

| 原模块 | 现落点 |
|--------|--------|
| 竞店监控 | Top Tab **竞店** |
| 素材学习 | Top Tab **素材** + 详情抽屉 |
| 榜单 | Top Tab **发现 → 广告商品 → 排行/搜索** |

---

### 2.3 视图一 · 竞店监控（核心，先接入）

**入口**：用户输入店铺 ID（`store_id`，13 位串）+ 可选 `product_id`（指定商品）→ 或直接选 watchlist 中的店铺。

**请求**（服务端代理，见 §3）：`POST /open-api/v1/data`（⚠️ pipispy **所有** data 接口均为 POST，非 GET），body `{ key, uri:"/v3/api/open/store/detail/competition", params:{ id, product_id?, page_size?, current_page? } }`。每返回 1 条竞店消耗 1 信用点。

**竞店列表字段矩阵**（来自 `data.data[]`）：

| 字段 | pipispy 原字段 | 说明 / 落点 |
|------|----------------|-------------|
| 店铺 | `root_path` + `icon` + `shop_type` | 域名 + 头像 + 平台徽标(shopify/woocommerce/…) |
| 匹配商品 | `product_id`（上下文） | 本次是按哪个商品找的相似竞店 |
| 广告平台 | `plat_type` | 徽标：TikTok / Facebook / Meta Library |
| 全平台广告数 | `all_data_count` | 总创意数 |
| 总播放/展示 | `all_play_count` | 曝光量 |
| CPM 区间(USD) | `all_min_cpm` ~ `all_max_cpm` | 投放成本区间 |
| 预估订单 | `all_min_cpa` ~ `all_max_cpa` | 预估转化量 |
| 投放天数 | `all_put_days` | 持续投放时长 |
| 最早/最近投放 | `all_found_time` / `all_latest_found_time` | 时间线 |
| 投放状态 | `all_store_ad_state` | −1 停投 / 0 下架 / 1 活跃 |
| 月访问量 | `website_info.website_monthly_visits` | 网站流量 |
| 跳出率 / 时长 | `website_info.website_bounce_rate` / `visit_seconds` | 流量质量 |
| 投放国家 | `region[]` | ISO 3166-1 alpha-2 |
| 品类标签 | `ai_category[]` | AI 识别品类 |
| 最新素材 | `good_source[]`（≤3） | 封面/商品图/视频缩略 |
| 收藏 | `is_collection` | 加入 watchlist |

**平台细分视图**：提供 TikTok / Facebook / Meta Library 三列切换，展示对应前缀字段（`tiktok_*` / `facebook_*` / `facebook_library_*`，含 Library 专属 `reach` / `adset_active_count` / `ad_platform`）。

**监控态**：收藏店铺 → 定时重抓（受 TTL 缓存与信用点预算约束，见 §3.2）；状态变化（如竞店新开投、播放激增）高亮提示。

---

### 2.4 视图二 · 素材学习（指定商品 + 创意）

**「学习指定商品」入口**：填 `product_id` → 调 `competition(product_id)` → 拿到所有卖该商品的竞店 + 各自 `good_source` → 聚合该商品的**主流素材打法**。

**创意卡片字段矩阵**（来自 `good_source[]`）：

| 字段 | 原字段 | 说明 |
|------|--------|------|
| 平台 | `platform` | 1=TikTok / 2=Facebook / 3=Meta Library |
| 封面 | `cover` | 广告封面图 |
| 商品图 | `app_image` | 落地商品图/App 图标 |
| 播放/展示 | `count` | 该创意曝光 |
| 视频 | `video_id` | 视频创意 ID → 播放器取流（需 CDN/详情接口） |
| 归属竞店 | 父级 `root_path` | 来自哪家竞店（可跳转竞店监控） |

**素材学习动作**：
- 视频播放（⚠️ **已知限制**：pipispy `rank-list` / `detail` / `good_source` 均**不返回可播 `video_url`**，仅提供 `video_id`；当前无公开视频流接口。v1 降级为**仅展示封面 / 缩略图**，视频内嵌播放暂缓，待 Phase 0 确认 pipispy 视频 CDN / 取流接口后再补）。
- 按平台筛选（TikTok / Facebook / Library）。
- 收藏 / 打标到本地素材库（存后端或 localStorage 快照）。
- **文案 / 可播视频**：点击卡片 → **统一详情抽屉** → `adlibrary-product-detail`（懒加载；若扣费则抽屉内二次确认）。⚠️ 该接口返回商品图 / 店铺 / 广告主信息，**无创意文案正文、无直接可播 `video_url`（仅 `video_id`）**：Copilot「改写文案」改为读 product `title` 做有限改编，视频播放见下方「取流限制」。

---

### 2.5 视图 · 发现（原「榜单」并入）

- **TTS 店铺**：`tiktok-shop-list` — 筛选 + 排行表 + 分页。
- **广告商品 · 排行**：`ad-product-rank-list`（真实 uri `/v3/api/open/rank/ad-product/list`）— 默认态。
  - **请求参数**（`POST` body `params`）：`current_page`(≥1)、`page_size`(≤20)、`type`(**1=日榜 / 2=周榜 / 3=月榜，UI 必须提供日/周/月切换**)、`sort_key`(**`count_growth` 播放增长 / `growth_rate` 增长率 / `video_count` 视频数，UI 必须提供排序控件**)、`sort_type`(`desc`/`asc`)、`time`(所选周期午夜时间戳，秒)、可选筛 `region`(逗号分隔 ISO-3166)、`shop_type`(magento/shopify/shoplazza/…)、`plat_type`(0 全 / 1 TikTok / 2 Facebook)、`count_growth_min/max`、`growth_rate_min/max`。
  - **返回字段矩阵**（`data.data[]`）：`id`、`image`、`title`、`currency`、`price`、`usd_price`、`min_cpm`/`max_cpm`(可空)、`count_growth`、`video_count`、`growth_rate`、`is_collection`、`platform`(shopify/shopline/…)；分页 `data.page { total_count, page_count, current_page, page_size, is_next }`。
  - **计费**：按返回结果条数计费，每条 1 信用点（page_size=20 ⇒ 约 20 点/页），受 §3.2 TTL 缓存影响。
- **广告商品 · 搜索**：`adlibrary-products-search` — 关键词/条件；**禁止输入即搜**，Enter/按钮/Copilot 确认后请求；与排行 **共用结果表**。
- **行操作**：watchlist · 看竞店（`competition(product_id)`）· 看详情（drawer）· 学素材（切 Tab 素材）。
- **v1.5 以图搜**：submit → status → result-summary；Job 进度 + **累计 actual**。
- **筛选控件**：请求 param 的合法取值见 **§2.8 公共枚举**（与 pipispy doc「Others」对齐，禁止前端硬编码过期码表）。

---

### 2.8 公共枚举与筛选词典（pipispy · Others）

> 来源：pipispy 文档 **Others** 系列（**不扣点**的参考页，非 data API）。公开页需登录渲染，**全量 code→label 在 Phase 0 从文档导出或试调用校验**后落库；筹备期先定 **映射关系** 与 **同步策略**。

| 文档 | 链接 | 主要用途（推断 param / 展示） | 运营中心落点 |
|------|------|--------------------------------|--------------|
| Region | [others-region](https://www.pipispy.com/doc/others-region) | 国家/地区码 | 发现 rank/search/TTS 筛选；竞店 `region[]` chip 文案 |
| Product category（广告/Ecom） | [others-product-category](https://www.pipispy.com/doc/others-product-category) | 广告商品类目 | 发现 · 广告商品 · 排行/搜索 |
| Product category（TTS 店） | [others-product-category-tt-shop](https://www.pipispy.com/doc/others-product-category-tt-shop) | TikTok Shop 店铺类目 | 发现 · TTS 店铺榜（**与广告类目分表，禁止混用**） |
| Ad shop type | [others-ad-shop-type](https://www.pipispy.com/doc/others-ad-shop-type) | 独立站/平台店型 | 竞店 `shop_type` 徽标与筛选；发现侧店型 filter |
| Button（CTA） | [others-button](https://www.pipispy.com/doc/others-button) | 广告按钮/CTA 类型 | 素材详情抽屉、创意卡片 CTA 展示/筛选 |
| App or games category | [others-app-or-games-category](https://www.pipispy.com/doc/others-app-or-games-category) | App/Game 垂直类目 | 发现/搜索当商品类型含 App 时的类目筛选 |

**实现约定（与 Ledger 并行，P0 参考层）**

1. **单一来源**：tangbuy-plugin 维护 `marketing_pipispy_reference`（或版本化 JSON bundle），由 Phase 0 从上述 doc **人工/脚本快照** 写入；前端 **只读** `GET /api/plugin/marketing/reference/enums?keys=region,product_category,...`。
2. **缓存**：枚举 bundle **长 TTL**（如 7d）+ 手动 `version` 字段；变更时 bump version，不影响 pipispy 业务缓存 key。
3. **i18n**：API 存 pipispy 官方 label（英/中若 doc 双语则一并存）；UI 层 `ops.enums.*` 可覆盖展示，**请求仍用原始 code**。
4. **探针**：各 list/search 接口文档里的 param 名（如 `region`、`category_id`、`shop_type`、`button_type`）与 Others 表 **逐一对照**，不一致处以试调用为准写进字段矩阵。
5. **Copilot**：自然语言「美国 + 宠物类」→ 解析为 **已注册 enum code**，非法值拦截在出站前（不 estimate）。

---

### 2.6 页面结构 · 商业化（v1 槽位，不对商家开票）

| 区域 | v1 | v2（商业化） |
|------|-----|----------------|
| 左栏用量 | 本店本月 **actual 汇总** + 最近 20 条分录抽屉 | 套餐额度「已用/总量」+ 账单页 `/operations-center/usage` |
| 上下文条 | 本次 **estimated**、上次 actual | 同左 + 套餐徽章 |
| 扣费 Modal | 列表/竞店：**预估 N 点** → 确认 → 带 `ledger_id`/trace | 同左 + 升级 CTA |
| Cache 命中 | Toast「未消耗（缓存）」 | 同左 |
| 详情抽屉 | 媒体 + 文案 + 本条 estimate/actual | 同左 + 功能门控 |

**路由**：`/ [locale]/operations-center?view=discovery|competition|creatives`；发现内 `rank=tts-shops|ad-products`（可选 query）。

---

### 2.7 右侧 AI 面板职责（营销运营 Copilot）
复用已验证的 `command-schema / plan-command` 模式（sku 已落地，订单中心复用）：
- 自然语言查询：`查一下店铺 X 近 30 天 TikTok 投放情况`、`把 pet 类竞店按播放量排个序`、`哪些竞店这周新开投了`。
- 素材洞察：`这段视频的卖点/钩子是什么`（读 product / advertiser 信息生成）。⚠️ `给这条创意写个改编文案`：pipispy **不提供创意文案正文**，改为基于 product `title` / 卖点做有限生成（数据源限制，详见 §2.4）。
- 发现类：「找 Meta 上宠物垫片热门商品」→ 解析为 **search** 参数；执行前 **总预估** 确认。
- **信用点护栏**：与 **estimate → settle** 同源；Copilot 批量/query 先出计划再确认。

---

## 3. 架构方案：外部竞品数据源的服务端代理

### 3.1 与订单中心的关键差异
订单中心数据**内部**（Shopify + tangbuy 货源 + 物流），经 `/api/plugin` 代理。运营中心数据**外部**（pipispy 第三方），且**按结果扣信用点、API Key 必须保密**。pipispy 代理**实现在 `tangbuy-plugin`（Java）内**（复用 `/api/plugin` 代理，不另起 Node），前端经 `/api/plugin/marketing` 调用，并**复用同一套双形态宿主与 UI 原语**。

### 3.2 pipispy 服务端代理 + 积分记账（P0）

- **Key 在 tangbuy-plugin**；前端 `/api/plugin/marketing/*`；**唯一 PipispyClient**，禁止旁路。
- **请求方法统一 `POST /open-api/v1/data`**，body `{ key, uri, params }`；`uri` 一律用 §2.2 真实 path 映射里的 pipispy 路径（禁止 GET、禁止友好名）。
- **TTL 缓存**（24h，endpoint + params_hash + page）；命中仍 **settle actual=0** 并记账。
- **免费** `competition/products`：estimate/settle 均为 0。
- **detail 免费条件**：同一 `id` 3 天内已查过，或该 `id` 出现在你近 3 天的榜单查询结果中 ⇒ 免费（consumed=0），与 TTL 缓存不扣点逻辑一致（§3.2 缓存命中也 settle actual=0）。
- **商家定价后续再定**；表 **`marketing_pipispy_ledger`**，**预估 → 结算**（见下）。

| 阶段 | 时机 | 字段 |
|------|------|------|
| estimate | 用户确认后、出站前 | `estimated_credits`（**列表按返回结果条数计费，每条 1 点**，page_size≤20 ⇒ ≤20；`detail` 1 点/请求） |
| settle | cache 或 pipispy 返回 | `actual_consumed_credits`、`remaining_credits`、`result_count` |

报表用 `SUM(actual_consumed_credits)` 按店/日/endpoint。API 响应带 `ledger_id`、estimated、actual、remaining。测试期不做硬拦截，但 **100% 调用经账本**。图搜 Job 多行分录、累计 actual。

```
前端 → /api/plugin/marketing/*
     → PipispyClient → Ledger(estimate→settle) → Cache? → pipispy
```

- 错误/配额：`remaining` 不足友好提示；并发与频率护栏。
- 我方付 pipispy；护栏防误刷，非对商家计费。

### 3.3 复用 Feature-Package + Host-Shell（与订单中心同构）
```
┌─ Host A：嵌入式（/[locale]/operations-center/*，WorkbenchShell + App Bridge）
├─ Host B：独立站（同包，关 App Bridge，仅 NEXT_PUBLIC_API_BASE 不同）
└─ 共享层
     @tangbuy/hub-ops    运营中心功能包（React + 自有数据层，依赖下方两者，不依赖 useOnboarding）
     @tangbuy/ui         共享 UI 原语（Button/Card/Table/AssistantRail 抽象）
     @tangbuy/data       数据客户端（封装 /api/plugin，含 /api/plugin/marketing 透传 + 鉴权适配层）
           │
           ▼
     tangbuy-plugin (Java)  ← 内部数据 + marketing（PipispyClient + Ledger + 缓存）
           │
           ▼
     pipispy API（外部竞品情报，按信用点计费）
```
- 双形态共用同一套后端（tangbuy-plugin 内已含 pipispy 代理，key 始终服务端），仅 `NEXT_PUBLIC_API_BASE` 决定路由到嵌入式还是独立站。
- `hub-ops` 与 `hub-order` 同级，互不耦合，可独立并行开发。

### 3.4 演进路径（评估合并后）

| 阶段 | 内容 |
|------|------|
| Phase 0 | 设计 v2 冻结；**pipispy 真实探针**（字段/扣费/ID） |
| Phase 1a | **Ledger + PipispyClient** |
| Phase 1b | **竞店 + 素材**（competition + products）；档位 1 |
| Phase 2 | **发现** rank + search + **detail 抽屉**；档位 2 |
| Phase 3 | TTS `tiktok-shop-list`；档位 3 |
| Phase 4 | 图搜 submit/status/result-summary；Copilot 深指令 |
| 并行 | 双形态宿主；可选 `@tangbuy/ui` / `@tangbuy/data` 抽取 |

### 3.5 与开店部分的边界（同订单中心）
| 维度 | 开店部分 | 运营中心 |
|------|----------|----------|
| 驱动 | 流程向导 / 引导进度 | 数据 / 外部情报 |
| 导航 | `StepSidebar` + onboarding | 中枢导航（新） |
| 部署 | 仅嵌入式 | 嵌入式 + 独立站 |
| 耦合 | `useOnboarding` | `@tangbuy/data` 适配层（pipispy 代理在 tangbuy-plugin 内）|
| 数据 | 内部（Shopify/货源） | 外部（pipispy，按信用点计费）|

---

## 4. UI 样式规划（沿用订单中心令牌，保持一致性）

> **视觉规范来源**：开店页 + 订单中心已与团队规范对齐（`dev` 提交 `cdfeb69` 及后续 `main` 非订单中心部分）。**运营中心（`@tangbuy/hub-ops`）必须复用同一套表现层**，禁止再手写一套 Tab/按钮/卡片。订单中心专项审计见 [`ORDER_CENTER_VISUAL_AUDIT_PRD.md`](ORDER_CENTER_VISUAL_AUDIT_PRD.md)；实现参照 `src/app/[locale]/order-center/page.tsx`（合并 WIP 前以共享组件用法为准）。

### 4.1 Hub 共享视觉规范（运营中心开发必遵）

**组件（只用共享原语，禁止 page 内手写替代品）**

| 用途 | 组件 | 路径 |
|------|------|------|
| 主/次按钮 | `Button` | `@/components/ui/button`（`rounded-[var(--radius-control)]`，variant `primary` / `secondary`） |
| Top Tab / 分段 | `SegmentedTabs` | `@/components/workbench/segmented-tabs`（运营中心 Top Tab 用 **`variant="chip"`**，与订单中心一致） |
| 只读指标卡 | `MetricSummaryCards` | `@/components/workbench/metric-summary-cards`（左栏用量摘要、发现层 KPI 若需要） |
| 中栏壳 | `WorkbenchPanel` + `WorkbenchShell` | `@/components/workbench/*`；标题旁标签用 **`titleSuffix`**（物流页 On Time 标签同款） |
| 三栏布局 | `WorkspaceLayout` / `HubSidebar` / `AssistantRail` | 与订单中心同构 |
| 表格 | 现有 `Table` 原语 | `@/components/ui/table`；选中行见下 token |

**语义 token（禁止硬编码 `#666` / `emerald-50` / 随意 `brand-soft` 当背景）**

| 场景 | 推荐 class | 避免 |
|------|------------|------|
| 正文/标题 | `text-ink` / `text-ink-muted` / `text-ink-subtle` | 裸 `#666666` |
| 边框/分割 | `border-hairline` | 随意 `border-gray-*` |
| 表面/卡片 | `bg-surface`、`shadow-card`、`rounded-[var(--radius-card)]` | 一次性 shadow |
| 成功/ live 徽标 | `bg-success-soft text-success` | `bg-emerald-50 text-emerald-600` |
| Mock / 降级 | `bg-muted text-ink-muted` | `bg-slate-100` |
| 表格行选中 | `!bg-surface-selected !ring-1 !ring-inset !ring-brand` | 自造 `brand-soft/60` 除非设计明确要求 |
| 链接 | `text-link hover:text-link-hover` | 纯 `text-blue-600` |

**Sourcing Mint**：`brand` / mint 系仅用于**货源/选品/正向 CTA** 语义；竞店状态、中性统计、禁用态**不得**误用 mint 当「成功绿」——用 `success-*` 或 `neutral` tone。

**次要/工具操作（刷新、同步、关闭、列表旁重试）**

- **小 icon-only 按钮**：`Button` `h-7 w-7 px-0` + 图标约 `h-3.5 w-3.5`；必须 **`title` + `aria-label`**；放在所操作区块标题行旁，不要单独大段文案按钮。
- 示例：订单中心 header 刷新；运营中心左栏 watchlist 同步、用量抽屉关闭。

**运营中心特有（在共享规范之上）**

- **平台徽标色**（pipispy `plat_type` / `good_source.platform`）：TikTok 品红、Facebook 蓝、Meta Library 深蓝——可用小圆点/角标，不覆盖整卡背景。
- **扣费/用量**：预估/actual 用 `warning` / `neutral` tone 的 chip 或上下文条，不用 scare 红色除非错误；Cache 命中用 `success-soft` 轻提示。
- **i18n**：新增键族 **`ops.*`**，四语镜像；文案不进组件硬编码。

**Workbuddy / AI 实现检查清单**

1. 新页面先套 `WorkbenchShell` + `HubSidebar` + `WorkbenchPanel`，再填业务。
2. `git diff` 自检：运营中心目录下不应出现新的 `TabPill`、手写 `<button className="rounded-full bg-brand…">` 等重复原语。
3. 验证：`npx tsc --noEmit -p tsconfig.json`（勿并行多次 tsc）。

### 4.2 设计令牌（布局与品牌）

- 三栏宽度：`--wb-sidebar-w`（左）、`--wb-rail-w`（右），沿用 `WorkspaceLayout` grid。
- 品牌色：`--brand` / `--brand-soft`（见 §4.1 mint 用法约束）。
- 平台色：TikTok=品红黑、Facebook=蓝、Meta Library=深蓝；竞店投放状态：活跃=绿、下架=灰、停投=红（优先映射到语义 success / muted / danger token，若全局有定义）。

### 4.3 左栏（无模块导航）
- Watchlist 分组 + **本店用量** + 用量明细抽屉；模块 Tab 仅在中栏：**发现 | 竞店 | 素材**。

### 4.4 主区
- **发现**：TTS 表 / 广告商品表（排行+搜索共用）；扣费 Modal + 上下文条。
- **竞店**：卡片网格 + 平台分段 + 免费选品。
- **素材**：创意网格 + **统一详情抽屉**（adlibrary-product-detail）。
- **竞店抽屉**：全量指标 + 网站流量（保留 §2.3 字段矩阵）。

### 4.5 右侧 AI 栏
- 复用 `AssistantRail` + 营销运营 Copilot（沿用 sku `SkuAgentPanel` 交互范式 + 订单中心 Command 模式）。

---

## 5. API 映射与字段落点总表

| 用户诉求 | pipispy 接口 | UI | 覆盖度 |
|----------|--------------|-----|--------|
| 监控竞店 | `store/detail/competition` | Tab 竞店 §2.3 | ✅ |
| 先选商品 | `competition/products`（免费） | 竞店/素材入口 | ✅ 0 点 |
| 素材列表 | `competition` + `good_source` | Tab 素材 §2.4 | ✅ 视频 |
| 文案/详情/视频 URL | `adlibrary-product-detail` | 统一抽屉 | ✅ 档位 2 |
| 商品排行 | `ad-product-rank-list` | 发现 · 排行 | ✅ |
| 商品搜索 | `adlibrary-products-search` | 发现 · 搜索 | ✅ |
| TTS 店榜 | `tiktok-shop-list` | 发现 · TTS | ✅ Phase 3 |
| 以图搜 | submit + status + result-summary | 发现 v1.5 / Copilot | ✅ Phase 4 |
| 用量/定价 | `marketing_pipispy_ledger` | 左栏 + 内部报表 | ✅ P0 |
| 筛选枚举 | Others 六 doc（§2.8） | 发现/竞店/素材筛选 + Copilot | ✅ 参考层 P0 |

---

## 6. 待确认 / 开放问题

1. **探针**：各 URI 真实字段名、扣费时点、TTS shop_id 与 `store_id` 映射；**§2.8 六份 Others 枚举快照** — Phase 0 必做。
2. **detail 平台**：`adlibrary-product-detail` 是否覆盖 TikTok 创意；若不覆盖需第二 detail URI。
3. **视频 URL**：以 detail 响应为准；探针确认。
4. **Key / 配额（已定）**：Key 在 plugin；测试期不硬拦截；**账本 estimate→settle 必做**。✅
5. **商家计费（已定）**：账本 actual 先行；定价引擎 v2。✅
6. **双形态鉴权**：同订单中心待确认。
7. **i18n**：`ops.*` 四语。

---

*筹备稿 v2.1（2026-07-24）：pipispy 评估 + 商业化 + 积分记账 + **§4.1 Hub 共享视觉规范**（对齐开店/订单中心 cdfeb69）。下一步 Phase 0 探针或档位 2（Ledger → 运营中心壳）。*
