// Shared launcher for the real Shopify OAuth install. Both /install (pre-auth landing) and
// /authorize (return landing + fallback connect) use this so domain validation, the remembered-shop
// localStorage key, and the full-page redirect stay identical. No OAuth logic changes here — it just
// builds the backend install URL and navigates the top-level window (Shopify consent can't be framed).

import { shopifyInstallUrl } from "@/lib/api";

/** Remembers the shop the user launched OAuth for, so /authorize can restore state after the redirect. */
export const SHOP_STORAGE_KEY = "tangbuy.shopDomain";

export const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

/** Strip scheme/trailing slash/whitespace; allow store handle without `.myshopify.com`. */
export function normalizeShopDomain(input: string): string {
  let domain = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .toLowerCase();

  if (!domain) return "";

  const host = domain.split("/")[0] ?? domain;
  if (/^[a-z0-9][a-z0-9-]*$/.test(host)) {
    return `${host}.myshopify.com`;
  }
  return host;
}

export interface LaunchInstallResult {
  ok: boolean;
  /** Present when validation/config failed; the caller decides how to surface it. */
  error?: string;
}

/**
 * Validate a shop domain, remember it, and navigate to the backend install endpoint (which 302s to
 * Shopify's consent screen). Returns {ok:false,error} without navigating when the domain is
 * missing/invalid or the API base is unconfigured, so callers can show an inline/toast message.
 */
export function launchShopifyInstall(rawDomain: string): LaunchInstallResult {
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain) {
    return { ok: false, error: "请先填写店铺域名" };
  }
  if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
    return { ok: false, error: "请输入正确的店铺域名，例如 your-store.myshopify.com" };
  }
  try {
    const url = shopifyInstallUrl(shopDomain);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      window.location.href = url;
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "后端地址未配置（NEXT_PUBLIC_API_BASE）" };
  }
}
