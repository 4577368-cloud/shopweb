// Per-shop gate for the "首轮自动处理" scan stage. Decides whether a page auto-plays its scan on entry.
// Client-only (localStorage, so the auto-scan runs at most ONCE per shop per device — not on every
// session/app open); on the server it reports "already scanned" so SSR/hydration never renders the
// scan phase. A manual "重新分析" clears the marker to replay. Durable/cross-device state is Phase 2.

const PREFIX = "tangbuy.scan.";

function key(page: string, shop: string): string {
  return `${PREFIX}${page}.${shop}`;
}

/** True when this shop already ran (or should skip) the scan for the page — persists across sessions. */
export function hasScanned(page: string, shop: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key(page, shop)) === "1";
  } catch {
    return true;
  }
}

/** Mark the scan as done for this shop so future opens go straight to the result view. */
export function markScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(page, shop), "1");
  } catch {
    // ignore storage failures (private mode / quota) — worst case the scan replays.
  }
}

/** Clear the marker so a manual "重新整理 / 重新分析" replays the scan. */
export function clearScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(page, shop));
  } catch {
    // ignore
  }
}
