// 运营中心 · 营销数据访问层
// 默认走 tangbuy-plugin → pipispy；仅当 NEXT_PUBLIC_MARKETING_USE_MOCK=true 时用本地 mock。

import {
  fetchAdDetailReal,
  fetchCompetitionReal,
  fetchCreditsBalanceReal,
  fetchRankListReal,
  fetchSearchAdsReal,
  fetchTtsShopsReal,
  getReferenceCohortFromSession,
} from "./marketing-real";
import { PIPISPY_URI } from "./pipispy-uris";
import {
  makeAdCards,
  makeAdDetail,
  makeImageResults,
  makeRankRows,
  makeStores,
  makeTtsShops,
  MOCK_RANK_META,
} from "./mock";

// 供发现页洞察面板复用（rank 行 region/category 侧信道，仅 mock）
export { MOCK_RANK_META };
import type {
  AdCard,
  AdDetail,
  CreditsBalance,
  ImageSearchResult,
  MarketingResponse,
  PageMeta,
  RankParams,
  RankRow,
  RankSortKey,
  StoreRow,
  TtsShopParams,
  TtsShopRow,
  CompetitionParams,
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
// 以图搜 v1.5 真实为 submit+status+result 三步流程 = 3 点（硬事实）。
// 用户要求"都按真实计算"：mock 阶段即按真实点数计（不再用 1 点兜底），真实模式由业务响应
// 的 consumed_credits 决定，账本一律以响应为准。
export const CREDIT_PER_CALL = 1;
export const IMAGE_SEARCH_CREDITS = 3;

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
  if (!USE_MOCK) return fetchCompetitionReal(params);
  await delay();
  const pageSize = params.pageSize ?? 10;
  const start = ((params.currentPage ?? 1) - 1) * pageSize;
  const stores = ALL_STORES.slice(start, start + pageSize);
  // 模拟"按商品找相似竞店"返回的关联创意（取前若干广告卡）
  const products = ALL_ADS.slice(0, 6);
  const consumed = CREDIT_PER_CALL;
  return {
    data: { stores, products },
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 榜单（rank/ad-product/list）---
export async function fetchRankList(
  params: RankParams
): Promise<MarketingResponse<{ list: RankRow[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchRankListReal(params);
  await delay();
  const pageSize = params.pageSize ?? 20;
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
  pageSize = 20
): Promise<MarketingResponse<{ list: AdCard[]; page: PageMeta }>> {
  if (!USE_MOCK) return fetchSearchAdsReal(q, page, pageSize);
  await delay();
  const kw = q.trim().toLowerCase();
  const filtered = kw ? ALL_ADS.filter((a) => a.title.toLowerCase().includes(kw)) : ALL_ADS;
  const start = (page - 1) * pageSize;
  const sliced = filtered.slice(start, start + pageSize);
  const consumed = CREDIT_PER_CALL;
  return {
    data: { list: sliced, page: pageMeta(filtered.length, page, pageSize) },
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
  const pageSize = params.pageSize ?? 20;
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

// --- 广告详情（ad-products/detail，无创意文案）---
export async function fetchAdDetail(id: string): Promise<MarketingResponse<AdDetail>> {
  if (!USE_MOCK) return fetchAdDetailReal(id);
  await delay();
  const consumed = CREDIT_PER_CALL;
  return {
    data: makeAdDetail(id),
    source: "mock",
    remainingCredits: consumeApi(consumed),
    consumedCredits: consumed,
  };
}

// --- 以图搜（v1.5 submit/status/result-summary，mock）---
export async function fetchImageSearch(
  imageFile: File,
  page = 1
): Promise<MarketingResponse<{ list: ImageSearchResult[]; page: PageMeta }>> {
  // v1 mock：仅读取文件名用于日志；后端接通后应把 File 通过 FormData 上传，
  // 或先上传到对象存储再拿 URL 调 pipispy 以图搜图接口。
  void imageFile.name;
  await delay(700);
  const all = makeImageResults(24);
  const pageSize = 12;
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
