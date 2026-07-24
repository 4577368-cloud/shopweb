import type { LaunchSummary } from "@/lib/sync/launch-summary";
import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

export interface LaunchSummaryCacheEntry {
  summary: LaunchSummary;
  ts: number;
}

const cache = new Map<string, LaunchSummaryCacheEntry>();
const STORAGE_PREFIX = "tangbuy.launch-summary.v1:";

function storageKey(shopKey: string): string {
  return STORAGE_PREFIX + shopKey.toLowerCase();
}

function readPersisted(shopKey: string): LaunchSummaryCacheEntry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(storageKey(shopKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as LaunchSummaryCacheEntry;
    if (!parsed?.summary?.meta || typeof parsed.ts !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writePersisted(shopKey: string, entry: LaunchSummaryCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(shopKey), JSON.stringify(entry));
  } catch {
    // Quota — in-memory still helps for step navigation.
  }
}

function removePersisted(shopKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(shopKey));
  } catch {
    // ignore
  }
}

export function getLaunchSummaryCache(shopKey: string): LaunchSummary | undefined {
  const mem = cache.get(shopKey);
  if (mem) return mem.summary;
  const persisted = readPersisted(shopKey);
  if (persisted) {
    cache.set(shopKey, persisted);
    return persisted.summary;
  }
  return undefined;
}

/** Latest cached summary for immediate hydrate (may be past TTL). */
export function peekLaunchSummaryCache(shopKey: string): LaunchSummary | undefined {
  return getLaunchSummaryCache(shopKey);
}

export function isLaunchSummaryCacheFresh(
  shopKey: string,
  now: number = Date.now()
): boolean {
  const entry = cache.get(shopKey) ?? readPersisted(shopKey);
  if (!entry) return false;
  return now - entry.ts < WORKFLOW_MIRROR_TTL_MS;
}

export function setLaunchSummaryCache(shopKey: string, summary: LaunchSummary): void {
  const entry: LaunchSummaryCacheEntry = { summary, ts: Date.now() };
  cache.set(shopKey, entry);
  writePersisted(shopKey, entry);
}

export function clearLaunchSummaryCache(shopKey?: string): void {
  if (shopKey) {
    cache.delete(shopKey);
    removePersisted(shopKey);
    return;
  }
  cache.clear();
  if (typeof window === "undefined") return;
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) window.sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
