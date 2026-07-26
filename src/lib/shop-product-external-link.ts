import {
  peekMirrorCache,
  productsMirrorShopKey,
} from "@/lib/products/mirror-cache";

/** Numeric id from Shopify GID or plain id string. */
export function parseShopifyProductNumericId(gidOrId: string): string | null {
  const trimmed = gidOrId.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const slash = trimmed.lastIndexOf("/");
  if (slash >= 0) {
    const tail = trimmed.slice(slash + 1);
    if (/^\d+$/.test(tail)) return tail;
  }
  return null;
}

function normalizeShopHost(shopDomain?: string | null): string | null {
  const raw = shopDomain?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

/** Shopify Admin product page (works with myshopify.com domain). */
export function shopifyProductAdminUrl(
  thirdPlatformItemId: string,
  shopDomain?: string | null
): string | null {
  const numericId = parseShopifyProductNumericId(thirdPlatformItemId);
  if (!numericId) return null;
  const host = normalizeShopHost(shopDomain);
  if (!host) return null;
  const store = host.match(/^([a-z0-9-]+)\.myshopify\.com$/)?.[1];
  if (store) {
    return `https://admin.shopify.com/store/${store}/products/${numericId}`;
  }
  return `https://${host}/admin/products/${numericId}`;
}

/** Public storefront URL when product handle is known. */
export function shopifyProductStorefrontUrl(
  handle: string,
  shopDomain?: string | null
): string | null {
  const h = handle.trim();
  if (!h) return null;
  const host = normalizeShopHost(shopDomain);
  if (!host) return null;
  return `https://${host}/products/${encodeURIComponent(h)}`;
}

export function resolveShopListingProductUrl(params: {
  thirdPlatformItemId: string;
  shopDomain?: string | null;
  handle?: string | null;
  shopMirrorKey?: string | null;
}): string | null {
  let handle = params.handle?.trim() || null;
  if (!handle && params.shopMirrorKey) {
    handle = findShopProductHandle(
      params.shopMirrorKey,
      params.thirdPlatformItemId
    );
  }
  if (handle) {
    const storefront = shopifyProductStorefrontUrl(handle, params.shopDomain);
    if (storefront) return storefront;
  }
  return shopifyProductAdminUrl(params.thirdPlatformItemId, params.shopDomain);
}

export function findShopProductHandle(
  shopMirrorKey: string,
  thirdPlatformItemId: string
): string | null {
  const entry = peekMirrorCache(shopMirrorKey);
  const item = entry?.items.find(
    (p) => p.thirdPlatformItemId === thirdPlatformItemId
  );
  return item?.handle?.trim() || null;
}

/** Stable mirror key from shop API name + optional myshopify domain. */
export function shopMirrorKeyForLink(
  shopName: string,
  shopDomain?: string | null
): string {
  return productsMirrorShopKey(shopName, shopDomain);
}
