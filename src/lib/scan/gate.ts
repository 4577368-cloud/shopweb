// Per-shop gate for the "首轮自动处理" scan stage. Decides whether a page auto-plays its scan on entry.
// Client-only (localStorage, so the auto-scan runs at most ONCE per shop per device — not on every
// session/app open); on the server it reports "already scanned" so SSR/hydration never renders the
// scan phase. A manual "重新分析" clears the marker to replay. Durable/cross-device state is Phase 2.
//
// Stale-aware: stores a timestamp alongside the marker. If the scan is older than STALE_MS,
// hasScanned returns false so the scan replays automatically — no longer "once per device forever".

const PREFIX = "tangbuy.scan.";

/** 扫描结果超过此时间（10 分钟）视为过期，下次进入页面会自动重跑扫描。 */
const STALE_MS = 10 * 60 * 1000;

function key(page: string, shop: string): string {
  return `${PREFIX}${page}.${shop}`;
}

function tsKey(page: string, shop: string): string {
  return `${PREFIX}${page}.${shop}.ts`;
}

/** True when this shop already ran (or should skip) the scan for the page — persists across sessions. */
export function hasScanned(page: string, shop: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const marker = window.localStorage.getItem(key(page, shop));
    if (marker !== "1") return false;
    // 检查时间戳是否过期
    const ts = window.localStorage.getItem(tsKey(page, shop));
    if (!ts) return true; // 老数据无时间戳，视为已扫描（兼容）
    const age = Date.now() - parseInt(ts, 10);
    if (Number.isNaN(age)) return true;
    return age < STALE_MS;
  } catch {
    return true;
  }
}

/** Mark the scan as done for this shop so future opens go straight to the result view. */
export function markScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(page, shop), "1");
    window.localStorage.setItem(tsKey(page, shop), String(Date.now()));
  } catch {
    // ignore storage failures (private mode / quota) — worst case the scan replays.
  }
}

/** Clear the marker so a manual "重新整理 / 重新分析" replays the scan. */
export function clearScanned(page: string, shop: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(page, shop));
    window.localStorage.removeItem(tsKey(page, shop));
  } catch {
    // ignore
  }
}
