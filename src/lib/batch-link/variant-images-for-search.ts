import { api } from "@/lib/api";
import { MULTI_IMAGE_SEARCH_ENABLED } from "@/lib/batch-link/image-search-flags";
import type { SkuVariant } from "@/lib/types";

export type VariantImageSearchInput = Pick<
  SkuVariant,
  "imageUrl" | "price" | "thirdPlatformSkuId"
>;

/** Mirror variants for representative SKU image search (fail-open). */
export async function loadVariantImagesForImageSearch(
  shopName: string,
  thirdPlatformItemId: string
): Promise<VariantImageSearchInput[] | undefined> {
  // Skip the extra detail round-trip while multi-image search is off.
  if (!MULTI_IMAGE_SEARCH_ENABLED) return undefined;
  try {
    const detail = await api.getShopProductDetail(shopName, thirdPlatformItemId);
    const rows = detail.variants ?? [];
    if (!rows.length) return undefined;
    return rows.map((s) => ({
      imageUrl: s.imageUrl,
      price: s.priceLocal ?? s.price,
      thirdPlatformSkuId: s.thirdPlatformSkuId,
    }));
  } catch {
    return undefined;
  }
}
