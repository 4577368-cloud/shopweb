const LOGISTICS_SYNC_EXCEPTION_KEY = "logistics-sync-exception-count";

export function stashLogisticsSyncExceptionCount(count: number): void {
  if (count <= 0 || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(LOGISTICS_SYNC_EXCEPTION_KEY, String(count));
}

/** Read once and clear — for sync page arrival hint. */
export function consumeLogisticsSyncExceptionCount(): number | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(LOGISTICS_SYNC_EXCEPTION_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LOGISTICS_SYNC_EXCEPTION_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
