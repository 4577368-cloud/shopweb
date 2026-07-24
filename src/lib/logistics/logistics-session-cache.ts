import type { LogisticsMirrorCacheEntry } from "@/lib/logistics/logistics-mirror-cache";
import {
  clearLogisticsMirrorCache,
  getLogisticsMirrorCache,
  peekLogisticsMirrorCache,
  setLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

/** Session alias for logistics payload — backed by mirror cache + sessionStorage. */
export function peekLogisticsSession(
  shopName: string,
  now = Date.now()
): LogisticsMirrorCacheEntry | null {
  const entry = getLogisticsMirrorCache(shopName);
  if (!entry?.analysis || now - entry.ts >= WORKFLOW_MIRROR_TTL_MS) return null;
  return entry;
}

/** Hydrate UI even when TTL expired (stale-while-revalidate). */
export function peekLogisticsSessionHydrate(
  shopName: string
): LogisticsMirrorCacheEntry | null {
  return peekLogisticsMirrorCache(shopName) ?? null;
}

export function setLogisticsSession(
  shopName: string,
  data: Omit<LogisticsMirrorCacheEntry, "ts">
): void {
  setLogisticsMirrorCache(shopName, data);
}

export function clearLogisticsSession(shopName?: string): void {
  clearLogisticsMirrorCache(shopName);
}
