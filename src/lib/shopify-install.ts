// Shared launcher for the real Shopify OAuth install. Both /install (pre-auth landing) and
// /authorize (return landing + fallback connect) use this so domain validation, the remembered-shop
// localStorage key, and the full-page redirect stay identical. No OAuth logic changes here — it just
// builds the backend install URL and navigates the top-level window (Shopify consent can't be framed).

import { shopifyInstallUrl, shopifyLoginUrl } from "@/lib/api";
import { sameOriginAuthedFetch } from "@/lib/auth/same-origin-authed-fetch";
import { openExternal } from "@/host/adapters/external-link";
import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";

/** Remembers the shop the user launched OAuth for, so /authorize can restore state after the redirect. */
export const SHOP_STORAGE_KEY = "tangbuy.shopDomain";
export const TANGBUY_TOKEN_HANDOFF_KEY = "tangbuy.shopifyTangbuyToken";

const SHOP_HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;
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
  if (SHOP_HANDLE_PATTERN.test(host)) {
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
  | "AUTH_REQUIRED"
  | "INSTALL_URL_FAILED"
  | "NAVIGATION_FAILED";

export interface LaunchInstallResult {
  ok: boolean;
  /** Present when validation/config failed. Callers should translate via {@link resolveInstallError}. */
  errorCode?: InstallErrorCode;
}

interface InstallUrlResponse {
  url?: string;
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
export async function launchShopifyInstall(
  rawDomain: string,
  opts?: { preferNewTab?: boolean }
): Promise<LaunchInstallResult> {
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain) {
    return { ok: false, errorCode: "EMPTY_DOMAIN" };
  }
  if (!SHOP_DOMAIN_PATTERN.test(shopDomain)) {
    return { ok: false, errorCode: "INVALID_DOMAIN" };
  }
  try {
    const mode = readEmbeddedMode();
    // Top-level pages without Admin ?host= / ?embedded= must never take the
    // iframe breakout path — sticky sessionStorage used to flip this wrongly
    // and surface "leave the Admin frame" on source.tangbuy.cc.
    const forceStandalone = isTopLevelStandaloneSurface();
    const embedded = mode.isEmbedded && !forceStandalone;
    let url = shopifyInstallUrl(shopDomain, {
      embedded,
      host: embedded ? mode.host : undefined,
    });
    if (!embedded) {
      const q = new URLSearchParams({ shop: shopDomain });
      const res = await sameOriginAuthedFetch(
        `/api/shopify/install-url?${q.toString()}`
      );
      if (res.ok) {
        const data = (await res.json()) as InstallUrlResponse;
        if (data.url) {
          url = data.url;
        }
      } else if (res.status === 401 || res.status === 403) {
        return { ok: false, errorCode: "AUTH_REQUIRED" };
      } else {
        // Fall back to same-origin plugin install (browser follows 302 to Shopify).
        // Do not map BFF failures to the Admin-frame copy.
        url = shopifyInstallUrl(shopDomain, { embedded: false });
      }
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_STORAGE_KEY, shopDomain);
      rememberTangbuyTokenForEmbedded();
      if (embedded) {
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
        const url = shopifyInstallUrl(shopDomain, { embedded: false });
        window.location.assign(url);
        return { ok: true };
      } catch {
        // fall through
      }
    }
    return { ok: false, errorCode: "INSTALL_URL_FAILED" };
  }
}

/** True when this document is a top-level standalone surface (not Admin iframe). */
export function isTopLevelStandaloneSurface(): boolean {
  if (typeof window === "undefined") return true;
  const q = new URLSearchParams(window.location.search);
  const host = (q.get("host") ?? "").trim();
  const emb = q.get("embedded");
  const adminQuery =
    Boolean(host) || emb === "1" || emb === "true";
  if (adminQuery) return false;
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  return true;
}

function rememberTangbuyTokenForEmbedded(): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const token = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("TANGBUY_TOKEN="))
    ?.slice("TANGBUY_TOKEN=".length);
  if (token) {
    window.localStorage.setItem(TANGBUY_TOKEN_HANDOFF_KEY, decodeURIComponent(token));
  }
}

/**
 * Optional secondary link: open the embedded 60s app inside Shopify Admin.
 * Requires a public API key (`NEXT_PUBLIC_SHOPIFY_API_KEY`) and a shop handle/domain.
 * Does not set standalone cookies — primary standalone login remains {@link launchShopifyLogin}.
 */
export function adminAppDeepLink(
  rawDomain: string,
  opts?: { localePath?: string }
): string | null {
  const apiKey = (
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ??
    process.env.SHOPIFY_API_KEY ??
    ""
  ).trim();
  if (!apiKey) return null;
  const shopDomain = normalizeShopDomain(rawDomain);
  if (!shopDomain || !SHOP_DOMAIN_PATTERN.test(shopDomain)) return null;
  const handle = shopDomain.replace(/\.myshopify\.com$/i, "");
  const path = (opts?.localePath ?? "/en/authorize").replace(/^\//, "");
  return `https://admin.shopify.com/store/${handle}/apps/${apiKey}/${path}`;
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
  if (mode.isEmbedded && !isTopLevelStandaloneSurface()) {
    void launchShopifyInstall(rawDomain, { preferNewTab: true });
    return { ok: true };
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
    case "AUTH_REQUIRED":
      return t("install.errAuthRequired");
    case "INSTALL_URL_FAILED":
      return t("install.errInstallUrlFailed");
    case "NAVIGATION_FAILED":
      return t("install.errNavigationFailed");
    default:
      return fallback;
  }
}
