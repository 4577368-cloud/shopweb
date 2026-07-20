import { api } from "@/lib/api";
import { calculateSalePrice } from "@/lib/price-calculator";
import type { CatalogRecommendation, PricingTemplate } from "@/lib/types";
import {
  fetchMallPage,
  isMallGatewayConfigured,
  toCatalogRecommendation,
} from "@/lib/tangbuy-mall-gateway";

/** List recommendations — browser gateway when configured, else backend proxy. */
export async function fetchRecommendations(
  shopName: string,
  limit: number,
  offset: number,
  template?: PricingTemplate | null
): Promise<CatalogRecommendation[]> {
  if (!isMallGatewayConfigured()) {
    return api.getRecommendations(shopName, limit, offset);
  }

  const tpl = template ?? (await api.getPricingTemplate(shopName));
  const pageNum = Math.floor(offset / limit) + 1;
  const { rows } = await fetchMallPage(pageNum, limit);
  const skip = offset % limit;
  const slice = skip > 0 ? rows.slice(skip) : rows;

  const out: CatalogRecommendation[] = [];
  for (const row of slice) {
    const item = toCatalogRecommendation(row, tpl);
    if (item) out.push(item);
  }
  return out;
}

/** Re-apply pricing template to items already loaded in the browser. */
export function repriceRecommendations(
  items: CatalogRecommendation[],
  template: PricingTemplate
): CatalogRecommendation[] {
  return items.map((item) => ({
    ...item,
    estimatedSalePrice: calculateSalePrice(item.price, template),
    targetCurrency: template.targetCurrency,
  }));
}

/** Total catalog count for pagination badges. */
export async function fetchRecommendationsCount(): Promise<number> {
  if (!isMallGatewayConfigured()) {
    const { count } = await api.getRecommendationsCount();
    return count;
  }
  const { total } = await fetchMallPage(1, 1);
  return total;
}
