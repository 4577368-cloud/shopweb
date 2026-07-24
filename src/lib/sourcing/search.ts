import {
  fetchRecommendations,
  type FetchRecommendationsOptions,
} from "@/lib/catalog-recommendations";
import type {
  CatalogFilterState,
  RecommendedCategory,
} from "@/lib/catalog-sourcing-types";
import type { SourcingSourceFilter } from "@/lib/sourcing/types";
import {
  DEFAULT_1688_DISPLAY_MULTIPLIER,
  TANGBUY_DISPLAY_MULTIPLIER,
  type SourcingSearchHit,
} from "@/lib/sourcing/types";
import { search1688OffersByKeyword } from "@/lib/sourcing/search-1688";
import type { PricingTemplate } from "@/lib/types";

export interface SourcingSearchOptions {
  shopName: string;
  limit: number;
  offset: number;
  template: PricingTemplate;
  filters: CatalogFilterState;
  categories?: RecommendedCategory[];
  localeCountry?: string;
}

function buildKeywords(
  filters: CatalogFilterState,
  categories: RecommendedCategory[]
): string {
  const parts: string[] = [];
  if (filters.keywords.trim()) parts.push(filters.keywords.trim());
  for (const id of filters.categoryIds) {
    const name = categories.find((c) => c.id === id)?.name;
    if (name) parts.push(name);
  }
  return parts.join(" ").trim();
}

function tangbuyHitFromRow(
  row: Awaited<ReturnType<typeof fetchRecommendations>>[number]
): SourcingSearchHit {
  const id = row.candidateId;
  return {
    hitId: `tangbuy:${id}`,
    source: "tangbuy",
    title: row.title,
    imageUrl: row.imageUrl,
    imageUrls: row.imageUrls,
    costCny: row.price,
    currency: row.currency ?? "CNY",
    supplierShop: row.supplierShop,
    candidateId: id,
    goodsId: id,
    tangbuyUrl: row.tangbuyUrl,
    offerId1688: row.offerId1688,
    displayMultiplier: TANGBUY_DISPLAY_MULTIPLIER,
  };
}

function dedupeHits(hits: SourcingSearchHit[]): SourcingSearchHit[] {
  const seen = new Set<string>();
  const out: SourcingSearchHit[] = [];
  for (const hit of hits) {
    const key =
      hit.source === "1688"
        ? `1688:${hit.offerId1688 ?? hit.hitId}`
        : `tangbuy:${hit.candidateId ?? hit.hitId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function sortMergedHits(
  hits: SourcingSearchHit[],
  sort: CatalogFilterState["sort"],
  exchangeRate: number
): SourcingSearchHit[] {
  if (!sort || sort === "recommended") return hits;
  const copy = [...hits];
  if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? 1 : -1;
    copy.sort((a, b) => {
      const ua = a.costCny != null && exchangeRate > 0 ? a.costCny / exchangeRate : Number.POSITIVE_INFINITY;
      const ub = b.costCny != null && exchangeRate > 0 ? b.costCny / exchangeRate : Number.POSITIVE_INFINITY;
      return (ua - ub) * dir;
    });
  }
  return copy;
}

function filterUsdBand(
  hits: SourcingSearchHit[],
  exchangeRate: number,
  minUsd?: number | null,
  maxUsd?: number | null
): SourcingSearchHit[] {
  if (minUsd == null && maxUsd == null) return hits;
  return hits.filter((hit) => {
    const usd =
      hit.costCny != null && exchangeRate > 0 ? hit.costCny / exchangeRate : null;
    if (usd == null) return false;
    if (minUsd != null && usd < minUsd) return false;
    if (maxUsd != null && usd > maxUsd) return false;
    return true;
  });
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Unified Tangbuy mall + 1688 keyword search for the Discover tab.
 * 1688 uses keyword-assisted image search with the first Tangbuy hit image as seed.
 */
export async function searchSourcingHits(
  opts: SourcingSearchOptions
): Promise<SourcingSearchHit[]> {
  const {
    shopName,
    limit,
    offset,
    template,
    filters,
    categories = [],
    localeCountry = "en",
  } = opts;

  const sourceFilter: SourcingSourceFilter = filters.sourceFilter ?? "all";
  const keywords = buildKeywords(filters, categories);
  const fetchOpts: FetchRecommendationsOptions = {
    keywords,
    sort: filters.sort,
    priceMinUsd: parseOptionalNumber(filters.priceMinUsd),
    priceMaxUsd: parseOptionalNumber(filters.priceMaxUsd),
  };

  const tangbuyRows =
    sourceFilter === "1688"
      ? []
      : await fetchRecommendations(
          shopName,
          limit,
          offset,
          template,
          fetchOpts
        );

  const tangbuyHits = tangbuyRows.map(tangbuyHitFromRow);
  const seedImage =
    tangbuyHits.find((h) => h.imageUrl?.trim())?.imageUrl ??
    tangbuyRows.find((r) => r.imageUrl)?.imageUrl ??
    null;

  let merged: SourcingSearchHit[] = [...tangbuyHits];

  if (sourceFilter !== "tangbuy" && keywords) {
    const from1688 = await search1688OffersByKeyword(keywords, {
      seedImageUrl: seedImage,
      country: localeCountry,
      page: Math.floor(offset / limit) + 1,
      size: Math.min(limit, 20),
    });
    merged = [...merged, ...from1688];
  }

  merged = dedupeHits(merged);
  const rate = template.exchangeRate ?? 0;
  merged = filterUsdBand(
    merged,
    rate,
    fetchOpts.priceMinUsd,
    fetchOpts.priceMaxUsd
  );
  merged = sortMergedHits(merged, filters.sort, rate);

  return merged.map((hit, i) => ({
    ...hit,
    listIndex: offset + i + 1,
  }));
}
