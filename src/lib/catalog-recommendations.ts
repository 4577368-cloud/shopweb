import { api } from "@/lib/api";
import { listingSalePrice, resolveListingPricingContext } from "@/lib/listing-pricing";
import type { CatalogSort } from "@/lib/catalog-sourcing-types";
import type { CatalogRecommendation, PricingTemplate } from "@/lib/types";
import {
  fetchMallPage,
  isMallGatewayConfigured,
  toCatalogRecommendation,
} from "@/lib/tangbuy-mall-gateway";

export interface FetchRecommendationsOptions {
  keywords?: string;
  sort?: CatalogSort;
  /** Client-side USD purchase-price band (after FX via template.exchangeRate). */
  priceMinUsd?: number | null;
  priceMaxUsd?: number | null;
}

function costToUsd(
  cost: number | null | undefined,
  exchangeRate: number
): number | null {
  if (cost == null || !Number.isFinite(cost) || exchangeRate <= 0) return null;
  return cost / exchangeRate;
}

function sortItems(
  items: CatalogRecommendation[],
  sort: CatalogSort | undefined,
  exchangeRate: number
): CatalogRecommendation[] {
  if (!sort || sort === "recommended") return items;
  const copy = [...items];
  if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? 1 : -1;
    copy.sort((a, b) => {
      const ua = costToUsd(a.price, exchangeRate) ?? Number.POSITIVE_INFINITY;
      const ub = costToUsd(b.price, exchangeRate) ?? Number.POSITIVE_INFINITY;
      return (ua - ub) * dir;
    });
  }
  // "newest" — list API order is already roughly recency; keep as-is.
  return copy;
}

function filterByUsdBand(
  items: CatalogRecommendation[],
  exchangeRate: number,
  minUsd?: number | null,
  maxUsd?: number | null
): CatalogRecommendation[] {
  if (minUsd == null && maxUsd == null) return items;
  return items.filter((item) => {
    const usd = costToUsd(item.price, exchangeRate);
    if (usd == null) return false;
    if (minUsd != null && usd < minUsd) return false;
    if (maxUsd != null && usd > maxUsd) return false;
    return true;
  });
}

/** List recommendations — browser gateway when configured, else backend proxy. */
export async function fetchRecommendations(
  shopName: string,
  limit: number,
  offset: number,
  template?: PricingTemplate | null,
  options?: FetchRecommendationsOptions
): Promise<CatalogRecommendation[]> {
  const keywords = options?.keywords?.trim() ?? "";

  if (!isMallGatewayConfigured()) {
    // Backend proxy has no keyword param yet — fetch page then client-filter/sort.
    const items = await api.getRecommendations(shopName, limit, offset);
    const tpl = template ?? (await api.getPricingTemplate(shopName));
    return applyClientTransforms(items, tpl, options);
  }

  const tpl = template ?? (await api.getPricingTemplate(shopName));
  const pageNum = Math.floor(offset / limit) + 1;
  const { rows } = await fetchMallPage(pageNum, limit, keywords);
  const skip = offset % limit;
  const slice = skip > 0 ? rows.slice(skip) : rows;

  const out: CatalogRecommendation[] = [];
  for (const row of slice) {
    const item = toCatalogRecommendation(row, tpl);
    if (item) out.push(item);
  }
  return applyClientTransforms(out, tpl, options);
}

function applyClientTransforms(
  items: CatalogRecommendation[],
  template: PricingTemplate,
  options?: FetchRecommendationsOptions
): CatalogRecommendation[] {
  const rate = template.exchangeRate ?? 0;
  let next = filterByUsdBand(
    items,
    rate,
    options?.priceMinUsd,
    options?.priceMaxUsd
  );
  next = sortItems(next, options?.sort, rate);
  return next;
}

/** Re-apply pricing template to items already loaded in the browser. */
export function repriceRecommendations(
  items: CatalogRecommendation[],
  template: PricingTemplate
): CatalogRecommendation[] {
  const ctx = resolveListingPricingContext(template);
  if (!ctx) return items;
  return items.map((item) => ({
    ...item,
    estimatedSalePrice: listingSalePrice(item.price, ctx),
    targetCurrency: ctx.targetCurrency,
  }));
}

/** @deprecated Use listingPurchaseCostDisplay from @/lib/listing-pricing */
export function toPurchasePriceUsd(
  cost: number | null | undefined,
  exchangeRate: number
): number | null {
  const usd = costToUsd(cost, exchangeRate);
  if (usd == null) return null;
  return Math.round((usd + Number.EPSILON) * 100) / 100;
}

/** Total catalog count for pagination badges. */
export async function fetchRecommendationsCount(
  keywords = ""
): Promise<number> {
  if (!isMallGatewayConfigured()) {
    const { count } = await api.getRecommendationsCount();
    return count;
  }
  const { total } = await fetchMallPage(1, 1, keywords);
  return total;
}
