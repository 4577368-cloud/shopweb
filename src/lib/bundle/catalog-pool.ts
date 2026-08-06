import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

/**
 * Normalize Shopify product / variant ids so GID and numeric forms match.
 * Backend campaign pools persist numeric ids; catalog often uses gid://…
 */
export function numericShopifyId(
  gidOrId: string | number | null | undefined
): string {
  if (gidOrId == null) return "";
  const raw = String(gidOrId).trim();
  if (!raw) return "";
  const slash = raw.lastIndexOf("/");
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

export function sameShopifyProductId(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean {
  const na = numericShopifyId(a);
  const nb = numericShopifyId(b);
  return Boolean(na) && na === nb;
}

/** Map a saved pool id onto the catalog's thirdPlatformItemId when present. */
export function resolveCatalogProductId(
  savedId: string | number | null | undefined,
  catalog: ShopMirrorProduct[]
): string | null {
  const want = numericShopifyId(savedId);
  if (!want) return null;
  const hit = catalog.find((p) =>
    sameShopifyProductId(p.thirdPlatformItemId, want)
  );
  return hit?.thirdPlatformItemId ?? want;
}

export function normalizePoolProductIds(
  ids: Array<string | number | null | undefined> | null | undefined,
  catalog?: ShopMirrorProduct[]
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids ?? []) {
    const id = catalog
      ? resolveCatalogProductId(raw, catalog)
      : numericShopifyId(raw) || null;
    if (!id) continue;
    const key = numericShopifyId(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function poolHasProductId(
  pool: Iterable<string>,
  productId: string
): boolean {
  for (const id of pool) {
    if (sameShopifyProductId(id, productId)) return true;
  }
  return false;
}

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
