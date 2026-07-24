/** Client auth session gate for useSyncExternalStore (optimistic localStorage). */

import {
  readAuthLocalOk,
  readAuthSessionOk,
  readStoredShopDomain,
} from "@/lib/restore-shop-auth";

export function subscribeAuthSessionReady(): () => void {
  return () => {};
}

export function getAuthSessionReadySnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const domain = readStoredShopDomain();
  if (!domain) return true;
  if (readAuthSessionOk(domain) || readAuthLocalOk(domain)) return true;
  return true;
}
