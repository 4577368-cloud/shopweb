// Shared launcher for the real Shopify OAuth install. Both /install (pre-auth landing) and
// /authorize (return landing + fallback connect) use this so domain validation, the remembered-shop
// localStorage key, and the full-page redirect stay identical. No OAuth logic changes here — it just
// builds the backend install URL and navigates the top-level window (Shopify consent can't be framed).

import { shopifyInstallUrl, shopifyLoginUrl } from "@/lib/api";
import { openExternal } from "@/host/adapters/external-link";
import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

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
  | "API_BASE_MISSING"
  | "NAVIGATION_FAILED";

export interface LaunchInstallResult {
  ok: boolean;
  /** Present when validation/config failed. Callers should translate via {@link resolveInstallError}. */
  errorCode?: InstallErrorCode;
}

/**
 * Validate and remember shop domain for later restore (login bounce, language switch, authorize).
 * Returns normalized domain or null when invalid.
 */
export function rememberShopDomain(rawDomain: string): string | null {
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain || !SHOP_DOMAIN_PATTERN.test(shopDomain)) return null;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
  }
  return shopDomain;
}

/**
 * Validate a shop domain, remember it, and navigate to the backend install endpoint (which 302s to
 * Shopify's consent screen). Returns {ok:false,errorCode} without navigating when the domain is
 * missing/invalid, so callers can show an inline/toast message.
 *
 * Browser install uses same-origin `/api/plugin/...` (rewritten at build via NEXT_PUBLIC_API_BASE).
 * Do not gate the click path on the client-inlined env — that produced false "not configured"
 * errors when the var was present for rewrites but the embedded top-nav threw.
 */
export function launchShopifyInstall(
  rawDomain: string,
  opts?: { preferNewTab?: boolean }
): LaunchInstallResult {
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain) {
    return { ok: false, errorCode: "EMPTY_DOMAIN" };
  }
  if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
    return { ok: false, errorCode: "INVALID_DOMAIN" };
  }
  try {
    const mode = readEmbeddedMode();
    const url = shopifyInstallUrl(shopDomain, {
      embedded: mode.isEmbedded,
      host: mode.host,
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      if (mode.isEmbedded) {
        // Prefer a new tab: top-frame navigation is often blocked in Admin's
        // sandboxed iframe (surfaces as NAVIGATION_FAILED / "leave Admin frame").
        openExternal(url, { newTab: opts?.preferNewTab !== false });
      } else {
        window.location.assign(url);
      }
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /NEXT_PUBLIC_API_BASE|not configured/i.test(e.message)) {
      return { ok: false, errorCode: "API_BASE_MISSING" };
    }
    if (typeof window !== "undefined") {
      try {
        const mode = readEmbeddedMode();
        const url = shopifyInstallUrl(shopDomain, {
          embedded: mode.isEmbedded,
          host: mode.host,
        });
        window.open(url, "_blank", "noopener,noreferrer");
        return { ok: true };
      } catch {
        // fall through
      }
    }
    return { ok: false, errorCode: "NAVIGATION_FAILED" };
  }
}

/**
 * Standalone Login with Shopify: OAuth → auto-provision → `tb_access` cookies → returnTo.
 * In embedded Admin, falls back to {@link launchShopifyInstall} (session-token / install-embedded).
 */
export function launchShopifyLogin(
  rawDomain: string,
  opts?: { returnTo?: string }
): LaunchInstallResult {
  const mode = readEmbeddedMode();
  if (mode.isEmbedded) {
    return launchShopifyInstall(rawDomain, { preferNewTab: true });
  }
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain) {
    return { ok: false, errorCode: "EMPTY_DOMAIN" };
  }
  if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
    return { ok: false, errorCode: "INVALID_DOMAIN" };
  }
  try {
    const url = shopifyLoginUrl(shopDomain, { returnTo: opts?.returnTo });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      window.location.assign(url);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /NEXT_PUBLIC_API_BASE|not configured/i.test(e.message)) {
      return { ok: false, errorCode: "API_BASE_MISSING" };
    }
    return { ok: false, errorCode: "NAVIGATION_FAILED" };
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
    case "NAVIGATION_FAILED":
      return t("install.errNavigationFailed");
    default:
      return fallback;
  }
}
