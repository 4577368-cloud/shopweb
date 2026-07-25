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
  const domain = input
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

/**
 * Machine-readable error codes for {@link launchShopifyInstall}. Callers map these to
 * i18n strings via {@link resolveInstallError} so this utility stays free of hardcoded copy.
 */
export type InstallErrorCode =
  | "EMPTY_DOMAIN"
  | "INVALID_DOMAIN"
  | "API_BASE_UNCONFIGURED"
  | "API_BASE_MISSING";

export interface LaunchInstallResult {
  ok: boolean;
  /** Present when validation/config failed. Callers should translate via {@link resolveInstallError}. */
  errorCode?: InstallErrorCode;
}

/**
 * Validate a shop domain, remember it, and navigate to the backend install endpoint (which 302s to
 * Shopify's consent screen). Returns {ok:false,errorCode} without navigating when the domain is
 * missing/invalid or the API base is unconfigured, so callers can show an inline/toast message.
 */
export function launchShopifyInstall(rawDomain: string): LaunchInstallResult {
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain) {
    return { ok: false, errorCode: "EMPTY_DOMAIN" };
  }
  if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
    return { ok: false, errorCode: "INVALID_DOMAIN" };
  }
  try {
    if (typeof window !== "undefined" && !(process.env.NEXT_PUBLIC_API_BASE ?? "").trim()) {
      return {
        ok: false,
        errorCode: "API_BASE_UNCONFIGURED",
      };
    }
    const url = shopifyInstallUrl(shopDomain);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      window.location.href = url;
    }
    return { ok: true };
  } catch {
    return { ok: false, errorCode: "API_BASE_MISSING" };
  }
}

/**
 * Map a {@link LaunchInstallResult.errorCode} to a translated user-facing string. Callers pass
 * their i18n {@code t} function so this utility stays free of hardcoded copy and works for all
 * locales. Returns {@code fallback} when {@code code} is undefined (shouldn't happen, but keeps
 * the UI safe).
 */
export function resolveInstallError(
  t: (key: string, params?: Record<string, string | number>) => string,
  code: InstallErrorCode | undefined,
  fallback: string
): string {
  switch (code) {
    case "EMPTY_DOMAIN":
      return t("install.errEmptyDomain");
    case "INVALID_DOMAIN":
      return t("install.errInvalidDomain");
    case "API_BASE_UNCONFIGURED":
      return t("install.errApiBaseUnconfigured");
    case "API_BASE_MISSING":
      return t("install.errApiBaseMissing");
    default:
      return fallback;
  }
}
