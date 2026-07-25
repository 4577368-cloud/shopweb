import { marketingCreditsBalance, marketingPost } from "./marketing-proxy";
import {
  buildCompetitionParams,
  buildRankListParams,
  buildSearchAdsParams,
  buildTtsShopParams,
} from "./marketing-params";
import {
  mapAdCard,
  mapAdDetail,
  mapCreditsBalance,
  mapPageMeta,
  mapRankRow,
  mapStoreRow,
  mapTtsShopRow,
} from "./pipispy-mapper";
import { asRecord, extractRecords } from "./pipispy-parse";
import { PIPISPY_URI } from "./pipispy-uris";
import type {
  AdCard,
  AdDetail,
  CompetitionParams,
  CreditsBalance,
  ImageSearchResult,
  MarketingResponse,
  PageMeta,
  RankParams,
  RankRow,
  StoreRow,
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
  const pageSize = params.pageSize ?? 20;
  const res = await marketingPost(PIPISPY_URI.rankList, buildRankListParams(params));
  const records = extractRecords(res.data);
  const list = records.map(mapRankRow);
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
  pageSize = 20
): Promise<MarketingResponse<{ list: AdCard[]; page: PageMeta }>> {
  const res = await marketingPost(PIPISPY_URI.productsSearch, buildSearchAdsParams(q, page, pageSize));
  const records = extractRecords(res.data);
  const list = records.map(mapAdCard);
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
  const pageSize = params.pageSize ?? 20;
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

export async function fetchAdDetailReal(id: string): Promise<MarketingResponse<AdDetail>> {
  const res = await marketingPost(PIPISPY_URI.productDetail, { id });
  const row = asRecord(res.data) ?? asRecord(extractRecords(res.data)[0]) ?? {};
  return {
    data: mapAdDetail(row, id),
    source: res.source,
    consumedCredits: res.consumedCredits,
    remainingCredits: res.remainingCredits,
  };
}

/** pipispy 以图搜仍为三步 Job；真实链路待接，调用方在 api 层回退 mock。 */
export async function fetchImageSearchReal(
  _imageFile: File,
  _page = 1
): Promise<MarketingResponse<{ list: ImageSearchResult[]; page: PageMeta }>> {
  throw new Error("IMAGE_SEARCH_NOT_WIRED");
}
