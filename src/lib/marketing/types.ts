// 运营中心 · 营销数据层类型
// 严格对齐 docs/OPERATIONS_CENTER_DESIGN.md（pipispy 真实字段矩阵，见 §2.3/2.4/2.5 + pipispy 官方 doc）。
// Phase A：前端 mock 原型，本文件类型与真实代理响应一致，用户接通后端时仅替换 api.ts 内部实现。
// 说明：growthSeries 为 mock 合成的「近 12 期投放/增长趋势」占位（真实可由 store ad trend 接口或 all_put_days 近似得到），
//       接后端时该字段由真实趋势数据填充或在 UI 标注「估算趋势」。

/** 广告平台（对应 pipispy plat_type / good_source.platform）。 */
export type AdPlatform = "tiktok" | "facebook" | "meta";

/** 平台编码（good_source.platform / 1=TikTok 2=Facebook 3=Meta Library）。 */
export type PlatformCode = 1 | 2 | 3;

/**
 * 统一响应包裹：mock 与真实代理共用，便于切换（设计 §6）。
 * 余额/消耗字段严格对齐 pipispy 业务响应体：每次调用都带回
 *   - remainingCredits：调用后账户剩余（api credits），对应响应 remaining_credits
 *   - consumedCredits：本次调用实际消耗，对应响应 consumed_credits
 * 这两个值是「消费反馈」的真实来源，前端绝不再自造消耗数字。
 * 注意：余额是 API 账户级别（对应你的 key 的账户），不是单个用户/商家。
 */
export interface MarketingResponse<T> {
  data: T;
  source: "pipispy" | "mock";
  remainingCredits: number;
  consumedCredits: number;
  /** 命中 pipispy「3 天免费窗口」：榜/搜见过的 product_id 在窗口内再开详情不重复计费。仅 UI 标注用，真实扣点以 consumedCredits 为准。 */
  freeWindow?: boolean;
  /** 服务端门禁后：实际向用户扣减的积分（= 上游 U × 2）。免费/窗口命中为 0。 */
  chargedCredits?: number;
  /** 扣费后用户钱包剩余积分（权威余额，来自服务端）。 */
  remainingUserCredits?: number;
  /** 上游/业务真实错误文案（402/5xx 等），前端需直接展示，禁止"代理未接通"兜底。 */
  message?: string;
}

/**
 * pipispy 账户级额度（/open-api/v1/credits-balance，对应整个 API key，非单个用户）。
 * 真实由后端 /api/plugin/marketing/credits-balance 代理（key 由服务端注入，前端不放）。
 */
export interface CreditsBalance {
  totalApiCredits: number;
  remainingApiCredits: number;
  purchasedApiCredits: number;
  usedApiCredits: number;
  totalMonitorCredits: number;
  remainingMonitorCredits: number;
  purchasedMonitorCredits: number;
  usedMonitorCredits: number;
}

/** 竞店投放状态：-1 停投 / 0 下架 / 1 活跃。 */
export type StoreAdState = -1 | 0 | 1;

/** 单平台聚合指标（tiktok_ / facebook_ / facebook_library_ 前缀字段）。 */
export interface PlatformBreakdown {
  dataCount: number;
  playCount: number;
  pageCount: number;
  minCpm: number;
  maxCpm: number;
  minCpa: number;
  maxCpa: number;
  putDays: number;
  foundTime: number; // Unix 秒
  latestFoundTime: number; // Unix 秒
  adState: StoreAdState;
  // Meta Ad Library 专属
  reach?: number;
  adsetActiveCount?: number;
  adActiveCount?: number;
  adInactiveCount?: number;
  adPlatform?: string[]; // FACEBOOK / INSTAGRAM …
}

/** 网站流量信息（website_info）。 */
export interface WebsiteInfo {
  url: string;
  title: string;
  icon: string;
  monthlyVisits: number;
  bounceRate: number; // 0..1
  visitSeconds: number;
  languages: string[];
  countries: string[];
  currencies: string[];
  summary: string;
}

/** 竞店最新素材（good_source[]）。 */
export interface StoreCreative {
  cover: string;
  appImage: string;
  count: number; // 该素材曝光
  videoId: string;
  platform: AdPlatform;
}

/** 竞店列表行（store/detail/competition → data.data[]，设计 §2.3）。 */
export interface StoreRow {
  id: string;
  storeId: string;
  name: string;
  rootPath: string;
  icon: string;
  shopType: string; // magento/shopify/shoplazza/…
  platform: AdPlatform; // 主平台（聚合）
  platType: AdPlatform[]; // 全平台列表
  adCount: number; // all_data_count
  playCount: number; // all_play_count
  diggCount: number; // all_digg_count
  putDays: number; // all_put_days
  foundTime: number; // all_found_time
  latestFoundTime: number; // all_latest_found_time
  cpmMin: number; // all_min_cpm
  cpmMax: number; // all_max_cpm
  cpaMin: number; // all_min_cpa
  cpaMax: number; // all_max_cpa
  pageCount: number; // all_page_count（广告主账号数）
  adState: StoreAdState; // all_store_ad_state
  monthlyVisits: number; // website_info.website_monthly_visits
  bounceRate: number; // website_info.website_bounce_rate
  visitSeconds: number; // website_info.visit_seconds
  regions: string[]; // region[]
  categories: string[]; // ai_category[]（名称）
  latestCreatives: StoreCreative[]; // good_source[] ≤3
  popularPersonCount: number; // popular_person_count
  isAi: boolean; // is_ai
  isDrama: boolean; // is_drama
  appType2: string; // web / game / app
  website: WebsiteInfo;
  tiktok: PlatformBreakdown | null;
  facebook: PlatformBreakdown | null;
  metaLibrary: PlatformBreakdown | null;
  isCollection: boolean;
  growthSeries: number[]; // mock：近 12 期投放趋势
}

/** 广告商品卡所属店铺（ad-products/search → store 子对象，真实字段）。 */
export interface AdStore {
  id: string;
  name: string;
  domain: string; // source_store_link
  country: string;
  logoUrl: string; // logo_url
  adCount: number;
  adsetCount: number;
  eCommercePlatform: string;
}

/**
 * 广告商品卡（ad-products/search → list，严格对齐 pipispy ppspy 真实响应）。
 * 已删除全部合成字段（usdPrice/platform/platformCode/videoId/countGrowth/videoCount/
 * growthRate/likeCount/ctaType/region/category/growthSeries），改用真实返回字段。
 * 说明：price_usd 在真实响应中并非始终存在（部分行缺失），故为 number | null。
 */
export interface AdCard {
  id: string;
  image: string; // image_url
  title: string; // name
  price: number;
  currency: string;
  priceUsd: number | null; // price_usd（可能缺失）
  eCommercePlatform: string; // e_commerce_platform（如 shopify）
  adPlatform: string[]; // ad_platform[]（FACEBOOK / INSTAGRAM / …）
  adCount: number;
  activeAdCount: number;
  adsetCount: number;
  adStartedAt: number | null; // ad_started_at（unix 秒）
  adEndedAt: number | null; // ad_ended_at（unix 秒）
  activeDays: number;
  adStatus: number; // ad_status（1=活跃）
  adAudienceReach: number; // ad_audience_reach
  adCost: number; // ad_cost
  store: AdStore;
  storeId: string;
  relatedRoot: string; // related_root
  sourceProductLink: string; // source_product_link
  images: string[]; // images[]（最多 5 张）
  isCollection: boolean;
  userCollected: number; // user_collected
}

/**
 * 创意打法库条目（adspy/list / ad-library/ads，公开广告库）。
 * 与 AdCard 不同：本类型承载「创意正文钩子 + 互动指标 + 投放方」，用于素材板块"不搜也有满屏"。
 * 真实字段映射见 pipispy-mapper.mapCreativeBrief（pipispy 真实 schema 容错）。
 */
export interface CreativeBrief {
  id: string;
  cover: string; // 封面 / 视频首帧
  title: string; // 广告标题 / 钩子主文案
  copy: string; // 广告文案正文（hook）
  platform: AdPlatform; // 主平台（映射后）
  platforms: string[]; // 全平台原始编码（FACEBOOK / INSTAGRAM …）
  advertiser: string; // 投放方 / 店铺名
  advertiserPage?: string; // 投放方主页外链
  likes: number;
  comments: number;
  shares: number;
  activeDays: number; // 持续投放天数
  ctaType: string; // CTA 按钮文案
  isActive: boolean; // 是否在投（含已停投开关用）
}

/** 创意打法库查询入参（adspy/list 或 ad-library/ads）。 */
export interface AdspyParams {
  q?: string;
  page?: number;
  pageSize?: number;
  /** 含已停投：true 时切到 ad-library/ads（Meta 公开广告库，含已停投创意）。 */
  includeStopped?: boolean;
}

/** 榜单行（rank/ad-product/list，严格对齐 pipispy rank 真实响应）。 */
export interface RankRow {
  id: string;
  image: string;
  title: string;
  currency: string;
  price: number;
  usdPrice: number;
  countGrowth: number; // count_growth（绝对增长量）
  videoCount: number; // video_count
  growthRate: number; // growth_rate（比例 0..n，非百分数；显示需 ×100）
  minCpm: number | null; // min_cpm
  maxCpm: number | null; // max_cpm
  isCollection: boolean;
  platform: string; // shopify / shopline / …（店型，不是广告平台）
}

/** TikTok Shop 类目（tiktok-shop-list → categorize[]，真实多语字段子集）。 */
export interface TtsCategory {
  id: string; // _id
  nameZh: string;
  nameEn: string;
}

/** TikTok Shop 销量趋势点（sales_trend_data[]）。 */
export interface TtsSalesTrendPoint {
  day: number; // unix 秒
  salesVolume: number;
}

/** TikTok Shop 爆款商品（best_selling_goods[]）。 */
export interface TtsBestSellingGood {
  productId: string;
  image: string;
  salesVolume: number;
}

/**
 * TikTok Shop 榜行（tiktok-shop-list，严格对齐 pipispy 真实响应）。
 * 已删除全部合成字段（followers/monthlyVisits/adCount/growthRate/salesEstimate/growthSeries），
 * 改用真实返回字段（gmv_usd/score/sales_trend_data/person_count/goods_count/avg_price_usd/…）。
 */
export interface TtsShopRow {
  id: string;
  image: string;
  title: string; // shop_name / title（店铺名）
  salesVolume: number; // sales_volume
  score: number; // score（店铺评分）
  currency: string;
  gmv: number; // gmv（本币）
  gmvUsd: number; // gmv_usd
  salesTrend: number; // sales_trend（趋势指示：-1/0/1）
  salesTrendData: TtsSalesTrendPoint[]; // sales_trend_data[]
  personCount: number; // person_count（粉丝/关注人数）
  goodsCount: number; // goods_count（在售商品数）
  goodsAdCount: number; // goods_ad_count（归一化自字符串）
  avgPrice: number; // avg_price（本币）
  avgPriceUsd: number; // avg_price_usd
  videoCount: number; // video_count
  playCount: number; // play_count
  shareCount: number; // share_count
  minCpm: number | null; // min_cpm
  maxCpm: number | null; // max_cpm
  regions: string[]; // region[]（国家码）
  categories: TtsCategory[]; // categorize[]
  foundTime: number | null; // found_time（unix 秒）
  lastFoundTime: number | null; // last_found_time（unix 秒）
  bestSellingGoods: TtsBestSellingGood[];
  productType: string[]; // product_type[]
  delivery: string[]; // delivery[]
  isCollection: boolean;
}

/**
 * TikTok Shop 店铺详情富集字段（tiktok-shop/shop/detail，列表行 TtsShopRow 缺的字段）。
 * 列表行已含 gmv/salesVolume/goodsCount/goodsAdCount/avgPrice/salesTrendData/categorize/region/
 * delivery/productType/foundTime/lastFoundTime/personCount/playCount/videoCount/bestSellingGoods；
 * 本类型只补充「列表行没有」的维度：投放花费区间、域名、广告商品率、佣金率、落地页、简介。
 */
export interface TtsShopDetail {
  adCost: string | null; // ad_cost（如 "USD 2.0-8.0"）
  rootPath: string | null; // root_path（店铺域名）
  goodsAdRate: number | null; // goods_ad_rate（0..1）
  commissionRate: number | null; // commission_rate
  landingPage: string | null; // landing_page（外链）
  desc: string | null; // desc（店铺简介）
  keywords: string | null; // keywords
  isManaged: boolean; // is_managed（全托管）
  isInMarketplace: boolean; // is_in_marketplace
}
export interface Advertiser {
  id: string;
  name: string;
  /** 广告主主页外链（source_advertiser_link）。 */
  sourceAdvertiserLink?: string;
  /** 该广告主在广告库的外链（ads_library_link），商家可点去看真实广告。 */
  adsLibraryLink?: string;
  /** 广告主店铺域名（store.source_store_link）。 */
  domain?: string;
  eCommercePlatform?: string;
}

/** 广告详情（ad-products/detail，设计 §2.4）。注意：无创意文案正文字段。 */
export interface AdDetail {
  id: string;
  product: {
    id: string;
    title: string;
    image: string;
    appImage: string;
    price: number;
    usdPrice: number;
    currency: string;
  };
  store: { name: string; domain: string };
  advertisers: Advertiser[];
  /** 单次调用即带回的「富 dossier」字段（ad-products/detail 真实返回）。 */
  adCost: number; // ad_cost
  adAudienceReach: number; // ad_audience_reach
  adForecast: string; // ad_forecast（测款 / 放量 / 盈利 阶段）
  adStartedHistory: string[]; // 起投时间历史
  ctaType: string; // Others-button 枚举文案
  likeCount: number;
  platform: AdPlatform;
  platformCode: PlatformCode;
  videoId: string;
  /** pipispy 不提供创意文案正文（设计 §2.4 / §5.1）。 */
  copyUnavailable: true;
}

/**
 * 用量账本分录（前端本会话审计日志，设计 §3.2）。
 * 注意：只记录「本会话」的消耗，余额本身是账户级（见 CreditsBalance），不在此重复持有。
 */
export interface UsageEntry {
  id: string;
  time: string;
  endpoint: string;
  consumed: number; // 本次实际消耗（缓存命中为 0）
  cacheHit: boolean;
  remainingAfter: number; // 调用后账户剩余（api credits）
}

/** 本会话用量汇总（账户级余额单独由 CreditsBalance 持有）。 */
export interface UsageLedger {
  sessionUsed: number;
  entries: UsageEntry[];
}

/** 分页元信息。 */
export interface PageMeta {
  totalCount: number;
  pageCount: number;
  currentPage: number;
  pageSize: number;
  isNext: boolean;
}

/** 竞店查询入参。 */
export interface CompetitionParams {
  id: string;
  productId?: string;
  pageSize?: number;
  currentPage?: number;
}

/** 店下商品列表查询入参（store/detail/competition/products，pipispy 文档标注免费端点）。 */
export interface CompetitionProductsParams {
  id: string;
}

/** 店下在投商品（store/detail/competition/products，免费端点返回，用于「先选哪款 SKU 再分析」）。 */
export interface CompetitionProductRow {
  id: string;
  title: string; // name / title
  icon: string; // logo / image
  link?: string; // source_product_link
}

// --- 店铺检索（store/list，域名/店名 → 13 字符内部 ID 解析，1 积分/条）---
// 用户在前端输入的是「域名 / TikTok 店 / Shopify 店」，而非 pipi 内部 ID；
// 该端点把人类可读输入解析成 store id，再喂给 competition 族。

/** 店铺检索入参（store/list → keyword + 分页，可选 region/platType 过滤）。 */
export interface StoreSearchParams {
  keyword: string;
  pageSize?: number;
  currentPage?: number;
  region?: string;
  platType?: 0 | 1 | 2; // 0 全 / 1 TikTok / 2 Facebook
}

/** 店铺检索结果行（store/list → data[]，足够渲染候选卡 + 解析出 id）。 */
export interface StoreSearchResult {
  id: string; // 13 字符内部 ID（喂 competition 族用）
  name: string; // 店铺名
  domain: string; // 店铺域名（如 velvory.co.in）
  icon: string; // logo
  platType: AdPlatform[]; // 投放平台
  adCount: number; // 总广告数
  region: string; // 主地区
  shopType: string; // 电商系统（shopify/woocommerce/…），可能为空
  monthlyVisits: number; // 月访问量，可能为空
  firstAdTime: number; // 首投时间 unix 秒
  lastAdTime: number; // 末投时间 unix 秒
  adState: StoreAdState; // 投放状态
}

// --- 竞店充实（store/detail 族：ad-trend / longest-run-ads / most-used-ads / fb-pages，享 3 天免费窗口）---
// 这些端点均基于 store id（非 product id），接入抽屉后并行加载，补充「更多有价值内容、单次低调用」。

/** 竞店分析统一入参（基于 store id）。 */
export interface StoreIdParams {
  id: string;
}

/** 广告趋势点（store/ad-trend → data[]，时间序）。 */
export interface StoreAdTrendPoint {
  day: number; // unix 秒
  adCount: number; // 当日/累计广告数
  playCount: number; // 播放量
}

/** 常青素材（store/longest-run-ads → data[]，投放最久的创意）。 */
export interface StoreLongestRunAd {
  id: string;
  cover: string;
  title: string;
  platform: AdPlatform;
  firstSeen: number; // unix 秒
  lastSeen: number; // unix 秒
  runDays: number; // 持续天数
  playCount: number;
}

/** 高频素材（store/most-used-ads → data[]，投放最频繁的创意）。 */
export interface StoreMostUsedAd {
  id: string;
  cover: string;
  title: string;
  platform: AdPlatform;
  usedCount: number; // 使用次数
  playCount: number;
  cpm: number;
}

/** 关联 Facebook 主页（store/fb-pages → data[]）。 */
export interface StoreFbPage {
  id: string;
  pageId: string;
  name: string;
  url: string;
  likes: number;
  followers: number;
  category: string;
}

// --- 店铺数据分析（store/data-analysis，截图「数据分析」整块，一次调用全拿，3 天免费窗口）---

/** 单平台占比行（平台分析：广告 / 点赞 表）。 */
export interface StorePlatformShare {
  platform: AdPlatform; // facebook / meta（meta = Meta Ad Library）
  playCount: number; // 广告播放
  likeCount: number; // 点赞数
  likeRate: number; // 点赞率 0..1
  adCount: number; // 广告数
  adDays: number; // 广告天数
  spendMin: number; // 广告花费下限（美元）
  spendMax: number; // 广告花费上限（美元）
  share: number; // 占该指标比例 0..1（由 adCount 推算）
}

/** 店铺数据分析（store/data-analysis → 全平台汇总 + 平台明细）。 */
export interface StoreDataAnalysis {
  totalPlayCount: number; // 总广告播放
  totalLikeCount: number; // 总点赞数
  likeRate: number; // 总点赞率 0..1
  totalAdCount: number; // 总广告数
  totalAdDays: number; // 总广告天数
  spendMin: number; // 广告花费下限（美元）
  spendMax: number; // 广告花费上限（美元）
  firstAdTime: number; // 首次广告时间 unix 秒
  lastAdTime: number; // 最后广告时间 unix 秒
  platforms: StorePlatformShare[]; // 按平台拆分的明细（FB / Meta）
}

/** 广告地区分布（store/region-analysis → data[]，如 美国 1 / OTHER 222）。 */
export interface StoreRegionAnalysis {
  region: string; // 地区码（US / OTHER …）
  adCount: number; // 该区广告数
  playCount: number; // 该区播放
  likeCount: number; // 该区点赞
}

/** 交付分析（store/delivery-analysis → 投放天数/频次/覆盖分布）。 */
export interface StoreDeliveryAnalysis {
  avgDeliveryDays: number; // 平均交付天数
  maxDeliveryDays: number; // 最长交付天数
  frequency: number; // 投放频次（次）
  coverage: number; // 覆盖地区数
  activeDays: number; // 活跃天数
}

/** 榜单查询入参（设计 §2.5）。 */
export type RankSortKey = "count_growth" | "growth_rate" | "video_count";
export type RankType = 1 | 2 | 3; // 日 / 周 / 月

export interface RankParams {
  type: RankType;
  sortKey: RankSortKey;
  sortType?: "desc" | "asc";
  time?: number; // 所选周期午夜时间戳（秒）
  region?: string;
  category?: string;
  shopType?: string;
  platType?: 0 | 1 | 2; // 0 全 / 1 TikTok / 2 Facebook
  countGrowthMin?: number;
  countGrowthMax?: number;
  growthRateMin?: number;
  growthRateMax?: number;
  page?: number;
  pageSize?: number;
}

export interface TtsShopParams {
  page?: number;
  pageSize?: number;
  category?: string;
  region?: string;
}

/** 平台筛选（发现/素材共用）。 */
export type PlatformFilter = "all" | "tiktok" | "facebook" | "meta";

/** 以图搜结果（v1.5 submit/status/result-summary，mock）。 */
export interface ImageSearchResult {
  id: string;
  image: string;
  title: string;
  platform: AdPlatform;
  usdPrice: number;
  similarity: number; // 0..1
  store: string;
}

// --- TikTok 商品榜单（tangbuy-plugin /api/plugin/ranking，真实落库，非 pipispy）---
// 字段严格对齐后端 rank_snapshot / rank_product（见 RankingController + RankRepository）。
// 数值型统一用 `number | null` 容错（后端 nullable 列在 JSON 中可能缺省或 null）。

/** 榜单快照（rank_snapshot）：一张榜单 = 一个（国家, 日期窗口）组合。 */
export interface RankingSnapshot {
  id: number;
  shopName: string;
  country: string; // ISO-3166 alpha-2（如 "US"/"GB"）；后端 rank_snapshot.country
  dateRange: string; // "2026-04-12~2026-05-11"
  startDate: string | null; // "yyyy-MM-dd"
  endDate: string | null;
  productCount: number;
  createdAt: string | null; // 时间戳
}

/**
 * 榜单支持的国家清单（与 shopify-data/ranking_prep.py 清洗口径一致）。
 * 顺序：US 在前（默认），其余按字母序，方便阅读。
 */
export const RANKING_COUNTRIES = [
  "US",
  "BR",
  "DE",
  "ES",
  "FR",
  "GB",
  "ID",
  "IT",
  "JP",
  "MX",
  "MY",
  "PH",
  "SG",
  "TH",
  "VN",
] as const;
export type RankingCountry = (typeof RANKING_COUNTRIES)[number];

/** 榜单商品行（rank_product）。 */
export interface RankingRow {
  id: number;
  snapshotId: number;
  shopName: string;
  rankNo: number | null;
  productTitle: string;
  imageUrl: string;
  categoryL1: string | null;
  categoryL2: string | null;
  categoryL3: string | null;
  categoryPath: string | null; // "L1 > L2 > L3"
  priceUsd: number | null; // 价格($)，区间串已取下限
  avgPriceUsd: number | null; // 平均销售价($)
  listedAt: string | null; // "yyyy-MM-dd"
  rating: number | null; // 商品评分
  salesVolume: number | null; // 销量
  commissionRate: number | null; // 佣金比例（0..1）
  gmvUsd: number | null; // 成交金额($)
  gmvGrowthRate: number | null; // 成交金额增长率（0..1，>999.9% 已去符号）
  liveGmvUsd: number | null; // 直播成交金额($)
  videoGmvUsd: number | null; // 视频成交金额($)
  cardGmvUsd: number | null; // 商品卡成交金额($)
  creatorCount: number | null; // 达人数量
  creatorOrderRate: number | null; // 达人出单率（0..1）
  tiktokUrl: string | null;
}

/** 榜单查询入参（GET /api/plugin/ranking/list）。 */
export interface RankingParams {
  snapshotId?: number;
  categoryL1?: string;
  page?: number;
  pageSize?: number;
}

// --- 通用 dossier 聚合（POST /api/plugin/marketing/dossier，无 PluginEnvelope 包装）---

/** 单条扇出请求项：tag 用于结果回 Key，uri 走白名单，params 透传 pipispy。 */
export interface DossierRequestItem {
  tag: string;
  uri: string;
  params: Record<string, unknown>;
}

/** 单 tag 的扇出结果（直接对应后端 MarketingDataResponse，无外层 envelope）。 */
export interface DossierTagResult {
  ok: boolean;
  source?: string;
  data: unknown;
  consumedCredits: number;
  remainingCredits: number;
  code?: number;
  message?: string;
}

/** dossier 端点原始返回：按 tag 聚合的 results + 本次总扣点。 */
export interface DossierRaw {
  results: Record<string, DossierTagResult>;
  totalConsumedCredits: number;
}

/** 单店富 dossier（/operations-center/store/[id] 路由页数据，一次扇出 N 个 store/* 端点）。 */
export interface StoreDossier {
  store: StoreRow | null;
  products?: CompetitionProductRow[];
  dataAnalysis?: StoreDataAnalysis;
  regionAnalysis?: StoreRegionAnalysis[];
  deliveryAnalysis?: StoreDeliveryAnalysis;
  adTrend?: StoreAdTrendPoint[];
  longest?: StoreLongestRunAd[];
  mostUsed?: StoreMostUsedAd[];
  fbPages?: StoreFbPage[];
}

/** 单品富 dossier（/operations-center/product/[id] 路由页数据：详情 + 市场同类创意墙）。 */
export interface ProductDossier {
  detail: AdDetail;
  relatedAds?: CreativeBrief[];
}
