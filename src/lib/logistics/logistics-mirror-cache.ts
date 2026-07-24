import { api } from "@/lib/api";

/**
 * Module-level + sessionStorage cache for the logistics page's load payload.
 *
 * The logistics analysis / templates / pricing-template are locale-agnostic
 * (only UI copy is localized), so they can be reused across language switches.
 * Without this, switching locale remounts the page and re-fetches the gateway
 * even though C-core already keeps the global onboarding state alive.
 *
 * Keyed by shopName. Entries expire after TTL_MS for skip-fetch; stale entries
 * still hydrate the UI while a silent refresh runs.
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

import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

const cache = new Map<string, LogisticsMirrorCacheEntry>();
const STORAGE_PREFIX = "tangbuy.logistics.mirror.v1:";

function storageKey(shopName: string): string {
  return STORAGE_PREFIX + shopName.trim().toLowerCase();
}

function readPersisted(shopName: string): LogisticsMirrorCacheEntry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(storageKey(shopName));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LogisticsMirrorCacheEntry;
    if (typeof parsed.ts !== "number" || !Array.isArray(parsed.templates)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function writePersisted(shopName: string, entry: LogisticsMirrorCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(shopName), JSON.stringify(entry));
  } catch {
    // quota — in-memory still helps within the same document
  }
}

function removePersisted(shopName: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(shopName));
  } catch {
    // ignore
  }
}

export function getLogisticsMirrorCache(
  shopName: string
): LogisticsMirrorCacheEntry | undefined {
  const mem = cache.get(shopName);
  if (mem) return mem;
  const persisted = readPersisted(shopName);
  if (persisted) {
    cache.set(shopName, persisted);
    return persisted;
  }
  return undefined;
}

/** Latest cached payload for immediate hydrate (may be past TTL). */
export function peekLogisticsMirrorCache(
  shopName: string
): LogisticsMirrorCacheEntry | undefined {
  const entry = getLogisticsMirrorCache(shopName);
  if (!entry?.analysis) return undefined;
  return entry;
}

export function setLogisticsMirrorCache(
  shopName: string,
  data: Omit<LogisticsMirrorCacheEntry, "ts">
): void {
  const entry: LogisticsMirrorCacheEntry = { ...data, ts: Date.now() };
  cache.set(shopName, entry);
  writePersisted(shopName, entry);
}

export function isLogisticsMirrorCacheFresh(
  shopName: string,
  now: number = Date.now()
): boolean {
  const entry = getLogisticsMirrorCache(shopName);
  if (!entry?.analysis) return false;
  return now - entry.ts < WORKFLOW_MIRROR_TTL_MS;
}

export function clearLogisticsMirrorCache(shopName?: string): void {
  if (shopName) {
    cache.delete(shopName);
    removePersisted(shopName);
  } else {
    cache.clear();
    if (typeof window !== "undefined") {
      try {
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const k = window.sessionStorage.key(i);
          if (k?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
    }
  }
}
