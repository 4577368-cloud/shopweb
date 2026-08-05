/** Client-side recency for shop products after catalog publish / mall→shop link. */

const ACTIVITY_PREFIX = "tangbuy.shop-product-activity:v1:";

function storageKey(shopName: string): string {
  return `${ACTIVITY_PREFIX}${shopName.trim()}`;
}

export function readShopProductActivity(
  shopName: string
): Record<string, number> {
  if (typeof window === "undefined" || !shopName.trim()) return {};
  try {
    const raw = localStorage.getItem(storageKey(shopName));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === "number" && Number.isFinite(ts) && id.trim()) {
        out[id.trim()] = ts;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Bump a shop product so it sorts to the top of the Shopify products list. */
export function touchShopProductActivity(
  shopName: string,
  thirdPlatformItemId: string,
  at = Date.now()
): void {
  if (
    typeof window === "undefined" ||
    !shopName.trim() ||
    !thirdPlatformItemId.trim()
  ) {
    return;
  }
  const map = readShopProductActivity(shopName);
  map[thirdPlatformItemId.trim()] = at;
  try {
    localStorage.setItem(storageKey(shopName), JSON.stringify(map));
    window.dispatchEvent(
      new CustomEvent("shop-product-activity-updated", {
        detail: {
          shopName: shopName.trim(),
          thirdPlatformItemId: thirdPlatformItemId.trim(),
          at,
        },
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function shopProductActivityScore(
  activity: Record<string, number>,
  thirdPlatformItemId: string,
  resolvedAt?: string | null
): number {
  const touched = activity[thirdPlatformItemId.trim()] ?? 0;
  const resolved = resolvedAt ? Date.parse(resolvedAt) : 0;
  return Math.max(touched, Number.isFinite(resolved) ? resolved : 0);
}
