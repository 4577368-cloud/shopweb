import { api } from "@/lib/api";

/**
 * Module-level mirror cache for the logistics page's load payload.
 *
 * The logistics analysis / templates / pricing-template are locale-agnostic
 * (only UI copy is localized), so they can be reused across language switches.
 * Without this, switching locale remounts the page and re-fetches the gateway
 * even though C-core already keeps the global onboarding state alive.
 *
 * Keyed by shopName. Entries expire after TTL_MS; a stale entry forces a real
 * fetch on next mount.
 */
export type LogisticsMirrorAnalysis = Awaited<ReturnType<typeof api.analyzeLogistics>>;
export type LogisticsMirrorTemplates = Awaited<ReturnType<typeof api.listLogisticsTemplates>>;
export type LogisticsMirrorPricing = Awaited<ReturnType<typeof api.getPricingTemplate>>;

export interface LogisticsMirrorCacheEntry {
  analysis: LogisticsMirrorAnalysis | null;
  templates: LogisticsMirrorTemplates;
  pricingTemplate: LogisticsMirrorPricing | null;
  ts: number;
}

const cache = new Map<string, LogisticsMirrorCacheEntry>();
const TTL_MS = 120_000;

export function getLogisticsMirrorCache(
  shopName: string
): LogisticsMirrorCacheEntry | undefined {
  return cache.get(shopName);
}

export function setLogisticsMirrorCache(
  shopName: string,
  data: Omit<LogisticsMirrorCacheEntry, "ts">
): void {
  cache.set(shopName, { ...data, ts: Date.now() });
}

export function isLogisticsMirrorCacheFresh(
  shopName: string,
  now: number = Date.now()
): boolean {
  const entry = cache.get(shopName);
  if (!entry) return false;
  return now - entry.ts < TTL_MS;
}
