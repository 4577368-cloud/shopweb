import type { ShopMirrorProduct, ImageBindingView } from "@/lib/types";

/**
 * Module-level cache for the shop product mirror list.
 *
 * The list data is locale-agnostic (the gateway returns product/binding data;
 * only UI copy is localized), so it can be safely reused across language
 * switches. Without this, switching locale remounts the whole page and
 * re-fetches the gateway — the main cause of the slow language switch.
 *
 * Keyed by shopName. Entries expire after TTL_MS; a stale entry forces a real
 * fetch on next mount.
 */
export interface MirrorCacheEntry {
  items: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  ts: number;
}

const cache = new Map<string, MirrorCacheEntry>();
const TTL_MS = 120_000;

export function getMirrorCache(shopName: string): MirrorCacheEntry | undefined {
  return cache.get(shopName);
}

export function setMirrorCache(
  shopName: string,
  data: { items: ShopMirrorProduct[]; bindings: Record<string, ImageBindingView> }
): void {
  cache.set(shopName, { ...data, ts: Date.now() });
}

export function isMirrorCacheFresh(shopName: string, now: number = Date.now()): boolean {
  const entry = cache.get(shopName);
  if (!entry) return false;
  return now - entry.ts < TTL_MS;
}

export function clearMirrorCache(shopName?: string): void {
  if (shopName) cache.delete(shopName);
  else cache.clear();
}
