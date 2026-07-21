import { enqueueSkuAlignRun } from "@/lib/sku-align-v1/run-client";
import { countUnbound } from "@/lib/sku-align/display";
import type { SkuProductOverview } from "@/lib/types";

/** Products that still have variant rows with no binding at all. */
export function productIdsNeedingVariantAlign(
  products: SkuProductOverview[]
): string[] {
  return products
    .filter((p) => countUnbound(p) > 0)
    .map((p) => p.thirdPlatformItemId);
}

/** Silent batch align for unbound variants; returns null when nothing to do. */
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
