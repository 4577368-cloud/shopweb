import type { LogisticsMirrorCacheEntry } from "@/lib/logistics/logistics-mirror-cache";
import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

/** Session cache for logistics payload — survives step navigation within the same tab. */
const cache = new Map<string, { at: number; data: LogisticsMirrorCacheEntry }>();

export function peekLogisticsSession(
  shopName: string,
  now = Date.now()
): LogisticsMirrorCacheEntry | null {
  const entry = cache.get(shopName);
  if (!entry || now - entry.at >= WORKFLOW_MIRROR_TTL_MS) return null;
  return entry.data;
}

export function setLogisticsSession(
  shopName: string,
  data: Omit<LogisticsMirrorCacheEntry, "ts">
): void {
  cache.set(shopName, {
    at: Date.now(),
    data: { ...data, ts: Date.now() },
  });
}

export function clearLogisticsSession(shopName?: string): void {
  if (shopName) cache.delete(shopName);
  else cache.clear();
}
