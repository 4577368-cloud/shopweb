import { pricingLinesForHit } from "@/lib/sourcing/display-pricing";
import type { SourcingSearchHit } from "@/lib/sourcing/types";
import type { CatalogRecommendation, PricingTemplate } from "@/lib/types";

/** Map unified hit → legacy catalog grid row. */
export function hitToCatalogRecommendation(
  hit: SourcingSearchHit,
  template: PricingTemplate | null | undefined
): CatalogRecommendation {
  const { displayPrice, targetCurrency } = pricingLinesForHit(hit, template);
  const candidateId =
    hit.candidateId?.trim() ||
    hit.goodsId?.trim() ||
    (hit.source === "1688" && hit.offerId1688
      ? `outer:${hit.offerId1688}`
      : hit.hitId);

  return {
    candidateId,
    title: hit.title,
    imageUrl: hit.imageUrl,
    imageUrls: hit.imageUrls,
    price: hit.costCny,
    currency: hit.currency ?? "CNY",
    estimatedSalePrice: displayPrice,
    targetCurrency,
    supplierShop: hit.supplierShop,
    offerId1688: hit.offerId1688,
    tangbuyUrl: hit.source === "tangbuy" ? hit.tangbuyUrl ?? undefined : undefined,
    upstreamPlatform: hit.source === "1688" ? "alibaba:OUTER" : "tangbuy:SHOP",
  };
}

export function hitsToCatalogRecommendations(
  hits: SourcingSearchHit[],
  template: PricingTemplate | null | undefined
): CatalogRecommendation[] {
  return hits.map((h) => hitToCatalogRecommendation(h, template));
}
