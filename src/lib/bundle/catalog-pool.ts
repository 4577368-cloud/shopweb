import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

/** ACTIVE source binding — required before a product can enter any bundle pool. */
export function isBindingReady(
  bindings: Record<string, ImageBindingView>,
  productId: string
): boolean {
  const b = bindings[productId];
  if (!b?.bound || !b.tangbuyProductId) return false;
  return b.bindStatus == null || b.bindStatus === "ACTIVE";
}

/**
 * Bound products first (easier to find when paging), then title.
 * Optional `rankExtra` returns a lower number for higher priority within the same bind band.
 */
export function sortCatalogByBinding(
  products: ShopMirrorProduct[],
  bindings: Record<string, ImageBindingView>,
  rankExtra?: (p: ShopMirrorProduct) => number
): ShopMirrorProduct[] {
  return [...products].sort((a, b) => {
    const aReady = isBindingReady(bindings, a.thirdPlatformItemId) ? 0 : 1;
    const bReady = isBindingReady(bindings, b.thirdPlatformItemId) ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    const aExtra = rankExtra?.(a) ?? 0;
    const bExtra = rankExtra?.(b) ?? 0;
    if (aExtra !== bExtra) return aExtra - bExtra;
    return (a.title || "").localeCompare(b.title || "", undefined, {
      sensitivity: "base",
    });
  });
}

export function boundProductIds(
  products: ShopMirrorProduct[],
  bindings: Record<string, ImageBindingView>
): string[] {
  return products
    .filter((p) => isBindingReady(bindings, p.thirdPlatformItemId))
    .map((p) => p.thirdPlatformItemId);
}
