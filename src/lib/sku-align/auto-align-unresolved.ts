import { enqueueSkuAlignRun } from "@/lib/sku-align-v1/run-client";
import {
  collectNeedsReviewVariantIds,
  countNeedsReview,
  countUnbound,
} from "@/lib/sku-align/display";
import { confirmSuggestionsWithFallback } from "@/lib/sku-align-v1";
import type { SkuProductOverview } from "@/lib/types";

/** Products that still have variant rows with no binding at all. */
export function productIdsNeedingVariantAlign(
  products: SkuProductOverview[]
): string[] {
  return products
    .filter((p) => countUnbound(p) > 0 || countNeedsReview(p) > 0)
    .map((p) => p.thirdPlatformItemId);
}

/** Silent batch align for unbound + needs_review variants; returns null when nothing to do. */
export async function autoAlignUnboundProducts(
  shopName: string,
  products: SkuProductOverview[]
) {
  const scopeIds = productIdsNeedingVariantAlign(products);
  if (scopeIds.length === 0) return null;
  return enqueueSkuAlignRun(shopName, {
    triggerType: "PAGE_ENTER",
    scopeType: "PRODUCT_BATCH",
    scopeIds,
  });
}

/**
 * 自动确认所有待确认（needs_review）的变体。
 * 高置信度（matchScore≥0.8）已在显示层视为 active_auto，
 * 此函数将后端 PENDING 状态提升为 ACTIVE，保持前后端一致。
 */
export async function autoConfirmPendingVariants(
  shopName: string,
  products: SkuProductOverview[]
) {
  const pendingVariantIds = collectNeedsReviewVariantIds(products);
  if (pendingVariantIds.length === 0) {
    return { confirmedCount: 0 };
  }
  const productIds = products.map((p) => p.thirdPlatformItemId);
  return confirmSuggestionsWithFallback(
    {
      shopName,
      targetScope: "PRODUCT",
      productIds,
    },
    pendingVariantIds
  );
}
