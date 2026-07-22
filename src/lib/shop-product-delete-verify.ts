import type { ShopProductDetail } from "@/lib/types";
import { resolveShopMediaId } from "@/lib/shop-product-media";

export interface ShopProductDeleteVerifyResult {
  ok: boolean;
  /** Variants still present after save — backend may have ignored delete. */
  lingeringVariantIds: string[];
  /** Gallery media still present after save. */
  lingeringMediaIds: string[];
}

/**
 * After PUT /api/plugin/product/detail, check whether deletions took effect
 * in the refreshed mirror response.
 */
export function verifyShopProductDeletions(
  saved: ShopProductDetail,
  deletedVariantIds: string[],
  deletedMediaIds: string[]
): ShopProductDeleteVerifyResult {
  const variantSet = new Set(
    (saved.variants ?? []).map((v) => v.thirdPlatformSkuId)
  );
  const mediaSet = new Set(
    (saved.media ?? []).map((m) => resolveShopMediaId(m))
  );

  const lingeringVariantIds = deletedVariantIds.filter((id) => variantSet.has(id));
  const lingeringMediaIds = deletedMediaIds.filter((id) => mediaSet.has(id));

  return {
    ok: lingeringVariantIds.length === 0 && lingeringMediaIds.length === 0,
    lingeringVariantIds,
    lingeringMediaIds,
  };
}

export function formatShopProductDeleteVerifyMessage(
  result: ShopProductDeleteVerifyResult
): string | null {
  if (result.ok) return null;
  const parts: string[] = [];
  if (result.lingeringVariantIds.length > 0) {
    parts.push(`${result.lingeringVariantIds.length} 个变体仍在镜像中`);
  }
  if (result.lingeringMediaIds.length > 0) {
    parts.push(`${result.lingeringMediaIds.length} 张图片仍在镜像中`);
  }
  return `保存成功，但部分删除未在 Shopify 生效（${parts.join("，")}）。请刷新后重试，或在 Shopify 后台确认。`;
}
