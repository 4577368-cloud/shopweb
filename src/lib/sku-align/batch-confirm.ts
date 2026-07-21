import { confirmSuggestionsWithFallback } from "@/lib/sku-align-v1";
import type { SkuProductOverview } from "@/lib/types";
import {
  collectNeedsReviewVariantIds,
  countNeedsReviewInProducts,
} from "@/lib/sku-align/display";

/** Promote every needs_review variant in the shop (V1 PAGE scope + legacy ack fallback). */
export async function confirmAllNeedsReview(
  shopName: string,
  products: SkuProductOverview[]
) {
  const legacyPendingVariantIds = collectNeedsReviewVariantIds(products);
  return confirmSuggestionsWithFallback(
    { shopName, targetScope: "PAGE" },
    legacyPendingVariantIds
  );
}

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
  return confirmSuggestionsWithFallback(
    {
      shopName,
      targetScope: "PRODUCT",
      productIds,
    },
    legacyPendingVariantIds
  );
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
  return confirmSuggestionsWithFallback(
    {
      shopName,
      targetScope: "PRODUCT",
      productIds: [product.thirdPlatformItemId],
    },
    legacyPendingVariantIds
  );
}

export { countNeedsReviewInProducts };
