import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import { isAlreadySourcedProduct } from "@/lib/batch-link/publish-source";

/** Catalog facet above binding-status chips（全部 / 已关联 / 已上架）. */
export type CatalogScope = "all" | "linked" | "listed";

/**
 * 选品上架：经 Tangbuy 商城 / 榜单图搜等路径发布到 Shopify 的商品
 *（bindSource=FROM_PUBLISH 或本地上架标记），不是 Shopify 在售状态。
 */
export function isTangbuyListedProduct(
  binding: ImageBindingView | undefined | null,
  shopName: string | undefined,
  thirdPlatformItemId: string
): boolean {
  return isAlreadySourcedProduct(binding, shopName, thirdPlatformItemId);
}

/**
 * 店铺关联：Shopify 先有商品，再通过图搜 / 手动把 Tangbuy 货源绑上。
 * 不含「选品上架」路径的商品。
 */
export function isShopifyLinkedProduct(
  binding: ImageBindingView | undefined | null,
  shopName: string | undefined,
  thirdPlatformItemId: string
): boolean {
  if (!binding?.bound) return false;
  if (isTangbuyListedProduct(binding, shopName, thirdPlatformItemId)) return false;
  return true;
}

export function countCatalogScopes(
  products: ShopMirrorProduct[],
  bindings: Record<string, ImageBindingView>,
  shopName?: string
): { all: number; linked: number; listed: number } {
  let linked = 0;
  let listed = 0;
  for (const p of products) {
    const id = p.thirdPlatformItemId;
    const b = bindings[id];
    if (isTangbuyListedProduct(b, shopName, id)) listed += 1;
    else if (isShopifyLinkedProduct(b, shopName, id)) linked += 1;
  }
  return { all: products.length, linked, listed };
}
