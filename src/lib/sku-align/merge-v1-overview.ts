import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import type { SkuProductOverview, SkuVariant, SkuVariantBinding } from "@/lib/types";

/** Bridge V1 alignment rows into legacy overview variants for list/workbench counts. */
export function mergeV1DetailIntoProductOverview(
  product: SkuProductOverview,
  detail: SkuAlignProductDetail | null | undefined
): SkuProductOverview {
  if (!detail?.variants?.length) return product;

  const rowBySku = new Map(detail.variants.map((row) => [row.thirdPlatformSkuId, row]));

  const variants: SkuVariant[] = product.variants.map((variant) => {
    if (variant.bound?.tangbuySkuId?.trim()) return variant;

    const row = rowBySku.get(variant.thirdPlatformSkuId);
    const current = row?.currentBinding;
    if (!row || !current?.offerSkuId?.trim()) return variant;
    if (row.reviewState === "UNMAPPED" || row.reviewState === "NO_SOURCE") {
      return variant;
    }

    const bound: SkuVariantBinding = {
      tangbuyProductId: current.offerId ?? null,
      tangbuySkuId: current.offerSkuId,
      bindStatus: row.reviewState === "SUGGESTED" ? "PENDING" : "ACTIVE",
      matchSource: current.matchSource ?? "RULE",
    };
    return { ...variant, bound };
  });

  return { ...product, variants };
}
