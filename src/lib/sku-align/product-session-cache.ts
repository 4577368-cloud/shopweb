import type { SkuProductOverview } from "@/lib/types";

/** Session cache for a single SKU workbench product — survives tab/deep-link remounts. */
const cache = new Map<string, { at: number; product: SkuProductOverview }>();
const TTL_MS = 5 * 60 * 1000;

function key(shop: string, productId: string): string {
  return `${shop}::${productId}`;
}

export function peekSkuProductSession(
  shop: string,
  productId: string,
  now = Date.now()
): SkuProductOverview | null {
  const entry = cache.get(key(shop, productId));
  if (!entry || now - entry.at >= TTL_MS) return null;
  return entry.product;
}

export function setSkuProductSession(
  shop: string,
  product: SkuProductOverview
): void {
  cache.set(key(shop, product.thirdPlatformItemId), {
    at: Date.now(),
    product,
  });
}

export function clearSkuProductSession(shop: string, productId: string): void {
  cache.delete(key(shop, productId));
}
