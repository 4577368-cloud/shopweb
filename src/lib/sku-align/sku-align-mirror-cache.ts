import { api } from "@/lib/api";

/**
 * Module-level mirror cache for the sku-align list page's load payload.
 *
 * The SKU overview + pricing template are locale-agnostic (only UI copy is
 * localized), so they can be reused across language switches. C-core keeps the
 * global onboarding state alive on switch, but the page still re-fetches on
 * remount without this cache.
 *
 * Keyed by shopName. Entries expire after TTL_MS.
 */
export type SkuAlignMirrorOverview = Awaited<ReturnType<typeof api.getSkuOverview>>;
export type SkuAlignMirrorPricing = Awaited<ReturnType<typeof api.getPricingTemplate>>;

export interface SkuAlignMirrorCacheEntry {
  overview: SkuAlignMirrorOverview;
  pricingTemplate: SkuAlignMirrorPricing | null;
  ts: number;
}

const cache = new Map<string, SkuAlignMirrorCacheEntry>();
const TTL_MS = 120_000;

export function getSkuAlignMirrorCache(
  shopName: string
): SkuAlignMirrorCacheEntry | undefined {
  return cache.get(shopName);
}

export function setSkuAlignMirrorCache(
  shopName: string,
  data: Omit<SkuAlignMirrorCacheEntry, "ts">
): void {
  cache.set(shopName, { ...data, ts: Date.now() });
}

export function isSkuAlignMirrorCacheFresh(
  shopName: string,
  now: number = Date.now()
): boolean {
  const entry = cache.get(shopName);
  if (!entry) return false;
  return now - entry.ts < TTL_MS;
}
