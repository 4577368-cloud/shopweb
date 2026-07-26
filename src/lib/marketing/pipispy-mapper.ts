import type {
  AdCard,
  AdDetail,
  Advertiser,
  CompetitionProductRow,
  CreativeBrief,
  AdPlatform,
  CreditsBalance,
  PageMeta,
  PlatformBreakdown,
  PlatformCode,
  RankRow,
  StoreAdState,
  StoreAdTrendPoint,
  StoreCreative,
  StoreDataAnalysis,
  StoreDeliveryAnalysis,
  StoreFbPage,
  StoreLongestRunAd,
  StoreMostUsedAd,
  StorePlatformShare,
  StoreRegionAnalysis,
  StoreRow,
  StoreSearchResult,
  TtsBestSellingGood,
  TtsCategory,
  TtsSalesTrendPoint,
  TtsShopDetail,
  TtsShopRow,
  WebsiteInfo,
} from "./types";
import {
  asRecord,
  bool,
  extractPageNode,
  num,
  numOrNull,
  str,
  strArray,
  type PipispyRecord,
} from "./pipispy-parse";

function platFromCode(code: unknown): AdPlatform {
  const v = num(code, 0);
  if (v === 1) return "tiktok";
  if (v === 2) return "facebook";
  return "meta";
}

function mapBreakdown(prefix: string, r: PipispyRecord): PlatformBreakdown | null {
  const dataCount = num(r[`${prefix}_data_count`], 0);
  if (dataCount <= 0 && num(r[`${prefix}_play_count`], 0) <= 0) return null;
  return {
    dataCount,
    playCount: num(r[`${prefix}_play_count`]),
    pageCount: num(r[`${prefix}_page_count`]),
    minCpm: num(r[`${prefix}_min_cpm`]),
    maxCpm: num(r[`${prefix}_max_cpm`]),
    minCpa: num(r[`${prefix}_min_cpa`]),
    maxCpa: num(r[`${prefix}_max_cpa`]),
    putDays: num(r[`${prefix}_put_days`]),
    foundTime: num(r[`${prefix}_found_time`]),
    latestFoundTime: num(r[`${prefix}_latest_found_time`]),
    adState: num(r[`${prefix}_store_ad_state`], 1) as StoreAdState,
    reach: numOrNull(r[`${prefix}_reach`]) ?? undefined,
    adsetActiveCount: numOrNull(r[`${prefix}_adset_active_count`]) ?? undefined,
    adActiveCount: numOrNull(r[`${prefix}_ad_active_count`]) ?? undefined,
    adInactiveCount: numOrNull(r[`${prefix}_ad_inactive_count`]) ?? undefined,
    adPlatform: strArray(r[`${prefix}_ad_platform`]),
  };
}

function mapWebsite(wi: PipispyRecord | null, rootPath: string): WebsiteInfo {
  return {
    url: str(wi?.website_url ?? wi?.url, rootPath ? `https://${rootPath}` : ""),
    title: str(wi?.website_title ?? wi?.title),
    icon: str(wi?.website_icon ?? wi?.icon),
    monthlyVisits: num(wi?.website_monthly_visits),
    bounceRate: num(wi?.website_bounce_rate),
    visitSeconds: num(wi?.visit_seconds),
    languages: strArray(wi?.languages),
    countries: strArray(wi?.countries),
    currencies: strArray(wi?.currencies),
    summary: str(wi?.summary ?? wi?.website_summary),
  };
}

function mapCreatives(raw: unknown): StoreCreative[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((item) => {
    const r = asRecord(item) ?? {};
    return {
      cover: str(r.cover),
      appImage: str(r.app_image ?? r.appImage),
      count: num(r.count),
      videoId: str(r.video_id ?? r.videoId),
      platform: platFromCode(r.platform),
    };
  });
}

export function mapStoreRow(r: PipispyRecord): StoreRow {
  const wi = asRecord(r.website_info ?? r.websiteInfo);
  const rootPath = str(r.root_path ?? r.rootPath);
  const platTypes = Array.isArray(r.plat_type)
    ? (r.plat_type as unknown[]).map(platFromCode)
    : [platFromCode(r.plat_type)];
  const mainPlat = platTypes[0] ?? "tiktok";
  const monthlyVisits = num(wi?.website_monthly_visits);
  const bounceRate = num(wi?.website_bounce_rate);
  const visitSeconds = num(wi?.visit_seconds);
  const playCount = num(r.all_play_count);
  return {
    id: str(r.id ?? r.store_id, str(r.store_id)),
    storeId: str(r.store_id ?? r.id),
    name: str(r.name ?? r.shop_name, rootPath),
    rootPath,
    icon: str(r.icon),
    shopType: str(r.shop_type ?? r.shopType, "shopify"),
    platform: mainPlat,
    platType: platTypes,
    adCount: num(r.all_data_count),
    playCount,
    diggCount: num(r.all_digg_count),
    putDays: num(r.all_put_days),
    foundTime: num(r.all_found_time),
    latestFoundTime: num(r.all_latest_found_time),
    cpmMin: num(r.all_min_cpm),
    cpmMax: num(r.all_max_cpm),
    cpaMin: num(r.all_min_cpa),
    cpaMax: num(r.all_max_cpa),
    pageCount: num(r.all_page_count),
    adState: num(r.all_store_ad_state, 1) as StoreAdState,
    monthlyVisits,
    bounceRate,
    visitSeconds,
    regions: strArray(r.region),
    categories: strArray(r.ai_category ?? r.aiCategory),
    latestCreatives: mapCreatives(r.good_source ?? r.goodSource),
    popularPersonCount: num(r.popular_person_count),
    isAi: bool(r.is_ai),
    isDrama: bool(r.is_drama),
    appType2: str(r.app_type2 ?? r.appType2, "web"),
    website: mapWebsite(wi, rootPath),
    tiktok: mapBreakdown("tiktok", r),
    facebook: mapBreakdown("facebook", r),
    metaLibrary: mapBreakdown("facebook_library", r),
    isCollection: bool(r.is_collection),
    growthSeries: playCount > 0 ? [Math.round(playCount * 0.7), Math.round(playCount * 0.85), playCount] : [],
  };
}

export function mapRankRow(r: PipispyRecord): RankRow {
  return {
    id: str(r.id),
    image: str(r.image ?? r.image_url),
    title: str(r.title ?? r.name),
    currency: str(r.currency, "USD"),
    price: num(r.price),
    usdPrice: num(r.usd_price ?? r.usdPrice ?? r.price),
    countGrowth: num(r.count_growth),
    videoCount: num(r.video_count),
    growthRate: num(r.growth_rate),
    minCpm: numOrNull(r.min_cpm),
    maxCpm: numOrNull(r.max_cpm),
    isCollection: bool(r.is_collection),
    platform: str(r.platform, "shopify"),
  };
}

function mapAdStore(r: PipispyRecord | null): AdCard["store"] {
  const s = r ?? {};
  return {
    id: str(s.id ?? s.store_id),
    name: str(s.name),
    domain: str(s.source_store_link ?? s.domain),
    country: str(s.country),
    logoUrl: str(s.logo_url ?? s.logoUrl),
    adCount: num(s.ad_count ?? s.adCount),
    adsetCount: num(s.adset_count ?? s.adsetCount),
    eCommercePlatform: str(s.e_commerce_platform ?? s.eCommercePlatform, "shopify"),
  };
}

export function mapAdCard(r: PipispyRecord): AdCard {
  const storeRaw = asRecord(r.store) ?? asRecord(r.source_store);
  const images = Array.isArray(r.images) ? r.images.map((x) => str(x)).filter(Boolean).slice(0, 5) : [];
  const adPlatform = strArray(r.ad_platform ?? r.adPlatform);
  return {
    id: str(r.id),
    image: str(r.image_url ?? r.image),
    title: str(r.name ?? r.title),
    price: num(r.price),
    currency: str(r.currency, "USD"),
    priceUsd: numOrNull(r.price_usd),
    eCommercePlatform: str(r.e_commerce_platform, "shopify"),
    adPlatform: adPlatform.length ? adPlatform : ["FACEBOOK"],
    adCount: num(r.ad_count),
    activeAdCount: num(r.active_ad_count),
    adsetCount: num(r.adset_count),
    adStartedAt: numOrNull(r.ad_started_at),
    adEndedAt: numOrNull(r.ad_ended_at),
    activeDays: num(r.active_days),
    adStatus: num(r.ad_status, 1),
    adAudienceReach: num(r.ad_audience_reach),
    adCost: num(r.ad_cost),
    store: mapAdStore(storeRaw),
    storeId: str(r.store_id ?? storeRaw?.id),
    relatedRoot: str(r.related_root),
    sourceProductLink: str(r.source_product_link),
    images,
    isCollection: bool(r.is_collection),
    userCollected: num(r.user_collected),
  };
}

export function mapTtsShopRow(r: PipispyRecord): TtsShopRow {
  const categorize = Array.isArray(r.categorize) ? r.categorize : [];
  const categories: TtsCategory[] = categorize.map((c) => {
    const row = asRecord(c) ?? {};
    return {
      id: str(row._id ?? row.id),
      nameZh: str(row.name_zh ?? row.nameZh),
      nameEn: str(row.name_en ?? row.nameEn),
    };
  });
  const trendRaw = Array.isArray(r.sales_trend_data) ? r.sales_trend_data : [];
  const salesTrendData: TtsSalesTrendPoint[] = trendRaw.map((p) => {
    const row = asRecord(p) ?? {};
    return { day: num(row.day), salesVolume: num(row.sales_volume ?? row.salesVolume) };
  });
  const bestRaw = Array.isArray(r.best_selling_goods) ? r.best_selling_goods : [];
  const bestSellingGoods: TtsBestSellingGood[] = bestRaw.map((p) => {
    const row = asRecord(p) ?? {};
    return {
      productId: str(row.product_id ?? row.productId),
      image: str(row.image),
      salesVolume: num(row.sales_volume ?? row.salesVolume),
    };
  });
  return {
    id: str(r.id ?? r._id),
    image: str(r.image ?? r.shop_image),
    title: str(r.shop_name ?? r.title),
    salesVolume: num(r.sales_volume),
    score: num(r.score),
    currency: str(r.currency, "USD"),
    gmv: num(r.gmv),
    gmvUsd: num(r.gmv_usd),
    salesTrend: num(r.sales_trend),
    salesTrendData,
    personCount: num(r.person_count),
    goodsCount: num(r.goods_count),
    goodsAdCount: num(r.goods_ad_count),
    avgPrice: num(r.avg_price),
    avgPriceUsd: num(r.avg_price_usd),
    videoCount: num(r.video_count),
    playCount: num(r.play_count),
    shareCount: num(r.share_count),
    minCpm: numOrNull(r.min_cpm),
    maxCpm: numOrNull(r.max_cpm),
    regions: strArray(r.region),
    categories,
    foundTime: numOrNull(r.found_time),
    lastFoundTime: numOrNull(r.last_found_time),
    bestSellingGoods,
    productType: strArray(r.product_type),
    delivery: strArray(r.delivery),
    isCollection: bool(r.is_collection),
  };
}

/** 创意打法库条目（adspy/list / ad-library/ads，公开广告库）。pipispy 真实 schema 容错映射。 */
export function mapCreativeBrief(r: PipispyRecord): CreativeBrief {
  const cover = str(r.cover ?? r.image_url ?? r.thumbnail ?? r.image);
  const title = str(r.title ?? r.ad_title ?? r.name);
  const copy = str(r.caption ?? r.ad_copy ?? r.text ?? r.copy);
  const platform = platFromCode(r.platform ?? r.plat_type);
  const platforms = strArray(r.ad_platform ?? r.platforms);
  const advertiser = str(
    r.advertiser_name ?? r.page_name ?? r.store_name ?? r.advertiser,
    title
  );
  const adStatus = num(r.ad_status ?? r.status, 1);
  const endedAt = numOrNull(r.ended_at ?? r.ad_ended_at);
  const isActive = endedAt == null ? adStatus === 1 : false;
  return {
    id: str(r.id ?? r.ad_id, str(r.ad_id)),
    cover,
    title,
    copy,
    platform,
    platforms: platforms.length ? platforms : [platform.toUpperCase()],
    advertiser,
    advertiserPage: str(r.advertiser_link ?? r.page_link ?? r.ads_library_link),
    likes: num(r.likes ?? r.like_count),
    comments: num(r.comments ?? r.comment_count),
    shares: num(r.shares ?? r.share_count),
    activeDays: num(r.days ?? r.active_days ?? r.put_days),
    ctaType: str(r.cta_type ?? r.button_type ?? r.cta, "Others"),
    isActive,
  };
}

export function mapAdDetail(r: PipispyRecord, id: string): AdDetail {
  const product = asRecord(r.product) ?? r;
  const store = asRecord(r.store) ?? {};
  const platCode = num(r.platform ?? r.plat_type, 1) as PlatformCode;
  // 富 dossier：advertisers 真实映射（曾是硬编码 []，导致详情抽屉被饿死）。
  const rawAdvertisers = Array.isArray(r.advertisers) ? (r.advertisers as unknown[]) : [];
  const advertisers: Advertiser[] = rawAdvertisers.map((a, i) => {
    const rec = asRecord(a) ?? {};
    const advStore = asRecord(rec.store) ?? {};
    return {
      id: str(rec.id, `adv_${i}`),
      name: str(rec.name ?? rec.advertiser_name, `Advertiser ${i + 1}`),
      sourceAdvertiserLink: str(rec.source_advertiser_link),
      adsLibraryLink: str(rec.ads_library_link),
      domain: str(advStore.source_store_link ?? rec.source_store_link),
      eCommercePlatform: str(rec.e_commerce_platform ?? advStore.e_commerce_platform),
    };
  });
  return {
    id: str(r.id, id),
    product: {
      id: str(product.id, id),
      title: str(product.title ?? product.name ?? r.title),
      image: str(product.image ?? product.image_url ?? r.image_url),
      appImage: str(product.app_image ?? r.app_image),
      price: num(product.price ?? r.price),
      usdPrice: num(product.usd_price ?? r.usd_price ?? product.price),
      currency: str(product.currency ?? r.currency, "USD"),
    },
    store: {
      name: str(store.name ?? r.store_name),
      domain: str(store.source_store_link ?? store.domain ?? r.source_store_link),
    },
    advertisers,
    adCost: num(r.ad_cost),
    adAudienceReach: num(r.ad_audience_reach),
    adForecast: str(r.ad_forecast, "—"),
    adStartedHistory: strArray(r.ad_started_history),
    ctaType: str(r.cta_type ?? r.button_type, "Others"),
    likeCount: num(r.like_count ?? r.digg_count),
    platform: platFromCode(platCode),
    platformCode: platCode,
    videoId: str(r.video_id),
    copyUnavailable: true,
  };
}

/** 店下在投商品（store/detail/competition/products，免费端点）。 */
export function mapCompetitionProduct(r: PipispyRecord): CompetitionProductRow {
  const store = asRecord(r.store) ?? {};
  return {
    id: str(r.id),
    title: str(r.title ?? r.name ?? store.title, "—"),
    icon: str(r.icon ?? r.image ?? r.image_url ?? store.logo_url),
    link: str(r.source_product_link ?? r.source_product_link),
  };
}

// --- 竞店充实（store/detail 族，基于 store id，享 3 天免费窗口）---

/** 广告趋势点（store/ad-trend）。响应式字段含 day/time、ad_count/data_count、play_count。 */
export function mapStoreAdTrend(r: PipispyRecord): StoreAdTrendPoint {
  return {
    day: num(r.day ?? r.time),
    adCount: num(r.ad_count ?? r.data_count),
    playCount: num(r.play_count),
  };
}

/** 常青素材（store/longest-run-ads）：投放最久的创意。 */
export function mapStoreLongestRunAd(r: PipispyRecord): StoreLongestRunAd {
  const first = num(r.first_seen ?? r.firstSeen);
  const last = num(r.last_seen ?? r.lastSeen);
  const runDays =
    last && first
      ? Math.max(0, Math.round((last - first) / 86400))
      : num(r.run_days ?? r.runDays);
  return {
    id: str(r.id),
    cover: str(r.cover ?? r.image_url ?? r.image),
    title: str(r.title ?? r.name),
    platform: platFromCode(r.platform ?? r.plat_type),
    firstSeen: first,
    lastSeen: last,
    runDays,
    playCount: num(r.play_count ?? r.playCount),
  };
}

/** 高频素材（store/most-used-ads）：投放最频繁的创意。 */
export function mapStoreMostUsedAd(r: PipispyRecord): StoreMostUsedAd {
  return {
    id: str(r.id),
    cover: str(r.cover ?? r.image_url ?? r.image),
    title: str(r.title ?? r.name),
    platform: platFromCode(r.platform ?? r.plat_type),
    usedCount: num(r.used_count ?? r.usedCount ?? r.count),
    playCount: num(r.play_count ?? r.playCount),
    cpm: num(r.cpm ?? r.min_cpm ?? r.cpm_min),
  };
}

/** 关联 Facebook 主页（store/fb-pages）。 */
export function mapStoreFbPage(r: PipispyRecord): StoreFbPage {
  return {
    id: str(r.id ?? r.page_id),
    pageId: str(r.page_id ?? r.id),
    name: str(r.name ?? r.page_name),
    url: str(r.url ?? r.link ?? r.page_url),
    likes: num(r.likes ?? r.like_count),
    followers: num(r.followers ?? r.follower_count),
    category: str(r.category ?? r.category_name),
  };
}

// --- 竞店检索（store/list，域名/店名 → 内部 ID）---

/** 店铺检索结果（store/list → data[]）。 */
export function mapStoreSearchResult(r: PipispyRecord): StoreSearchResult {
  const platTypes = Array.isArray(r.plat_type)
    ? (r.plat_type as unknown[]).map(platFromCode)
    : [platFromCode(r.plat_type)];
  return {
    id: str(r.id ?? r.store_id),
    name: str(r.name ?? r.shop_name ?? r.store_name),
    domain: str(r.domain ?? r.store_domain ?? r.source_store_link),
    icon: str(r.icon ?? r.logo_url ?? r.image),
    platType: platTypes.length ? platTypes : ["meta"],
    adCount: num(r.ad_count ?? r.data_count ?? r.total_ad_count),
    region: str(r.region ?? r.country ?? r.region_code),
    shopType: str(r.shop_type ?? r.e_commerce_platform ?? r.ecommerce_platform),
    monthlyVisits: num(r.monthly_visits ?? r.website_monthly_visits),
    firstAdTime: num(r.first_ad_time ?? r.firstAdTime),
    lastAdTime: num(r.last_ad_time ?? r.lastAdTime),
    adState: num(r.store_ad_state ?? r.ad_state, 1) as StoreAdState,
  };
}

// --- 店铺数据分析（store/data-analysis，截图「数据分析」整块）---

/** 单平台占比行（like_rate 容忍百分制/小数制：>1 视为百分制归一）。 */
function mapPlatformShare(rec: PipispyRecord, totalAdCount: number): StorePlatformShare {
  const raw = num(rec.like_rate ?? rec.likeRate);
  const likeRate = raw > 1 ? raw / 100 : raw;
  const adCount = num(rec.ad_count ?? rec.data_count);
  return {
    platform: platFromCode(rec.platform ?? rec.plat_type),
    playCount: num(rec.play_count),
    likeCount: num(rec.like_count ?? rec.digg_count),
    likeRate,
    adCount,
    adDays: num(rec.ad_days ?? rec.put_days),
    spendMin: num(rec.min_spend ?? rec.spend_min),
    spendMax: num(rec.max_spend ?? rec.spend_max),
    share: totalAdCount > 0 ? adCount / totalAdCount : 0,
  };
}

/** 店铺数据分析（store/data-analysis → 全平台汇总 + 平台明细）。 */
export function mapStoreDataAnalysis(r: PipispyRecord): StoreDataAnalysis {
  const totalAdCount = num(r.total_ad_count ?? r.totalAdCount);
  const rawList = Array.isArray(r.platform_list ?? r.platformList)
    ? ((r.platform_list ?? r.platformList) as unknown[])
    : Array.isArray(r.platforms)
      ? (r.platforms as unknown[])
      : [];
  const platforms = rawList.map((p) => mapPlatformShare(asRecord(p) ?? {}, totalAdCount));
  const rawLike = num(r.like_rate ?? r.likeRate);
  const likeRate = rawLike > 1 ? rawLike / 100 : rawLike;
  return {
    totalPlayCount: num(r.total_play_count ?? r.totalPlayCount),
    totalLikeCount: num(r.total_like_count ?? r.totalLikeCount),
    likeRate,
    totalAdCount,
    totalAdDays: num(r.total_ad_days ?? r.totalAdDays),
    spendMin: num(r.min_spend ?? r.spendMin ?? r.minSpend),
    spendMax: num(r.max_spend ?? r.spendMax ?? r.maxSpend),
    firstAdTime: num(r.first_ad_time ?? r.firstAdTime),
    lastAdTime: num(r.last_ad_time ?? r.lastAdTime),
    platforms: platforms.length ? platforms : [mapPlatformShare({}, totalAdCount)],
  };
}

/** 广告地区分布（store/region-analysis → data[]）。 */
export function mapStoreRegionAnalysis(r: PipispyRecord): StoreRegionAnalysis {
  return {
    region: str(r.region ?? r.country ?? r.region_code),
    adCount: num(r.ad_count ?? r.data_count),
    playCount: num(r.play_count),
    likeCount: num(r.like_count ?? r.digg_count),
  };
}

/** 交付分析（store/delivery-analysis → 单对象）。 */
export function mapStoreDeliveryAnalysis(r: PipispyRecord): StoreDeliveryAnalysis {
  return {
    avgDeliveryDays: num(r.avg_delivery_days ?? r.avgDeliveryDays),
    maxDeliveryDays: num(r.max_delivery_days ?? r.maxDeliveryDays),
    frequency: num(r.frequency ?? r.freq),
    coverage: num(r.coverage ?? r.cover_count),
    activeDays: num(r.active_days ?? r.activeDays),
  };
}

export function mapCreditsBalance(payload: unknown): CreditsBalance {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;
  const pick = (camel: string, snake: string) => num(data[camel] ?? data[snake]);

  const totalApi = pick("totalApiCredits", "total_api_credits");
  const remainingApi = pick("remainingApiCredits", "remaining_api_credits");
  const purchasedApi = pick("purchasedApiCredits", "purchased_api_credits");
  const usedApi = pick("usedApiCredits", "used_api_credits");
  const totalMon = pick("totalMonitorCredits", "total_monitor_credits");
  const remainingMon = pick("remainingMonitorCredits", "remaining_monitor_credits");
  const purchasedMon = pick("purchasedMonitorCredits", "purchased_monitor_credits");
  const usedMon = pick("usedMonitorCredits", "used_monitor_credits");

  const rem = remainingApi || num(root.remaining_credits);
  const used = usedApi || num(root.used_api_credits);
  const total = totalApi || rem + used || num(root.total_api_credits);

  return {
    totalApiCredits: total,
    remainingApiCredits: rem,
    purchasedApiCredits: purchasedApi || total,
    usedApiCredits: used || Math.max(0, total - rem),
    totalMonitorCredits: totalMon,
    remainingMonitorCredits: remainingMon,
    purchasedMonitorCredits: purchasedMon || totalMon,
    usedMonitorCredits: usedMon || Math.max(0, totalMon - remainingMon),
  };
}

export function mapPageMeta(
  payload: unknown,
  page: number,
  pageSize: number,
  recordCount: number
): PageMeta {
  const pageNode = extractPageNode(payload);
  const total = num(pageNode?.total_count ?? pageNode?.totalCount, recordCount);
  const current = num(pageNode?.current_page ?? pageNode?.currentPage, page);
  const size = num(pageNode?.page_size ?? pageNode?.pageSize, pageSize);
  const pageCount = num(pageNode?.page_count ?? pageNode?.pageCount, Math.max(1, Math.ceil(total / size)));
  const isNextRaw = pageNode?.is_next ?? pageNode?.isNext;
  const isNext = typeof isNextRaw === "boolean" ? isNextRaw : current < pageCount;
  return {
    totalCount: total,
    pageCount,
    currentPage: current,
    pageSize: size,
    isNext,
  };
}

/**
 * TikTok Shop 店铺详情富集（tiktok-shop/shop/detail）。
 * 只取列表行 TtsShopRow 没有的字段；容错：任何缺失字段降级为 null/false。
 */
export function mapTtsShopDetail(r: PipispyRecord): TtsShopDetail {
  return {
    adCost: str(r.ad_cost) || null,
    rootPath: str(r.root_path) || null,
    goodsAdRate: numOrNull(r.goods_ad_rate),
    commissionRate: numOrNull(r.commission_rate),
    landingPage: str(r.landing_page) || null,
    desc: str(r.desc) || null,
    keywords: str(r.keywords) || null,
    isManaged: bool(r.is_managed, false),
    isInMarketplace: bool(r.is_in_marketplace, false),
  };
}
