// Session-scoped gate for the "首轮自动处理" scan stage. Decides whether a page auto-plays its scan
// on entry. Client-only (sessionStorage); on the server it reports "already scanned" so SSR/hydration
// never renders the scan phase. This is local memory only — durable/cross-device state is Phase 2.

const PREFIX = "tangbuy.scan.";

function key(page: string, shop: string): string {
  return `${PREFIX}${page}.${shop}`;
}

/** True when this session already ran (or should skip) the scan for page+shop. */
export function hasScanned(page: string, shop: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(key(page, shop)) === "1";
  } catch {
    return true;
  }
}

/** Mark the scan as done for this session so re-entry goes straight to the result view. */
export function markScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key(page, shop), "1");
  } catch {
    // ignore storage failures (private mode / quota) — worst case the scan replays.
  }
}

/** Clear the marker so a manual "重新整理 / 重新分析" replays the scan. */
export function clearScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key(page, shop));
  } catch {
    // ignore
  }
}
