import type { CompetitionParams, RankParams, TtsShopParams } from "./types";

/** pipispy rankList `time` = Asia/Shanghai midnight (seconds). */
export function shanghaiMidnight(ts = Date.now()): number {
  const shDate = new Date(ts).toLocaleString("sv", { timeZone: "Asia/Shanghai" }).split(" ")[0];
  return Math.floor(new Date(`${shDate}T00:00:00+08:00`).getTime() / 1000);
}

export function buildRankListParams(p: RankParams): Record<string, unknown> {
  const params: Record<string, unknown> = {
    current_page: p.page ?? 1,
    page_size: p.pageSize ?? 20,
    type: p.type,
    sort_key: p.sortKey,
    sort_type: p.sortType ?? "desc",
    time: p.time ?? shanghaiMidnight(),
  };
  if (p.region) params.region = p.region;
  if (p.category) params.category = p.category;
  if (p.shopType) params.shop_type = p.shopType;
  if (p.platType != null) params.plat_type = p.platType;
  if (p.countGrowthMin != null) params.count_growth_min = p.countGrowthMin;
  if (p.countGrowthMax != null) params.count_growth_max = p.countGrowthMax;
  if (p.growthRateMin != null) params.growth_rate_min = p.growthRateMin;
  if (p.growthRateMax != null) params.growth_rate_max = p.growthRateMax;
  return params;
}

export function buildCompetitionParams(p: CompetitionParams): Record<string, unknown> {
  const params: Record<string, unknown> = {
    id: p.id,
    current_page: p.currentPage ?? 1,
    page_size: p.pageSize ?? 10,
  };
  if (p.productId) params.product_id = p.productId;
  return params;
}

export function buildSearchAdsParams(q: string, page: number, pageSize: number): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page,
    per_page: pageSize,
    order_by: "ad_started_at",
    direction: "desc",
  };
  const kw = q.trim();
  if (kw) {
    params.keyword = kw;
    params.q = kw;
  }
  return params;
}

export function buildTtsShopParams(p: TtsShopParams): Record<string, unknown> {
  const params: Record<string, unknown> = {
    current_page: p.page ?? 1,
    page_size: p.pageSize ?? 20,
    sort: 3,
    sort_type: "desc",
    time: 30,
  };
  if (p.region) params.region = p.region;
  if (p.category) params.category = p.category;
  return params;
}
