// 运营中心 · 营销数据访问层
// 默认走 tangbuy-plugin → pipispy；仅当 NEXT_PUBLIC_MARKETING_USE_MOCK=true 时用本地 mock。

import {
  fetchAdDetailReal,
  fetchAdspyListReal,
  fetchCompetitionProductsReal,
  fetchCompetitionReal,
  fetchCreditsBalanceReal,
  fetchImageSearchReal,
  fetchProductDossierReal,
  fetchRankListReal,
  fetchSearchAdsReal,
  fetchStoreAdTrendReal,
  fetchStoreDataAnalysisReal,
  fetchStoreDeliveryAnalysisReal,
  fetchStoreDossierReal,
  fetchStoreFbPagesReal,
  fetchStoreLongestRunAdsReal,
  fetchStoreMostUsedAdsReal,
  fetchStoreRegionAnalysisReal,
  fetchStoreSearchReal,
  fetchTtsShopDetailReal,
  fetchTtsShopsReal,
  getReferenceCohortFromSession,
} from "./marketing-real";
import { PIPISPY_URI } from "./pipispy-uris";
import {
  makeAdCards,
  makeAdDetail,
  makeCompetitionProducts,
  makeCreativeBriefs,
  makeImageResults,
  makeRankRows,
  makeStores,
  makeStoreAdTrend,
  makeStoreDataAnalysis,
  makeStoreDeliveryAnalysis,
  makeStoreFbPages,
  makeStoreLongestRunAds,
  makeStoreMostUsedAds,
  makeStoreRegionAnalysis,
  makeStoreSearchResults,
  makeStoreDossier,
  makeProductDossier,
  makeTtsShops,
  makeTtsShopDetail,
  MOCK_RANK_META,
} from "./mock";
import { isDetailFree, isStoreFree, recordDetailSeen, recordStoreSeen } from "./session-cache";

// 供发现页洞察面板复用（rank 行 region/category 侧信道，仅 mock）
export { MOCK_RANK_META };
import type {
  AdCard,
  AdDetail,
  AdspyParams,
  CompetitionParams,
  CompetitionProductRow,
  CompetitionProductsParams,
  CreativeBrief,
  CreditsBalance,
  ImageSearchResult,
  MarketingResponse,
  PageMeta,
  RankParams,
  RankRow,
  RankSortKey,
  StoreAdTrendPoint,
  StoreDataAnalysis,
  StoreDeliveryAnalysis,
  StoreFbPage,
  StoreIdParams,
  StoreLongestRunAd,
  StoreMostUsedAd,
  StoreRegionAnalysis,
  StoreRow,
  StoreSearchParams,
  StoreSearchResult,
  ProductDossier,
  StoreDossier,
  TtsShopDetail,
  TtsShopParams,
  TtsShopRow,
} from "./types";

export { PIPISPY_URI } from "./pipispy-uris";
export { MarketingApiError } from "./marketing-proxy";

/** 本地 mock：`NEXT_PUBLIC_MARKETING_USE_MOCK=true` */
export const USE_MOCK = process.env.NEXT_PUBLIC_MARKETING_USE_MOCK === "true";

const delay = (ms = 380) => new Promise((res) => setTimeout(res, ms));

function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return {
    totalCount: total,
    pageCount,
    currentPage: page,
    pageSize,
    isNext: page < pageCount,
  };
}

// 模块级数据集：保证分页/筛选在会话内一致。
const ALL_STORES = makeStores(40);
const ALL_ADS = makeAdCards(80);
const ALL_RANK = makeRankRows(200);
const ALL_TTS = makeTtsShops(60);
const ALL_CREATIVES = makeCreativeBriefs(72);

// 店铺注册表：竞店搜索/详情见过的 StoreRow 暂存（模块级），供 store/[id] 路由页头部复用。
// dossier 端点不返回基础店铺信息（StoreRow），故从已知的 StoreRow 注入头部。
const storeRegistry = new Map<string, StoreRow>();
export function registerStore(store: StoreRow): void {
  if (store?.id) storeRegistry.set(store.id, store);
}
export function getRegisteredStore(id: string): StoreRow | null {
  return storeRegistry.get(id) ?? null;
}

/** 竞品参照集合（mock：全部 40 店；真实模式由后端返回"我的监控竞品"）。用于对标基准/雷达/流量质量分。 */
export function referenceCohort(): StoreRow[] {
  if (!USE_MOCK) return getReferenceCohortFromSession();
  return ALL_STORES;
}

/** 市场脉搏概览（运营中心顶部指标头，复用同一数据集确保与视图一致）。 */
export const marketPulse = (() => {
  const cpms = ALL_RANK.filter((r) => r.minCpm != null && r.maxCpm != null).map((r) => (r.minCpm! + r.maxCpm!) / 2);
  return {
    competitors: ALL_STORES.length,
    products: ALL_RANK.length,
    avgCpm: cpms.length ? cpms.reduce((a, b) => a + b, 0) / cpms.length : 0,
  };
})();

// --- 账户级余额（mock 阶段模拟 pipispy 的 API 账户，对应你的 key，非单个用户）---
// 真实模式：余额来自 /open-api/v1/credits-balance（经 /api/plugin/marketing/credits-balance 代理，
// key 由服务端注入）。mock 阶段用单一 localStorage 键模拟「账户共享余额」，每次调用递减，
// 让「消费反馈」可见；刷新页面余额持续（账户级语义），而不是按浏览器/商家孤立。
const ACCOUNT_KEY = "tangbuy.ops.accountBalance";
interface MockAccount {
  totalApi: number;
  remainingApi: number;
  totalMonitor: number;
  remainingMonitor: number;
}
let accountCache: MockAccount | null = null;
function getAccount(): MockAccount {
  if (accountCache) return accountCache;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ACCOUNT_KEY);
      if (raw) {
        accountCache = JSON.parse(raw) as MockAccount;
        return accountCache;
      }
    } catch {
      // ignore
    }
  }
  accountCache = { totalApi: 10000, remainingApi: 8500, totalMonitor: 5000, remainingMonitor: 4200 };
  return accountCache;
}
function persistAccount(acc: MockAccount) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(acc));
  } catch {
    // ignore
  }
}
// 真实计费口径（用户确认：pipispy 按"每次有效调用"计费，普通接口 1 次调用 = 1 点）。
// 以图搜真实为 submit+status+resultSummary+product/search 编排，按 product/search 实际返回条数
// 计费（1 点/条）+ 编排步；服务端估计下界 = (pageSize+3)*2（×2 到用户钱包）。
// 用户要求"都按真实计算"：真实模式由业务响应 consumed_credits 决定，账本一律以响应为准。
export const CREDIT_PER_CALL = 1;
export const IMAGE_SEARCH_CREDITS = 3;

/** 以图搜预估消耗（与服务端同公式）：(pageSize+3)*2，pageSize 默认 4。 */
export function imageSearchEstimate(pageSize = 4): number {
  return (Math.min(Math.max(pageSize, 1), 50) + 3) * 2;
}

/** 按接口返回真实消耗点数（mock 与真实口径一致）。 */
export function realCostFor(endpoint: string): number {
  if (endpoint === "ai-search-image") return IMAGE_SEARCH_CREDITS;
  return CREDIT_PER_CALL;
}

/** 从模拟账户扣除 n 点 api credits，返回调用后剩余。 */
function consumeApi(n: number): number {
  const acc = getAccount();
  acc.remainingApi = Math.max(0, acc.remainingApi - n);
  persistAccount(acc);
  return acc.remainingApi;
}

// --- 账户级额度查询（对应 /open-api/v1/credits-balance）---
export async function fetchCreditsBalance(): Promise<CreditsBalance> {
  if (!USE_MOCK) return fetchCreditsBalanceReal();
  await delay(120);
  const acc = getAccount();
  return {
    totalApiCredits: acc.totalApi,
    remainingApiCredits: acc.remainingApi,
    purchasedApiCredits: acc.totalApi,
    usedApiCredits: acc.totalApi - acc.remainingApi,
    totalMonitorCredits: acc.totalMonitor,
    remainingMonitorCredits: acc.remainingMonitor,
    purchasedMonitorCredits: acc.totalMonitor,
    usedMonitorCredits: acc.totalMonitor - acc.remainingMonitor,
  };
}

// --- 竞店（store/detail/competition）---
export async function fetchCompetition(
  params: CompetitionParams
): Promise<MarketingResponse<{ stores: StoreRow[]; products: AdCard[] }>> {
  if (!USE_MOCK) {
    const res = await fetchCompetitionReal(params);
    res.data.stores.forEach(registerStore);
    return res;
  }
  await delay();
  const pageSize = params.pageSize ?? 10;
  const start = ((params.currentPage ?? 1) - 1) * pageSize;
  const stores = ALL_STORES.slice(start, start + pageSize);
  // 模拟"按商品找相似竞店"返回的关联创意（取前若干广告卡）
  const products = ALL_ADS.slice(0, 6);
  // 登记 store_id 进入「3 天免费店铺窗口」池（mock 与真实一致）。
  stores.forEach((s) => recordStoreSeen(s.id));
  const consumed = CREDIT_PER_CALL;
  return {
    data: { stores, products },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 店下在投商品（store/detail/competition/products，免费端点）---
export async function fetchCompetitionProducts(
  params: CompetitionProductsParams
): Promise<MarketingResponse<{ list: CompetitionProductRow[] }>> {
  if (!USE_MOCK) return fetchCompetitionProductsReal(params);
  await delay();
  // 免费端点：不扣 api credits。
  return {
    data: { list: makeCompetitionProducts(params.id) },
    source: "mock",
    remainingCredits: getAccount().remainingApi,
    consumedCredits: 0,
  };
}

// --- 竞店充实（store/detail 族，基于 store id，享 3 天免费窗口）---

/** 广告趋势（store/ad-trend）。 */
export async function fetchStoreAdTrend(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreAdTrendPoint[] }>> {
  if (!USE_MOCK) return fetchStoreAdTrendReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: { list: makeStoreAdTrend(params.id) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/** 常青素材（store/longest-run-ads）。 */
export async function fetchStoreLongestRunAds(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreLongestRunAd[] }>> {
  if (!USE_MOCK) return fetchStoreLongestRunAdsReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: { list: makeStoreLongestRunAds(params.id) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/** 高频素材（store/most-used-ads）。 */
export async function fetchStoreMostUsedAds(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreMostUsedAd[] }>> {
  if (!USE_MOCK) return fetchStoreMostUsedAdsReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: { list: makeStoreMostUsedAds(params.id) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/** 关联 Facebook 主页（store/fb-pages）。 */
export async function fetchStoreFbPages(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreFbPage[] }>> {
  if (!USE_MOCK) return fetchStoreFbPagesReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: { list: makeStoreFbPages(params.id) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

// --- 店铺检索（store/list，域名/店名 → 内部 ID，按结果计费，无免费窗口）---

/** 店铺检索（store/list）：把人类可读输入解析成 store id 候选。 */
export async function fetchStoreSearch(
  params: StoreSearchParams
): Promise<MarketingResponse<{ list: StoreSearchResult[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchStoreSearchReal(params);
  await delay();
  const list = makeStoreSearchResults(params.keyword, params.pageSize ?? 5);
  const consumed = list.length; // 1 积分/条，search 无免费窗口
  return {
    data: { list, page: pageMeta(list.length, params.currentPage ?? 1, params.pageSize ?? 5) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 店铺数据分析（store/data-analysis 族，享 3 天免费窗口）---

/** 店铺数据分析（store/data-analysis，截图「数据分析」整块）。 */
export async function fetchStoreDataAnalysis(
  params: StoreIdParams
): Promise<MarketingResponse<StoreDataAnalysis>> {
  if (!USE_MOCK) return fetchStoreDataAnalysisReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: makeStoreDataAnalysis(params.id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/** 广告地区分布（store/region-analysis）。 */
export async function fetchStoreRegionAnalysis(
  params: StoreIdParams
): Promise<MarketingResponse<{ list: StoreRegionAnalysis[] }>> {
  if (!USE_MOCK) return fetchStoreRegionAnalysisReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: { list: makeStoreRegionAnalysis(params.id) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/** 交付分析（store/delivery-analysis）。 */
export async function fetchStoreDeliveryAnalysis(
  params: StoreIdParams
): Promise<MarketingResponse<StoreDeliveryAnalysis>> {
  if (!USE_MOCK) return fetchStoreDeliveryAnalysisReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: makeStoreDeliveryAnalysis(params.id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

// --- 单店/单品富 dossier（通用扇出端点 /dossier，一次 N 端点，路由页富内容）---

/**
 * 单店富 dossier（/operations-center/store/[id]）：一次扇出 8 个 store/* 端点。
 * store 头部来自注册表（dossier 端点不返回基础店铺信息）；3 天免费窗口按 store id。
 */
export async function fetchStoreDossier(
  id: string
): Promise<MarketingResponse<StoreDossier>> {
  if (!USE_MOCK) {
    const res = await fetchStoreDossierReal(id);
    res.data.store = getRegisteredStore(id);
    return res;
  }
  await delay();
  const freeWindow = isStoreFree(id);
  recordStoreSeen(id);
  const dossier = makeStoreDossier(id);
  dossier.store = getRegisteredStore(id);
  // 7 个 analytics 端点计费 + 1 个店下在投商品免费端点。
  const consumed = freeWindow ? 0 : 7 * CREDIT_PER_CALL;
  return {
    data: dossier,
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

/**
 * 单品富 dossier（/operations-center/product/[id]）：扇出详情 + 市场同类创意墙。
 * 3 天免费窗口按 product id。
 */
export async function fetchProductDossier(
  id: string
): Promise<MarketingResponse<ProductDossier>> {
  if (!USE_MOCK) return fetchProductDossierReal(id);
  await delay();
  const freeWindow = isDetailFree(id);
  recordDetailSeen(id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: makeProductDossier(id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

// --- 榜单（rank/ad-product/list）---
export async function fetchRankList(
  params: RankParams
): Promise<MarketingResponse<{ list: RankRow[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchRankListReal(params);
  await delay();
  const pageSize = params.pageSize ?? 12;
  const page = params.page ?? 1;
  let list = [...ALL_RANK];
  // 服务端过滤（真实由 pipispy 承担；mock 用 MOCK_RANK_META 侧信道演示，不在 RankRow 上挂合成字段）
  if (params.region) {
    const rs = params.region.split(",").map((s) => s.trim().toUpperCase());
    list = list.filter((r) => rs.includes(MOCK_RANK_META.get(r.id)?.region ?? ""));
  }
  if (params.category) list = list.filter((r) => MOCK_RANK_META.get(r.id)?.category === params.category);
  if (params.shopType) list = list.filter((r) => r.platform === params.shopType);
  if (params.countGrowthMin != null) list = list.filter((r) => r.countGrowth >= params.countGrowthMin!);
  if (params.countGrowthMax != null) list = list.filter((r) => r.countGrowth <= params.countGrowthMax!);
  if (params.growthRateMin != null) list = list.filter((r) => r.growthRate >= params.growthRateMin!);
  if (params.growthRateMax != null) list = list.filter((r) => r.growthRate <= params.growthRateMax!);
  // 排序
  const dir = params.sortType === "asc" ? 1 : -1;
  const sortField: Record<RankSortKey, keyof RankRow> = {
    count_growth: "countGrowth",
    growth_rate: "growthRate",
    video_count: "videoCount",
  };
  const sk = sortField[params.sortKey];
  list.sort((a, b) => ((a[sk] as number) - (b[sk] as number)) * dir);
  const start = (page - 1) * pageSize;
  const sliced = list.slice(start, start + pageSize);
  sliced.forEach((r) => recordDetailSeen(r.id));
  const consumed = CREDIT_PER_CALL;
  return {
    data: { list: sliced, page: pageMeta(list.length, page, pageSize) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 广告商品搜索（ad-products/search）---
export async function fetchSearchAds(
  q: string,
  page = 1,
  pageSize = 12
): Promise<MarketingResponse<{ list: AdCard[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchSearchAdsReal(q, page, pageSize);
  await delay();
  const kw = q.trim().toLowerCase();
  const filtered = kw ? ALL_ADS.filter((a) => a.title.toLowerCase().includes(kw)) : ALL_ADS;
  const start = (page - 1) * pageSize;
  const sliced = filtered.slice(start, start + pageSize);
  sliced.forEach((c) => recordDetailSeen(c.id));
  const consumed = CREDIT_PER_CALL;
  return {
    data: { list: sliced, page: pageMeta(filtered.length, page, pageSize) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 创意打法库（adspy/list；含已停投切 ad-library/ads）---
export async function fetchAdspyList(
  params: AdspyParams = {}
): Promise<MarketingResponse<{ list: CreativeBrief[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchAdspyListReal(params);
  await delay();
  const kw = (params.q ?? "").trim().toLowerCase();
  const includeStopped = params.includeStopped ?? false;
  let list = [...ALL_CREATIVES];
  if (kw) list = list.filter((c) => c.title.toLowerCase().includes(kw) || c.copy.toLowerCase().includes(kw) || c.advertiser.toLowerCase().includes(kw));
  if (!includeStopped) list = list.filter((c) => c.isActive);
  const pageSize = params.pageSize ?? 12;
  const page = params.page ?? 1;
  const start = (page - 1) * pageSize;
  const sliced = list.slice(start, start + pageSize);
  sliced.forEach((c) => recordDetailSeen(c.id));
  const consumed = CREDIT_PER_CALL;
  return {
    data: { list: sliced, page: pageMeta(list.length, page, pageSize) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- TikTok Shop 榜（tiktok-shop-list）---
export async function fetchTtsShops(
  params: TtsShopParams
): Promise<MarketingResponse<{ list: TtsShopRow[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchTtsShopsReal(params);
  await delay();
  const pageSize = params.pageSize ?? 12;
  const page = params.page ?? 1;
  let list = [...ALL_TTS];
  if (params.region) list = list.filter((r) => r.regions.includes(params.region!));
  if (params.category)
    list = list.filter((r) => r.categories.some((c) => c.id === params.category || c.nameEn === params.category || c.nameZh === params.category));
  // 真实排序依据：GMV(USD) 降序（合成 growthRate 已移除）
  list.sort((a, b) => b.gmvUsd - a.gmvUsd);
  const start = (page - 1) * pageSize;
  const sliced = list.slice(start, start + pageSize);
  const consumed = CREDIT_PER_CALL;
  return {
    data: { list: sliced, page: pageMeta(list.length, page, pageSize) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- TikTok Shop 店铺详情富集（tiktok-shop/shop/detail，享 3 天免费窗口）---
export async function fetchTtsShopDetail(
  params: { id: string }
): Promise<MarketingResponse<TtsShopDetail>> {
  if (!USE_MOCK) return fetchTtsShopDetailReal(params);
  await delay();
  const freeWindow = isStoreFree(params.id);
  recordStoreSeen(params.id);
  const consumed = freeWindow ? 0 : CREDIT_PER_CALL;
  return {
    data: makeTtsShopDetail(params.id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

// --- 广告详情（ad-products/detail，无创意文案）---
export async function fetchAdDetail(id: string): Promise<MarketingResponse<AdDetail>> {
  if (!USE_MOCK) return fetchAdDetailReal(id);
  await delay();
  const freeWindow = isDetailFree(id);
  recordDetailSeen(id);
  const consumed = CREDIT_PER_CALL;
  return {
    data: makeAdDetail(id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
    freeWindow,
  };
}

// --- 以图搜（真实走后端编排端点 /api/plugin/marketing/ai-search-image；mock 仅原型）---
export async function fetchImageSearch(
  opts: { imageFile?: File | null; imageUrl?: string | null; page?: number; pageSize?: number }
): Promise<MarketingResponse<{ list: ImageSearchResult[]; page: PageMeta }>> {
  if (!USE_MOCK) {
    return fetchImageSearchReal({
      imageUrl: opts.imageUrl ?? undefined,
      file: opts.imageFile,
      page: opts.page,
      pageSize: opts.pageSize,
    });
  }
  // v1 mock：仅读取文件名用于日志；后端接通后应把 File 通过 FormData 上传，
  // 或先上传到对象存储再拿 URL 调 pipispy 以图搜图接口。
  void opts.imageFile?.name;
  await delay(700);
  const pageSize = opts.pageSize ?? 12;
  const page = opts.page ?? 1;
  const all = makeImageResults(24);
  const start = (page - 1) * pageSize;
  const sliced = all.slice(start, start + pageSize);
  const consumed = IMAGE_SEARCH_CREDITS;
  return {
    data: { list: sliced, page: pageMeta(all.length, page, pageSize) },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}
