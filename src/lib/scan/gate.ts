// Per-shop gate for workflow "entry ceremony" (scan / classify animation).
// Persists in localStorage until the user taps 重新分析 / 重新刷新 (clearScanned).
// Does not auto-expire — daily navigation should open the result view immediately.
//
// Server: hasScanned returns true so SSR/hydration never renders the ceremony phase.

const PREFIX = "tangbuy.scan.";

function key(page: string, shop: string): string {
  return `${PREFIX}${page}.${shop}`;
}

/** True when this shop already completed the entry ceremony for the page. */
export function hasScanned(page: string, shop: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key(page, shop)) === "1";
  } catch {
    return true;
  }
}

export function markScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(page, shop), "1");
  } catch {
    // ignore
  }
}

/** Clear the marker so a manual refresh replays the entry ceremony. */
export function clearScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(page, shop));
  } catch {
    // ignore
  }
}
