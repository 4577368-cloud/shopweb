# 运营中心 · 返回数据结构 → 内容用法映射（供排版 / 布局设计）

> 用途：这份文档把运营中心每个数据接口的**返回字段**和**当前界面落点**一一对应，并标注
> 「这条内容该怎么用 / 该怎么排版」。你可以直接基于字段结构独立设计界面，不必看代码。
> 当前前端是 mock 原型（`USE_MOCK=true`），字段与真实 pipispy 代理响应**完全一致**；
> 接真实后端时只换 `src/lib/marketing/api.ts` 内部实现，组件与这份映射不动。

---

## 0. 通用规则

- **统一响应包裹** `MarketingResponse<T>`（所有接口都包这层）：
  | 字段 | 类型 | 含义 | 界面用法 |
  |---|---|---|---|
  | `data` | `T` | 业务数据 | 各视图主体 |
  | `source` | `"pipispy" \| "mock"` | 数据来源 | 调试角标，一般不展示 |
  | `remainingCredits` | `number` | 调用后账户剩余（api credits） | 顶部「市场脉搏」/ 消费反馈 |
  | `consumedCredits` | `number` | 本次实际消耗 | 用量审计、上下文条 |

- **分页** `PageMeta`：`totalCount / pageCount / currentPage / pageSize / isNext`，所有列表接口都返回，驱动底部分页器。

- **计费口径（硬事实）**：普通接口 **1 点/次**，以图搜 v1.5 **3 点/次**（submit+status+result 三步）；余额是 **API 账户级**（对应你的 key），不是单用户。缓存命中 0 点。详见 §10。

---

## 1. 竞店监控 — `store/detail/competition`

**请求** `CompetitionParams { id, productId?, pageSize?, currentPage? }`
**响应** `data: { stores: StoreRow[], products: AdCard[] }`

### StoreRow 字段表（竞店卡片 / 详情抽屉的数据源）
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `id` / `storeId` | string | 店铺唯一标识 | 对比 / 收藏主键 |
| `name` | string | 店铺名 | 卡片标题、详情标题 |
| `rootPath` | string | 店铺主页路径 | 详情「访问店铺」链接 |
| `icon` | string(url) | 店铺 logo | 卡片封面圆标 |
| `shopType` | string | 建站类型（shopify/shoplazza/magento…） | 卡片副标题、筛选 |
| `platform` | `"tiktok"\|"facebook"\|"meta"` | 主平台 | 平台徽章 |
| `platType` | 同上数组 | 全平台分布 | 平台筛选、分布堆叠条 |
| `adCount` | number | 广告总数（all_data_count） | 指标网格 |
| `playCount` | number | 总播放（all_play_count） | 指标网格、分布条数值 |
| `diggCount` | number | 总点赞 | 指标网格 |
| `putDays` | number | 投放天数 | 指标网格 |
| `foundTime` / `latestFoundTime` | number(Unix 秒) | 首次/最近发现时间 | 详情时间线 |
| `cpmMin` / `cpmMax` | number | CPM 区间 | 指标网格、区间展示 |
| `cpaMin` / `cpaMax` | number | CPA 区间 | 指标网格 |
| `pageCount` | number | 广告主账号数 | 指标网格 |
| `adState` | `-1\|0\|1` | 投放状态（停投/下架/活跃） | 状态徽章 |
| `monthlyVisits` / `bounceRate` / `visitSeconds` | number | 网站流量 | 详情 Website 块 |
| `regions` | string[] | 投放地区 | 地区 chips、筛选 |
| `categories` | string[] | 类目（ai_category） | 类目 chips、筛选 |
| `latestCreatives` | `StoreCreative[]`(≤3) | 最新素材 | 卡片素材缩略、详情大图 |
| `popularPersonCount` | number | 达人合作数 | 指标网格 |
| `isAi` / `isDrama` | boolean | 是否 AI 货 / 短剧 | AI/Drama 标签 |
| `appType2` | string | web/game/app | 详情副信息 |
| `website` | `WebsiteInfo` | 站点信息（见下） | 详情 Website 块 |
| `tiktok` / `facebook` / `metaLibrary` | `PlatformBreakdown\|null` | 分平台聚合 | 分布堆叠条、详情分平台指标 |
| `isCollection` | boolean | 是否已收藏 | 收藏按钮状态 |
| `growthSeries` | number[] | 近 12 期投放趋势（mock） | 卡片/详情 Sparkline |

**StoreCreative**：`cover` / `appImage`(url) / `count`(曝光) / `videoId` / `platform`。
**WebsiteInfo**：`url` / `title` / `icon` / `monthlyVisits` / `bounceRate` / `visitSeconds` / `languages[]` / `countries[]` / `currencies[]` / `summary`(文案摘要)。
**PlatformBreakdown**：`dataCount` / `playCount` / `pageCount` / `minCpm` / `maxCpm` / `minCpa` / `maxCpa` / `putDays` / `foundTime` / `latestFoundTime` / `adState` + Meta 专属 `reach` / `adsetActiveCount` / `adActiveCount` / `adInactiveCount` / `adPlatform[]`。

### 当前界面落点
- **竞店卡片网格**：封面圆标 + 名称 + 平台徽章 + 状态；下方指标网格（9 格：广告数/播放/点赞/投放天数/CPM 区间/CPA 区间/账号数/月访问/跳出）；平台分布 StackedBar；趋势 Sparkline；AI/Drama 标签；地区/类目 chips；多选对比 checkbox。
- **竞店详情抽屉**：9 格指标 + 分平台明细（PlatformBreakdown）+ Website 信息块 + 趋势 Sparkline + 收藏。
- **概览条**：本页 `tracked / totalAds / totalPlays / avgCpm` 汇总。

### 内容该怎么用（设计建议）
- **最核心**：店铺名 + 平台 + 投放状态 + 广告规模（adCount）+ 播放规模（playCount）。这五个应一眼可见。
- **差异化价值**：CPM/CPA 区间（判断竞店投放成本）、regions/categories（判断品类与区域打法）、isAi/isDrama（判断货盘类型）。
- **趋势**：growthSeries 用 Sparkline 体现"近期是否在加投"，比单数字更有说服力。
- **分平台**：tiktok/facebook/meta 三套指标决定你"该去哪个平台抄"。建议详情里三栏并排。
- **诚实缺口**：视频只有 `videoId` 无可播 URL；文案无正文（见 §6）。别在卡片上放"播放"按钮假动作。

---

## 2. 发现 · 榜单 — `rank/ad-product/list`

**请求** `RankParams { type(1日/2周/3月), sortKey(count_growth|growth_rate|video_count), sortType, time?, region?, category?, shopType?, platType(0/1/2), countGrowthMin/Max?, growthRateMin/Max?, page?, pageSize? }`
**响应** `data: { list: RankRow[], page: PageMeta }`

### RankRow 字段表
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `id` | string | 商品 id | 详情主键 |
| `image` | url | 商品主图 | 行首封面 |
| `title` | string | 商品标题 | 行标题 |
| `currency` / `price` / `usdPrice` | — | 价格（原币 + 美元） | 价格列 |
| `countGrowth` | number | 销量增长数 | 增长数列 + 排序 |
| `videoCount` | number | 视频数 | 视频数列 |
| `growthRate` | number | 增长率 | 增长率列 |
| `minCpm` / `maxCpm` | number\|null | CPM 区间 | CPM 区间列 |
| `reach` | number | 估算曝光 | 概览条 |
| `platform` | string | 建站平台（shopify/shopline…） | 平台列 |
| `region` / `category` | string | 地区/类目（mock 合成，真实由请求过滤） | 筛选回显 |
| `growthSeries` | number[] | 近 12 期增长趋势 | 行内 Sparkline |
| `isCollection` | boolean | 收藏 | 收藏 |

### 当前界面落点
发现视图「榜单」子页：指标概览条（商品数/总增长/平均 CPM/曝光）+ 结果表（行内 Sparkline、CPM 区间列、增长数/率/视频数、平台、操作「看竞店 / 详情」）+ 分页。

### 内容该怎么用（设计建议）
- **主排序维度**：count_growth（起量最猛）、growth_rate（增速最快）、video_count（素材最密）。默认建议 count_growth 降序。
- **行内趋势**是这页的灵魂：用 Sparkline 让用户不点进去也能看出"是不是刚起量"。
- **CPM 区间**是选品成本信号，建议用颜色区间（低=绿/高=红）而非纯数字。
- **诚实缺口**：`region`/`category` 是 mock 合成字段，真实由请求参数过滤、响应不含逐行值；接后端后这两列可移除或改由筛选条件回显。

---

## 3. 发现 · TikTok Shop 榜 — `tiktok-shop-list`

**请求** `TtsShopParams { page?, pageSize?, category?, region? }`
**响应** `data: { list: TtsShopRow[], page: PageMeta }`

### TtsShopRow 字段表
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `name` | string | 店铺名 | 行首 |
| `category` / `region` | string | 类目/地区 | 列、筛选 |
| `followers` | number | 粉丝数 | 列 |
| `monthlyVisits` | number | 月访问 | 列 |
| `adCount` | number | 广告数 | 列 |
| `growthRate` | number | 增长率 | 列 |
| `salesEstimate` | number | 估算月销（mock） | 列 |
| `growthSeries` | number[] | 近 12 期趋势 | 行内 Sparkline |

### 内容该怎么用（设计建议）
- 这是"店铺维度"的榜单，和 §2 的"商品维度"互补：看的是**谁在投**、不是**哪个品在爆**。
- 建议列顺序：店铺 → 类目 → 地区 → 粉丝 → 月访问 → 广告数 → 增长率 → 估算月销。
- `salesEstimate` 是 mock 估算，真实可由店铺 GMV 接口补充；标注"估算"避免误导。

---

## 4. 发现 · 搜索广告 / 素材库 — `ad-products/search`

**请求** `fetchSearchAds(q, page, pageSize)`（q=关键词）
**响应** `data: { list: AdCard[], page: PageMeta }`

### AdCard 字段表（同时是 §5 详情的来源之一）
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `id` | string | 广告/商品 id | 详情主键 |
| `image` | url | 主图 | 卡片封面 |
| `title` | string | 标题 | 卡片标题 |
| `currency` / `price` / `usdPrice` | — | 价格 | 价格 |
| `platform` / `platformCode` | — | 平台（1TikTok/2Facebook/3Meta） | 平台徽章 |
| `videoId` | string | 视频 id（无可播 URL） | 详情，`copyUnavailable` 提示 |
| `countGrowth` / `videoCount` / `growthRate` | number | 增长指标 | 卡片副信息 |
| `likeCount` | number | 点赞数（good_source.count） | 卡片「点赞」 |
| `ctaType` | string | CTA 文案（Others 枚举） | 卡片 CTA 徽标 |
| `isCollection` | boolean | 收藏 | 收藏 |
| `region` / `category` | string | 地区/类目（mock 合成） | 筛选回显 |
| `growthSeries` | number[] | 趋势 | 卡片 Sparkline |

### 当前界面落点
- **发现·搜索**子页与**素材** Tab 共用 `AdCard`：网格卡（封面 + 标题 + 价格 + 平台徽章 + 点赞数 + CTA 徽标 + 行内趋势 Sparkline），点击开详情抽屉。
- 素材 Tab 额外有平台筛选（all/tiktok/facebook/meta）。

### 内容该怎么用（设计建议）
- 素材库的核心价值是**抄创意**：封面图 + 标题 + CTA + 点赞，四要素应同卡可见。
- `ctaType` 决定落地页动作（Shop now / Learn more…），建议做成小徽标而非文字。
- `likeCount` 是"这个素材跑没跑出来"的信号，建议排序/高亮。

---

## 5. 广告详情 — `ad-products/detail`

**请求** `fetchAdDetail(id)`
**响应** `data: AdDetail`

### AdDetail 字段表
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `product.id/title/image/appImage/price/usdPrice/currency` | — | 商品信息（image 主图，appImage 应用截图） | 详情头部双图 |
| `store` | `{name, domain}` | 投放店铺 | 详情「来自店铺」 |
| `advertisers` | `{id, name}[]` | 广告主 | 广告主列表 |
| `adStartedHistory` | string[] | 起投时间历史 | 时间线 |
| `ctaType` | string | CTA 文案 | CTA 徽标 |
| `likeCount` | number | 点赞 | 指标 |
| `platform` / `platformCode` | — | 平台 | 平台徽章（取自 detail） |
| `videoId` | string | 视频 id | 视频占位（无 URL） |
| `copyUnavailable` | `true` | **pipispy 不提供文案正文** | 文案降级条 |

### 内容该怎么用（设计建议）
- 双图（appImage 应用截图 + image 商品图）是这页重点：左 App 截图、右商品图，让用户判断"落地页长啥样"。
- `advertisers` + `adStartedHistory` 回答"谁在投、投了多久"——这是判断竞店打法深度的关键。
- **诚实缺口（必须明示）**：`copyUnavailable=true`，pipispy 不返回广告文案正文。界面用降级条标注"文案暂不可用"，不要留空输入框误导。视频同理只有 id 无播放地址。

---

## 6. 以图搜 v1.5 — `ai-search-image-submit / -status / -result-summary`

**请求** 上传图片 → submit 拿任务号 → status 轮询 → result-summary 取结果
**响应** `data: { list: ImageSearchResult[], page: PageMeta }`

### ImageSearchResult 字段表
| 字段 | 类型 | 含义 | 当前界面落点 |
|---|---|---|---|
| `id` | string | 结果 id | 详情主键 |
| `image` | url | 命中素材图 | 结果网格封面 |
| `title` | string | 标题 | 标题 |
| `platform` | AdPlatform | 来源平台 | 平台徽章 |
| `usdPrice` | number | 价格 | 价格 |
| `similarity` | number(0..1) | 相似度 | 百分比 + 排序 |
| `store` | string | 来源店铺 | 来源 |

### 内容该怎么用（设计建议）
- 核心是 **similarity（相似度%）**：结果必须按相似度降序，且每张卡显式标百分比。
- 真实是 submit+status+result **三步 = 3 点**（见 §10）；mock 已按 3 点计。
- 点击结果 → 复用 §5 广告详情抽屉，形成"以图搜 → 看竞品详情"闭环。

---

## 7. 账户余额 — `/open-api/v1/credits-balance`

**响应** `CreditsBalance`（8 字段）：`totalApiCredits` / `remainingApiCredits` / `purchasedApiCredits` / `usedApiCredits` + 同构四项的 `monitor*`。

### 当前界面落点
- 顶部「市场脉搏」：**API 余额** + **监控余额** 两项账户级指标。
- 左栏 `usage-card`：**API 账户余额**卡（剩余/总额进度 + 本会话消耗 + 监控额度）。
- **monitor_credits 当前无任何功能消耗**，仅展示余额（监控类功能未接入）。

### 内容该怎么用（设计建议）
- 余额是**账户级**（你的 key），不是单商家。展示时别写成"你的剩余"，写"账户剩余"。
- 建议做"剩余百分比 + 低额预警"：低于某阈值变红，配合 `REAL_BILLING` 护栏。
- monitor 额度未来接"监控任务"时才有消耗，现在可弱化展示或折叠。

---

## 8. 本会话用量审计（前端，非 pipispy）

`UsageEntry { time, endpoint, consumed, cacheHit, remainingAfter }` + `UsageLedger { sessionUsed, entries }`。
**界面**：`usage-drawer`（明细表）+ `context-bar`（最近一次消耗反馈）。仅记录本会话，余额本身由 §7 持有。

---

## 9. 计费口径汇总（设计定价 / 护栏用）

| 功能 | pipispy 接口 | 扣点 | 额度类型 |
|---|---|---|---|
| 竞店监控 | `store/detail/competition` | 1 点/次 | api |
| 发现·榜单 | `rank/ad-product/list` | 1 点/页 | api |
| 发现·TikTok Shop 榜 | `tiktok-shop-list` | 1 点/页 | api |
| 发现·搜索广告 / 素材库 | `ad-products/search` | 1 点/页或查询 | api |
| 广告详情 | `ad-products/detail` | 1 点/次打开 | api |
| 以图搜 v1.5 | `ai-search-image-*` | **3 点/次**（三步） | api |
| 账户余额查询 | `credits-balance` | **0（只读）** | — |
| 市场脉搏 / 对比弹窗 / 缓存命中 | — | **0** | — |

- `monitor_credits`：当前 0 消耗，仅展示余额。
- 真实消耗以 pipispy 响应 `consumed_credits` 为准，前端常量仅离线参考。

---

## 10. 给你排版设计的开放问题（请拍板）

1. **竞店卡片信息密度**：现在 9 格指标 + 分布条 + 趋势，是否过密？要不要默认折叠"CPA/账号数/跳出"，hover 展开？
2. **榜单默认排序**：count_growth（起量）还是 growth_rate（增速）？要不要给用户一键切换并记住？
3. **详情抽屉信息层级**：9 格指标 + 三平台 + Website + 趋势，是否要分 Tab（概览 / 平台 / 流量 / 时间线）而不是长滚？
4. **以图搜结果排序**：相似度阈值（如只显示 ≥70%）要不要做成滑块？
5. **monitor_credits 未来形态**：监控任务（定时盯某店/某品）的"任务卡"长什么样？现在只展示余额，等你要做监控时再设计。
6. **诚实缺口呈现**：视频无播放地址、文案无正文——是降级条、占位图、还是直接隐藏该区块？当前用降级条，需要你定调性。

> 以上任一拍板后我即可按你的设计改组件；字段结构不变，只动 `components/operations/*` 与 i18n。
