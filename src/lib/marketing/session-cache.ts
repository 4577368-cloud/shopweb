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

export function readMarketingApiCache(cacheKey: string): unknown | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(CACHE_PREFIX + cacheKey);
    if (!raw) return undefined;
    const parsed = safeParse<{ v: unknown }>(raw);
    return parsed?.v;
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
