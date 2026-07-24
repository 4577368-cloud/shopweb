import type { SkuProductOverview } from "@/lib/types";

import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

/** Session cache for SKU overview — survives step navigation within the same tab. */
const cache = new Map<string, { at: number; data: SkuProductOverview[] }>();

export function peekSkuOverviewSession(
  shopName: string,
  now = Date.now()
): SkuProductOverview[] | null {
  const entry = cache.get(shopName);
  if (!entry || now - entry.at >= WORKFLOW_MIRROR_TTL_MS) return null;
  return entry.data;
}

export function setSkuOverviewSession(
  shopName: string,
  data: SkuProductOverview[]
): void {
  cache.set(shopName, { at: Date.now(), data });
}

export function clearSkuOverviewSession(shopName?: string): void {
  if (shopName) cache.delete(shopName);
  else cache.clear();
}
