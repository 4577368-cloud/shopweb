import { api } from "@/lib/api";
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
