import type { ShopMirrorProduct } from "@/lib/types";

export type NewArrivalReadinessPartition = {
  readyIds: string[];
  deferredIds: string[];
};

/** Mirror rows need a primary image and at least one variant before auto-confirm can succeed. */
export function partitionNewArrivalReadiness(
  itemIds: string[],
  productsByItemId: Record<string, ShopMirrorProduct | undefined>,
  variantReadyIds?: Set<string>
): NewArrivalReadinessPartition {
  const readyIds: string[] = [];
  const deferredIds: string[] = [];
  for (const id of itemIds) {
    const product = productsByItemId[id];
    const hasImage = Boolean(product?.primaryImageUrl?.trim());
    const hasVariant = variantReadyIds ? variantReadyIds.has(id) : true;
    if (hasImage && hasVariant) readyIds.push(id);
    else deferredIds.push(id);
  }
  return { readyIds, deferredIds };
}

export function indexMirrorProducts(
  products: ShopMirrorProduct[]
): Record<string, ShopMirrorProduct> {
  const map: Record<string, ShopMirrorProduct> = {};
  for (const p of products) {
    if (p.thirdPlatformItemId) map[p.thirdPlatformItemId] = p;
  }
  return map;
}
