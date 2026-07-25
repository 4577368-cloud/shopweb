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
  // 存在已记住的 domain 但 session/local 均未验证 → 视为 bootstrapping，
  // 等待 use-onboarding-shop-auth 的 restore 流程完成后才会置真。
  return false;
}
