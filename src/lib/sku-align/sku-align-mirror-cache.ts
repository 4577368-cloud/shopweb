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
import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

export type SkuAlignMirrorOverview = Awaited<ReturnType<typeof api.getSkuOverview>>;
export type SkuAlignMirrorPricing = Awaited<ReturnType<typeof api.getPricingTemplate>>;

export interface SkuAlignMirrorCacheEntry {
  overview: SkuAlignMirrorOverview;
  pricingTemplate: SkuAlignMirrorPricing | null;
  ts: number;
}

const cache = new Map<string, SkuAlignMirrorCacheEntry>();

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
  if (now - entry.ts >= WORKFLOW_MIRROR_TTL_MS) return false;
  // Ignore empty snapshots (e.g. prefetch before bindings are ready).
  return entry.overview.length > 0;
}

export function clearSkuAlignMirrorCache(shopName?: string): void {
  if (shopName) cache.delete(shopName);
  else cache.clear();
}
