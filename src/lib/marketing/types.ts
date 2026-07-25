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
  advertisers: { id: string; name: string }[];
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

/** 榜单快照（rank_snapshot）：一张榜单 = 一个日期窗口。 */
export interface RankingSnapshot {
  id: number;
  shopName: string;
  dateRange: string; // "2026-04-12~2026-05-11"
  startDate: string | null; // "yyyy-MM-dd"
  endDate: string | null;
  productCount: number;
  createdAt: string | null; // 时间戳
}

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
