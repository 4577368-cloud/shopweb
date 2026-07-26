/** Session-scoped marketing API cache — survives refresh, avoids repeat pipispy charges. */

const CACHE_PREFIX = "tangbuy.marketing.api.";
const VIEW_PREFIX = "tangbuy.marketing.view.";

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const API_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function readMarketingApiCache(cacheKey: string): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + cacheKey);
    if (!raw) return undefined;
    const parsed = safeParse<{ v: unknown; at?: number }>(raw);
    if (parsed == null) return undefined;
    if (parsed.at != null && Date.now() - parsed.at >= API_CACHE_TTL_MS) {
      window.sessionStorage.removeItem(CACHE_PREFIX + cacheKey);
      return undefined;
    }
    return parsed.v;
  } catch {
    return undefined;
  }
}

export function writeMarketingApiCache(cacheKey: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      CACHE_PREFIX + cacheKey,
      JSON.stringify({ v: value, at: Date.now() })
    );
  } catch {
    // quota / private mode
  }
}

export function readMarketingViewState<T>(scope: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(VIEW_PREFIX + scope);
    const parsed = safeParse<{ payload: T }>(raw);
    return parsed?.payload ?? null;
  } catch {
    return null;
  }
}

export function writeMarketingViewState<T>(scope: string, payload: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      VIEW_PREFIX + scope,
      JSON.stringify({ payload, at: Date.now() })
    );
  } catch {
    // ignore
  }
}

// --- 「3 天免费详情窗口」池 ---
// 规则：榜/搜列表里出现过的 product_id，在 3 天内再打开其详情，pipispy 不重复计费。
// 这里在会话内记录这些 id 及首次见到的时间，供 fetchAdDetail 标注 freeWindow（真实扣点仍以响应为准）。
const FREE_POOL_KEY = "tangbuy.marketing.freeDetailPool";
const FREE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

type FreePool = Record<string, number>; // productId -> 首次见到的时间戳(ms)

function readFreePool(): FreePool {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(FREE_POOL_KEY);
    if (!raw) return {};
    const pool = (JSON.parse(raw) as FreePool) ?? {};
    return prunePool(pool);
  } catch {
    return {};
  }
}

function writeFreePool(pool: FreePool): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FREE_POOL_KEY, JSON.stringify(pool));
  } catch {
    // quota / private mode
  }
}

/** 记录某 product_id 已被列表/详情见过（进入免费窗口）。 */
export function recordDetailSeen(id: string): void {
  if (!id) return;
  const pool = readFreePool();
  if (pool[id] == null) {
    pool[id] = Date.now();
    writeFreePool(pool);
  }
}

/** 该 product_id 是否在 3 天免费窗口内（列表/详情见过且未过期）。 */
export function isDetailFree(id: string): boolean {
  if (!id) return false;
  const pool = readFreePool();
  const seen = pool[id];
  if (!seen) return false;
  return Date.now() - seen < FREE_WINDOW_MS;
}

function prunePool(pool: FreePool): FreePool {
  const now = Date.now();
  let changed = false;
  for (const [id, ts] of Object.entries(pool)) {
    if (now - ts >= FREE_WINDOW_MS) {
      delete pool[id];
      changed = true;
    }
  }
  if (changed) writeFreePool(pool);
  return pool;
}



// --- 「3 天免费店铺窗口」池 ---
// 规则：竞店搜索（store/detail/competition）里出现过的 store_id，在 3 天内再打开其抽屉、
// 拉取 store/ad-trend、store/longest-run-ads、store/most-used-ads、store/fb-pages 等店铺级端点，
// pipispy 不重复计费（设计 §4.2：store/detail 族享 3 天免费窗口，基于 store id 而非 product id）。
const FREE_STORE_POOL_KEY = "tangbuy.marketing.freeStorePool";

type FreeStorePool = Record<string, number>; // storeId -> 首次见到的时间戳(ms)

function readFreeStorePool(): FreeStorePool {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(FREE_STORE_POOL_KEY);
    if (!raw) return {};
    const pool = (JSON.parse(raw) as FreeStorePool) ?? {};
    return pruneStorePool(pool);
  } catch {
    return {};
  }
}

function writeFreeStorePool(pool: FreeStorePool): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(FREE_STORE_POOL_KEY, JSON.stringify(pool));
  } catch {
    // quota / private mode
  }
}

/** 记录某 store_id 已被搜索/详情见过（进入店铺级免费窗口）。 */
export function recordStoreSeen(id: string): void {
  if (!id) return;
  const pool = readFreeStorePool();
  if (pool[id] == null) {
    pool[id] = Date.now();
    writeFreeStorePool(pool);
  }
}

function pruneStorePool(pool: FreeStorePool): FreeStorePool {
  const now = Date.now();
  let changed = false;
  for (const [id, ts] of Object.entries(pool)) {
    if (now - ts >= FREE_WINDOW_MS) {
      delete pool[id];
      changed = true;
    }
  }
  if (changed) writeFreeStorePool(pool);
  return pool;
}

/** 该 store_id 是否在 3 天免费窗口内（搜索/详情见过且未过期）。 */
export function isStoreFree(id: string): boolean {
  if (!id) return false;
  const pool = readFreeStorePool();
  const seen = pool[id];
  if (!seen) return false;
  return Date.now() - seen < FREE_WINDOW_MS;
}
