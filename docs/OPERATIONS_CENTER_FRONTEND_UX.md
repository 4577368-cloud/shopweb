# 运营中心 · 前端交互设计（Frontend UX）

> 范围：仅前端交互层。数据接通（后端代理 / 边缘函数 / 直连 pipispy）由用户负责，本设计用 **mock 驱动可点击原型**，数据层 `api.ts` 预留统一接口，用户接通后仅替换其内部实现。
> 视觉遵循 `docs/Tangbuy-AI-Sourcing-Shopify-Visual-Spec.md`（语义 Token + `Button` 组件 + `@/lib/ui/icons`，Sourcing Mint 仅用于品牌/供应链节点）。
> 后端营销代码已撤销（不动 `tangbuy-plugin` 开店流程），本设计不依赖任何后端改动。

## 1. 信息架构
- 入口：`HubSidebar` 的 `ops` 项（已接 `href=/operations-center`）。
- 布局：`WorkbenchShell` + 左 `HubSidebar` + 主区（顶部三视图 Tab）+ 右栏 `Copilot 营销助手`。
- 复用：订单中心已有的 `Button` / 语义 Token / `Search` `Store` `Sparkles` `Target` 图标，不另起 UI 体系。

## 2. 三视图交互

### 2.1 竞店监控（Competition）
- 顶部搜索框：`店铺 ID / 店铺 URL` → 回车/「查询」按钮。
- 结果：竞店卡片列表（店名、在投广告数、近 30 天增长趋势 sparkline）。
- 空态：未查询时厚说明（"输入 pipispy 店铺 ID 查看竞店在投广告与增长"），不伪造数据。
- 错误态：代理未接通 / key 失效 → 诚实红框 + 「重试」。

### 2.2 素材学习（Creative）
- 搜索框：`关键词 / 商品类目` → 广告商品网格（封面图 + 标题 + 平台标签）。
- 点击卡片 → **详情抽屉**（商品名/价格/图片、店铺、广告主、起投时间历史）。
- 抽屉内「让 Copilot 分析」按钮 → 把当前素材上下文喂给右栏 Copilot。
- 限制（来自接口审计）：视频**仅展示封面/缩略**（pipispy 不返 `video_url`）；**创意文案无数据源**（见 §5）。

### 2.3 发现榜单（Rank）
- 控件：日 / 周 / 月 切换（对应 pipispy `type` 1/2/3）+ 排序下拉（增长数 `count_growth` / 增长率 `growth_rate` / 视频数 `video_count`）+ 地区/类目筛选。
- 结果：榜单列表（排名、封面、标题、价格、增长%、视频数），分页加载。

## 3. 右栏 Copilot 营销助手
- 输入框 + 建议指令 chips：`分析卖点/钩子`、`改写文案(降级)`、`对比竞店`。
- 消息流：用户指令 + Copilot 回复（洞察 / 改写稿）。
- 扣费护栏：任何会触发出站调用的指令，先 `estimate` 显示「预估消耗 N 点」，确认后执行（见 §4）。

## 4. 全局积分护栏（与审计 PRD 一致）
- 每次出站调用前：前端先请求 `estimate`（或后端随响应返回 `estimatedCredits`），弹层显示「本次预估消耗 N 点，确认？」。
- 仅确认后发出真实请求。失败 → 红框 + 剩余点数。
- 目的：保护你的 pipispy 预算不被刷爆（你方付费，向商家收费后续独立设计）。

## 5. 已知限制（接口审计结论，v1 必须遵守）
1. **视频取流未通**：pipispy 不返 `video_url`，仅 `video_id`。v1 素材网格/抽屉仅展示封面图与缩略，内嵌播放暂缓。
2. **创意文案无数据源**：pipispy `ad-products/detail` 返回 `product/store/advertisers/ad_started_history`，**无广告创意文案正文字段**。Copilot「改写文案」降级为：基于商品 `title` / 卖点做有限生成，或在 UI 标注「文案不可用」。

## 6. 数据契约（前端 `api.ts` 统一返回）
所有接口返回统一包裹，便于 mock 与真实代理切换：
```ts
interface MarketingResponse<T> {
  data: T;
  estimatedCredits: number;   // 本次预估/实际消耗点数
  source: "pipispy" | "mock";
}
```
四类接口：
- `competition(id)` → `GET /store/detail/competition` → `{ stores: StoreRow[], products: ProductRow[] }`
- `searchAds(q)` → `GET /ad-products/search` → `{ list: AdCard[] }`
- `adDetail(id)` → `GET /ad-products/detail` → `{ product, store, advertisers, ad_started_history }`
- `rankList({type, sortKey, time, page})` → `GET /ad-product-rank-list` → `{ list: RankRow[], page }`

字段矩阵（来自 pipispy 真实文档）：
- `StoreRow`: `{ id, name, adCount, growthTrend: number[] }`
- `AdCard`: `{ id, image, title, price, platform, videoId }`
- `RankRow`: `{ id, image, title, price, usdPrice, countGrowth, videoCount, growthRate, minMaxCpm, isCollection, platform }`

## 7. 组件树（实现阶段）
```
operations-center/page.tsx
├ HubSidebar (复用)
├ ViewTabs (竞店监控 | 素材学习 | 发现榜单)
├ CompetitionView
│   ├ SearchBar
│   ├ StoreCard[]
│   └ EmptyState / ErrorState
├ CreativeView
│   ├ SearchBar
│   ├ AdGrid → AdCard[]
│   └ AdDetailDrawer (商品/店铺/广告主)
├ RankView
│   ├ RankControls (日周月 + 排序 + 筛选)
│   └ RankList → RankRow[]
└ CopilotPanel (复用右侧栏模式)
    ├ InputBar + SuggestionChips
    └ MessageStream
```
全局：`CreditConfirmDialog`（积分护栏）、`useMarketing()` hook（封装 `api.ts`，mock/real 切换）。

## 8. 实现路线建议
- **Phase A（mock 原型）**：用 §6 的 mock 形状驱动上述组件，三视图 + Copilot + 积分护栏弹层全部可点击，不依赖任何后端。验证交互与视觉规范。
- **Phase B（接用户代理）**：你接通后，仅改 `api.ts` 内部（把 mock 换成 fetch 你的代理），组件与 hook 不动。
- 当前 `operations-center/page.tsx` 是早期验证页（调我原后端接口），Phase A 时重构为上述结构。

## 9. 待确认
- 三视图的默认落地 Tab（建议「竞店监控」）。
- Copilot 是否需要在 v1 接真实 LLM，还是先静态建议 + 文案降级。
- 是否现在直接进入 Phase A 实现 mock 原型。
