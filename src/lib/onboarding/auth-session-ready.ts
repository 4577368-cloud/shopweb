/** Client auth session gate for useSyncExternalStore (optimistic localStorage). */

export function subscribeAuthSessionReady(): () => void {
  return () => {};
}

export function getAuthSessionReadySnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return true;
}
