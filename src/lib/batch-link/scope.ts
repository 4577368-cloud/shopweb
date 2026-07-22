import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

export const SHOP_PRODUCTS_PAGE_SIZE = 15;

/** Unbound mirror rows with a primary image. */
export function filterLinkableProducts(
  products: ShopMirrorProduct[],
  bindingsByItemId: Record<string, ImageBindingView>
): ShopMirrorProduct[] {
  return products.filter((p) => {
    const b = bindingsByItemId[p.thirdPlatformItemId];
    return !b?.bound && Boolean(p.primaryImageUrl?.trim());
  });
}

/** Unbound mirror rows with a primary image; new arrivals ordered first. */
export function buildBatchLinkScope(
  products: ShopMirrorProduct[],
  bindingsByItemId: Record<string, ImageBindingView>,
  pendingNewAnalysisIds: Set<string>
): ShopMirrorProduct[] {
  const unbound = products.filter((p) => {
    const b = bindingsByItemId[p.thirdPlatformItemId];
    return !b?.bound && Boolean(p.primaryImageUrl?.trim());
  });
  const newSet = pendingNewAnalysisIds;
  return [...unbound].sort((a, b) => {
    const aNew = newSet.has(a.thirdPlatformItemId) ? 0 : 1;
    const bNew = newSet.has(b.thirdPlatformItemId) ? 0 : 1;
    if (aNew !== bNew) return aNew - bNew;
    return (a.title ?? a.thirdPlatformItemId).localeCompare(
      b.title ?? b.thirdPlatformItemId
    );
  });
}

export function batchLinkScopeIds(scope: ShopMirrorProduct[]): string[] {
  return scope.map((p) => p.thirdPlatformItemId);
}
