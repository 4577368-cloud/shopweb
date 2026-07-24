import type { ShopMirrorProduct, ImageBindingView } from "@/lib/types";
import { WORKFLOW_MIRROR_TTL_MS } from "@/lib/workflow/mirror-ttl";

/**
 * Module-level + sessionStorage cache for the shop product mirror list.
 *
 * In-memory entries survive step navigation; sessionStorage survives a full
 * page refresh in the same tab so the list does not flash empty while the
 * gateway refetches.
 */
export interface MirrorCacheEntry {
  items: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  ts: number;
}

const cache = new Map<string, MirrorCacheEntry>();
const STORAGE_PREFIX = "tangbuy.products.mirror.v1:";

/** Stable cache key — prefer myshopify domain over display name. */
export function productsMirrorShopKey(
  name: string,
  domain?: string | null
): string {
  const d = domain?.trim().toLowerCase();
  if (d) return d;
  return name.trim();
}

function storageKey(shopKey: string): string {
  return STORAGE_PREFIX + shopKey.toLowerCase();
}

function readPersisted(shopKey: string): MirrorCacheEntry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(storageKey(shopKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MirrorCacheEntry;
    if (!Array.isArray(parsed?.items) || !parsed.bindings || typeof parsed.ts !== "number") {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function writePersisted(shopKey: string, entry: MirrorCacheEntry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(shopKey), JSON.stringify(entry));
  } catch {
    // Quota — in-memory cache still helps within the same document lifecycle.
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

export function getMirrorCache(shopKey: string): MirrorCacheEntry | undefined {
  const mem = cache.get(shopKey);
  if (mem) return mem;
  const persisted = readPersisted(shopKey);
  if (persisted) {
    cache.set(shopKey, persisted);
    return persisted;
  }
  return undefined;
}

/** Latest cached mirror for immediate UI hydrate (may be past in-memory TTL). */
export function peekMirrorCache(shopKey: string): MirrorCacheEntry | undefined {
  return getMirrorCache(shopKey);
}

export function setMirrorCache(
  shopKey: string,
  data: { items: ShopMirrorProduct[]; bindings: Record<string, ImageBindingView> }
): void {
  const entry: MirrorCacheEntry = { ...data, ts: Date.now() };
  cache.set(shopKey, entry);
  writePersisted(shopKey, entry);
}

export function isMirrorCacheFresh(shopKey: string, now: number = Date.now()): boolean {
  const entry = getMirrorCache(shopKey);
  if (!entry) return false;
  if (now - entry.ts >= WORKFLOW_MIRROR_TTL_MS) return false;
  return entry.items.length > 0;
}

export function clearMirrorCache(shopKey?: string): void {
  if (shopKey) {
    cache.delete(shopKey);
    removePersisted(shopKey);
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
