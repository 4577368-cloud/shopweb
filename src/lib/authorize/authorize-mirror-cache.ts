/**
 * Module-level mirror cache for the authorize page's loadStats payload.
 *
 * bound-count / published-count are locale-agnostic (gateway data), so they
 * can be reused across language switches. C-core keeps the global onboarding
 * state alive on switch, but the authorize page re-runs loadStats on remount
 * without this cache.
 *
 * Keyed by shopName. Entries expire after TTL_MS.
 */
export interface AuthorizeMirrorCacheEntry {
  boundCount: number | null;
  publishedCount: number | null;
  ts: number;
}

const cache = new Map<string, AuthorizeMirrorCacheEntry>();
const TTL_MS = 120_000;

export function getAuthorizeMirrorCache(
  shopName: string
): AuthorizeMirrorCacheEntry | undefined {
  return cache.get(shopName);
}

export function setAuthorizeMirrorCache(
  shopName: string,
  data: Omit<AuthorizeMirrorCacheEntry, "ts">
): void {
  cache.set(shopName, { ...data, ts: Date.now() });
}

export function isAuthorizeMirrorCacheFresh(
  shopName: string,
  now: number = Date.now()
): boolean {
  const entry = cache.get(shopName);
  if (!entry) return false;
  return now - entry.ts < TTL_MS;
}
