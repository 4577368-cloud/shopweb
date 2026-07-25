import { confirmSuggestionsWithFallback } from "@/lib/sku-align-v1";
import type { SkuProductOverview } from "@/lib/types";
import {
  collectNeedsReviewVariantIds,
  countNeedsReviewInProducts,
} from "@/lib/sku-align/display";
import { warmLogisticsSourceFromProducts } from "@/lib/sku-align/warm-logistics-source";

/** Promote needs_review variants visible on the current workbench page. */
export async function confirmPageNeedsReview(
  shopName: string,
  visibleProducts: SkuProductOverview[]
) {
  const productIds = visibleProducts.map((p) => p.thirdPlatformItemId);
  const legacyPendingVariantIds = collectNeedsReviewVariantIds(visibleProducts);
  if (legacyPendingVariantIds.length === 0) {
    return { confirmedCount: 0 };
  }
  const result = await confirmSuggestionsWithFallback(
    {
      shopName,
      targetScope: "PRODUCT",
      productIds,
    },
    legacyPendingVariantIds
  );
  warmLogisticsSourceFromProducts(shopName, visibleProducts);
  return result;
}

/** Promote needs_review variants for one product card. */
export async function confirmProductNeedsReview(
  shopName: string,
  product: SkuProductOverview
) {
  const legacyPendingVariantIds = collectNeedsReviewVariantIds([product]);
  if (legacyPendingVariantIds.length === 0) {
    return { confirmedCount: 0 };
  }
  const result = await confirmSuggestionsWithFallback(
    {
      shopName,
      targetScope: "PRODUCT",
      productIds: [product.thirdPlatformItemId],
    },
    legacyPendingVariantIds
  );
  warmLogisticsSourceFromProducts(shopName, [product]);
  return result;
}

export { countNeedsReviewInProducts };
