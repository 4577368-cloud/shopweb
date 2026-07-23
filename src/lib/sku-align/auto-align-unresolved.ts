import { enqueueSkuAlignRun } from "@/lib/sku-align-v1/run-client";
import {
  collectAutoConfirmVariantIds,
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
 * 自动确认高置信度变体（显示层 active_auto、后端仍为 PENDING）。
 * 中低置信 needs_review 项保留人工确认，不在此自动提升。
 */
export async function autoConfirmPendingVariants(
  shopName: string,
  products: SkuProductOverview[]
) {
  const pendingVariantIds = collectAutoConfirmVariantIds(products);
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
