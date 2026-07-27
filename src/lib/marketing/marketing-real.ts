import { marketingCreditsBalance, marketingDossier, marketingImageSearch, marketingPost } from "./marketing-proxy";
import {
  buildAdspyParams,
  buildCompetitionParams,
  buildRankListParams,
  buildSearchAdsParams,
  buildStoreIdParam,
  buildStoreSearchParam,
  buildTtsShopParams,
} from "./marketing-params";
import {
  mapAdCard,
  mapAdDetail,
  mapAdspyDetail,
  mapCompetitionProduct,
  mapCreativeBrief,
  mapCreditsBalance,
  mapPageMeta,
  mapRankRow,
  mapStoreAdTrend,
  mapStoreDataAnalysis,
  mapStoreDeliveryAnalysis,
  mapStoreFbPage,
  mapStoreLongestRunAd,
  mapStoreMostUsedAd,
  mapStoreRegionAnalysis,
  mapStoreRow,
  mapStoreSearchResult,
  mapTtsShopDetail,
  mapTtsShopRow,
} from "./pipispy-mapper";
import { asRecord, extractRecords } from "./pipispy-parse";
import { PIPISPY_URI } from "./pipispy-uris";
import { isDetailFree, isStoreFree, recordDetailSeen, recordStoreSeen } from "./session-cache";
import type {
  AdCard,
  AdDetail,
  AdspyDetail,
  AdspyParams,
  CompetitionParams,
  CompetitionProductRow,
  CompetitionProductsParams,
  CreativeBrief,
  CreditsBalance,
  DossierRequestItem,
  ImageSearchResult,
  MarketingResponse,
  PageMeta,
  ProductDossier,
  RankParams,
  RankRow,
  StoreAdTrendPoint,
  StoreDataAnalysis,
  StoreDeliveryAnalysis,
  StoreDossier,
  StoreFbPage,
  StoreIdParams,
  StoreLongestRunAd,
  StoreMostUsedAd,
  StoreRegionAnalysis,
  StoreRow,
  StoreSearchParams,
  StoreSearchResult,
  TtsShopDetail,
  TtsShopParams,
  TtsShopRow,
} from "./types";

/** Last competition search — used as analytics cohort when not on mock data. */
let lastCompetitionStores: StoreRow[] = [];

export function getReferenceCohortFromSession(): StoreRow[] {
  return lastCompetitionStores;
}

export async function fetchCreditsBalanceReal(): Promise<CreditsBalance> {
  const res = await marketingCreditsBalance();
  return mapCreditsBalance(res.data);
}

export async function fetchCompetitionReal(
  params: CompetitionParams
): Promise<MarketingResponse<{ stores: StoreRow[]; products: AdCard[] }>> {
  const res = await marketingPost(PIPISPY_URI.competition, buildCompetitionParams(params));
  const records = extractRecords(res.data);
  const stores = records.map(mapStoreRow);
  lastCompetitionStores = stores;
  // 登记 store_id 进入「3 天免费店铺窗口」池（搜索见过的店，窗口内再开抽屉不重复计费）。
  stores.forEach((s) => recordStoreSeen(s.id));
  return {
    data: { stores, products: [] },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

export async function fetchRankListReal(
  params: RankParams
): Promise<MarketingResponse<{ list: RankRow[]; page: PageMeta }>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const res = await marketingPost(PIPISPY_URI.rankList, buildRankListParams(params));
  const records = extractRecords(res.data);
  const list = records.map(mapRankRow);
  // 登记 product_id 进入「3 天免费详情窗口」池（榜/搜见过的品，窗口内再开详情不重复计费）。
  list.forEach((r) => recordDetailSeen(r.id));
  const pageMeta = mapPageMeta(res.data, page, pageSize, list.length);
  return {
    data: { list, page: pageMeta },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

export async function fetchSearchAdsReal(
  q: string,
  page = 1,
  pageSize = 12
): Promise<MarketingResponse<{ list: AdCard[]; page: PageMeta }>> {
  const res = await marketingPost(PIPISPY_URI.productsSearch, buildSearchAdsParams(q, page, pageSize));
  const records = extractRecords(res.data);
  const list = records.map(mapAdCard);
  list.forEach((c) => recordDetailSeen(c.id));
  const pageMeta = mapPageMeta(res.data, page, pageSize, list.length);
  return {
    data: { list, page: pageMeta },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

export async function fetchTtsShopsReal(
  params: TtsShopParams
): Promise<MarketingResponse<{ list: TtsShopRow[]; page: PageMeta }>> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const res = await marketingPost(PIPISPY_URI.tiktokShopList, buildTtsShopParams(params));
  const records = extractRecords(res.data);
  const list = records.map(mapTtsShopRow);
  const pageMeta = mapPageMeta(res.data, page, pageSize, list.length);
  return {
    data: { list, page: pageMeta },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

/** TikTok Shop 店铺详情富集（tiktok-shop/shop/detail），单对象，享 3 天免费窗口（按店铺 id）。 */
export async function fetchTtsShopDetailReal(
  params: { id: string }
): Promise<MarketingResponse<TtsShopDetail>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.tiktokShopDetail, { id: params.id });
  const root = asRecord(res.data) ?? {};
  const rec = asRecord(root.data) ?? root;
  recordStoreSeen(params.id);
  return {
    data: mapTtsShopDetail(rec),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

export async function fetchAdDetailReal(id: string): Promise<MarketingResponse<AdDetail>> {
  // 命中「3 天免费窗口」：榜/搜见过的 product_id，窗口内再开详情 pipispy 不重复计费（响应 consumedCredits 通常为 0）。
  const freeWindow = isDetailFree(id);
  const res = await marketingPost(PIPISPY_URI.productDetail, { id });
  const row = asRecord(res.data) ?? asRecord(extractRecords(res.data)[0]) ?? {};
  recordDetailSeen(id);
  return {
    data: mapAdDetail(row, id),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 创意打法库（adspy/list；含已停投切 ad-library/ads）。 */
export async function fetchAdspyListReal(
  params: AdspyParams
): Promise<MarketingResponse<{ list: CreativeBrief[]; page: PageMeta }>> {
  const uri = params.includeStopped ? PIPISPY_URI.adLibraryAds : PIPISPY_URI.adspyList;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 12;
  const res = await marketingPost(uri, buildAdspyParams(params));
  const records = extractRecords(res.data);
  const list = records.map(mapCreativeBrief);
  if (!params.includeStopped) {
    // adspy/list 仅活跃创意；显式过滤以防后端返回已停投。
    const active = list.filter((c) => c.isActive);
    active.forEach((c) => recordDetailSeen(c.id));
    const pageMeta = mapPageMeta(res.data, page, pageSize, active.length);
    return {
      data: { list: active, page: pageMeta },
      source: res.source,
      consumedCredits: res.consumedCredits,
      remainingCredits: res.remainingCredits,
    };
  }
  list.forEach((c) => recordDetailSeen(c.id));
  const pageMeta = mapPageMeta(res.data, page, pageSize, list.length);
  return {
    data: { list, page: pageMeta },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

/**
 * Adspy 创意详情（adspy/detail；按列表 video_id 取）。
 * 计费：pipispy 侧「3 天免费窗口」——同一 video_id 3 天内复开详情不重复计费（真实扣点以响应 consumedCredits 为准）。
 * 注意：列表登记的是 ad_id（mapCreativeBrief.id），与详情的 video_id 不同字段，故列表不会把详情"洗成免费"；
 * 首开详情按 pipispy 真实 consumedCredits 计费，打开后本端 recordDetailSeen(video_id) 登记，再做会话级（5min）复用。
 */
export async function fetchAdspyDetailReal(
  id: string
): Promise<MarketingResponse<AdspyDetail>> {
  const freeWindow = isDetailFree(id);
  const res = await marketingPost(PIPISPY_URI.adspyDetail, { id });
  const row =
    asRecord(res.data) ??
    asRecord(extractRecords(res.data)[0]) ??
    {};
  recordDetailSeen(id);
  return {
    data: mapAdspyDetail(row, id),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}
export async function fetchCompetitionProductsReal(
  params: CompetitionProductsParams
): Promise<MarketingResponse<{ list: CompetitionProductRow[] }>> {
  const res = await marketingPost(PIPISPY_URI.products, { id: params.id });
  const records = extractRecords(res.data);
  const list = records.map(mapCompetitionProduct);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

// --- 竞店充实（store/detail 族，基于 store id，享 3 天免费窗口）---

/** 广告趋势（store/ad-trend）。 */
export async function fetchStoreAdTrendReal(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreAdTrendPoint[] }>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeAdTrend, buildStoreIdParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreAdTrend);
  recordStoreSeen(params.id);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 常青素材（store/longest-run-ads）。 */
export async function fetchStoreLongestRunAdsReal(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreLongestRunAd[] }>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeLongest, buildStoreIdParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreLongestRunAd);
  recordStoreSeen(params.id);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 高频素材（store/most-used-ads）。 */
export async function fetchStoreMostUsedAdsReal(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreMostUsedAd[] }>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeMostUsed, buildStoreIdParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreMostUsedAd);
  recordStoreSeen(params.id);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 关联 Facebook 主页（store/fb-pages）。 */
export async function fetchStoreFbPagesReal(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreFbPage[] }>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeFbPages, buildStoreIdParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreFbPage);
  recordStoreSeen(params.id);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

// --- 店铺检索（store/list，域名/店名 → 内部 ID，按结果计费，无免费窗口）---

/** 店铺检索（store/list）：把人类可读输入解析成 store id。 */
export async function fetchStoreSearchReal(
  params: StoreSearchParams
): Promise<MarketingResponse<{ list: StoreSearchResult[]; page: PageMeta }>> {
  const res = await marketingPost(PIPISPY_URI.storeSearch, buildStoreSearchParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreSearchResult);
  const pageMeta = mapPageMeta(res.data, params.currentPage ?? 1, params.pageSize ?? 5, list.length);
  return {
    data: { list, page: pageMeta },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

// --- 店铺数据分析（store/data-analysis 族，享 3 天免费窗口）---

/** 店铺数据分析（store/data-analysis，单对象，截图「数据分析」整块）。 */
export async function fetchStoreDataAnalysisReal(
  params: StoreIdParams
): Promise<MarketingResponse<StoreDataAnalysis>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeDataAnalysis, buildStoreIdParam(params));
  const root = asRecord(res.data) ?? {};
  const rec = asRecord(root.data) ?? root;
  recordStoreSeen(params.id);
  return {
    data: mapStoreDataAnalysis(rec),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 广告地区分布（store/region-analysis）。 */
export async function fetchStoreRegionAnalysisReal(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreRegionAnalysis[] }>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeRegionAnalysis, buildStoreIdParam(params));
  const records = extractRecords(res.data);
  const list = records.map(mapStoreRegionAnalysis);
  recordStoreSeen(params.id);
  return {
    data: { list },
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/** 交付分析（store/delivery-analysis，单对象）。 */
export async function fetchStoreDeliveryAnalysisReal(
  params: StoreIdParams
): Promise<MarketingResponse<StoreDeliveryAnalysis>> {
  const freeWindow = isStoreFree(params.id);
  const res = await marketingPost(PIPISPY_URI.storeDeliveryAnalysis, buildStoreIdParam(params));
  const root = asRecord(res.data) ?? {};
  const rec = asRecord(root.data) ?? root;
  recordStoreSeen(params.id);
  return {
    data: mapStoreDeliveryAnalysis(rec),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
    freeWindow,
  };
}

/**
 * pipispy 以图搜真实链路：后端 /api/plugin/marketing/ai-search-image 编排
 * （submit → status 轮询 → resultSummary → product/search，单次计费）。
 * 支持 imageUrl 或 file 二选一；pageSize 默认 4，expectedCredits = (pageSize+3)*2。
 */
export async function fetchImageSearchReal(
  opts: { imageUrl?: string; file?: File | null; page?: number; pageSize?: number }
): Promise<MarketingResponse<{ list: ImageSearchResult[]; page: PageMeta }>> {
  const page = opts.page ?? 1;
  const pageSize = Math.min(Math.max(opts.pageSize ?? 4, 1), 50);
  const expectedCredits = (pageSize + 3) * 2;
  return marketingImageSearch({
    imageUrl: opts.imageUrl,
    file: opts.file ?? undefined,
    page,
    pageSize,
    expectedCredits,
  });
}

// --- 通用 dossier 扇出（一次 N 端点，路由页富内容落地）---

/**
 * 单店富 dossier：一次扇出 8 个 store/* 端点（analytics 族 7 个 + 店下在投商品免费端点）。
 * 享 3 天免费窗口（按 store id）；totalConsumedCredits 为本次真实总扣点。
 */
export async function fetchStoreDossierReal(
  id: string
): Promise<MarketingResponse<StoreDossier>> {
  const storeFree = isStoreFree(id);
  const requests: DossierRequestItem[] = [
    { tag: "adTrend", uri: PIPISPY_URI.storeAdTrend, params: buildStoreIdParam({ id }) },
    { tag: "longest", uri: PIPISPY_URI.storeLongest, params: buildStoreIdParam({ id }) },
    { tag: "mostUsed", uri: PIPISPY_URI.storeMostUsed, params: buildStoreIdParam({ id }) },
    { tag: "fbPages", uri: PIPISPY_URI.storeFbPages, params: buildStoreIdParam({ id }) },
    { tag: "dataAnalysis", uri: PIPISPY_URI.storeDataAnalysis, params: buildStoreIdParam({ id }) },
    { tag: "regionAnalysis", uri: PIPISPY_URI.storeRegionAnalysis, params: buildStoreIdParam({ id }) },
    { tag: "deliveryAnalysis", uri: PIPISPY_URI.storeDeliveryAnalysis, params: buildStoreIdParam({ id }) },
    // 免费端点：店下在投商品，不重复扣点。
    { tag: "products", uri: PIPISPY_URI.products, params: { id } },
  ];
  const raw = await marketingDossier(requests);
  recordStoreSeen(id);
  const tagData = (tag: string): unknown => raw.results[tag]?.data;
  const unwrap = (v: unknown): Record<string, unknown> => {
    const root = asRecord(v) ?? {};
    return asRecord(root.data) ?? root;
  };
  const dossier: StoreDossier = {
    store: null,
    products: extractRecords(tagData("products")).map(mapCompetitionProduct),
    dataAnalysis: mapStoreDataAnalysis(unwrap(tagData("dataAnalysis"))),
    regionAnalysis: extractRecords(tagData("regionAnalysis")).map(mapStoreRegionAnalysis),
    deliveryAnalysis: mapStoreDeliveryAnalysis(unwrap(tagData("deliveryAnalysis"))),
    adTrend: extractRecords(tagData("adTrend")).map(mapStoreAdTrend),
    longest: extractRecords(tagData("longest")).map(mapStoreLongestRunAd),
    mostUsed: extractRecords(tagData("mostUsed")).map(mapStoreMostUsedAd),
    fbPages: extractRecords(tagData("fbPages")).map(mapStoreFbPage),
  };
  return {
    data: dossier,
    source: "pipispy",
    consumedCredits: raw.totalConsumedCredits,
    remainingCredits: raw.results.dataAnalysis?.remainingCredits ?? 0,
    freeWindow: storeFree,
  };
}

/**
 * 单品富 dossier：扇出商品详情（ppspy/ad-products/detail）+ 市场同类创意墙（adspy/list）。
 * 享 3 天免费窗口（按 product id）。related 为广告库创意墙，用于「市场同类」对照。
 */
export async function fetchProductDossierReal(
  id: string
): Promise<MarketingResponse<ProductDossier>> {
  const free = isDetailFree(id);
  const requests: DossierRequestItem[] = [
    { tag: "detail", uri: PIPISPY_URI.productDetail, params: { id } },
    {
      tag: "related",
      uri: PIPISPY_URI.adspyList,
      params: { page: 1, per_page: 12, order_by: "ad_started_at", direction: "desc" },
    },
  ];
  const raw = await marketingDossier(requests);
  recordDetailSeen(id);
  const detailRaw = raw.results["detail"]?.data;
  const detail = mapAdDetail(
    asRecord(detailRaw) ?? asRecord(extractRecords(detailRaw)[0]) ?? {},
    id
  );
  const related = extractRecords(raw.results["related"]?.data).map(mapCreativeBrief);
  return {
    data: { detail, relatedAds: related },
    source: "pipispy",
    consumedCredits: raw.totalConsumedCredits,
    remainingCredits: raw.results.detail?.remainingCredits ?? 0,
    freeWindow: free,
  };
}
