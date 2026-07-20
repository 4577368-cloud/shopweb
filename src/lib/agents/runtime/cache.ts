/**
 * Tiny TTL cache for enriched agent responses (per page pack).
 */

export interface TtlCache<V> {
  get(key: string): V | null;
  set(key: string, value: V): void;
  clear(): void;
}

export function createTtlCache<V>(opts?: {
  ttlMs?: number;
  maxEntries?: number;
}): TtlCache<V> {
  const ttlMs = opts?.ttlMs ?? 60_000;
  const maxEntries = opts?.maxEntries ?? 80;
  const store = new Map<string, { expiresAt: number; value: V }>();

  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (Date.now() > hit.expiresAt) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value) {
      if (store.size >= maxEntries) {
        const first = store.keys().next().value;
        if (first) store.delete(first);
      }
      store.set(key, { expiresAt: Date.now() + ttlMs, value });
    },
    clear() {
      store.clear();
    },
  };
}

export function cacheKey(pageKey: string, intent: string, fingerprint: string): string {
  return `${pageKey}::${intent}::${fingerprint}`;
}
