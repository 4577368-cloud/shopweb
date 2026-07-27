import { normalizeShopApiName, shopApiNameFromDomain } from "@/lib/resolve-shop-api-name";
import { api } from "@/lib/api";
import { SHOP_STORAGE_KEY } from "@/lib/shopify-install";

const AUTH_SESSION_OK_KEY = "tangbuy.authSessionOk";
const AUTH_LOCAL_OK_KEY = "tangbuy.authLocalOk";
/** How long we trust tab-session auth without re-blocking the UI on refresh. */
const AUTH_SESSION_OK_TTL_MS = 8 * 60 * 60 * 1000;
/** Cross-refresh / cross-tab: remembered shop was verified with backend. */
const AUTH_LOCAL_OK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Synchronous read of remembered shop (client-only). */
export function readStoredShopDomain(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(SHOP_STORAGE_KEY)?.trim();
  return v || null;
}

export function shopDisplayNameFromDomain(domain: string): string {
  return (
    domain
      .split(".")[0]
      ?.split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || domain
  );
}

function readAuthOk(
  storage: Storage,
  key: string,
  domain: string,
  ttlMs: number
): boolean {
  const normalized = domain.trim();
  if (!normalized) return false;
  try {
    const raw = storage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { domain?: string; at?: number };
    if (parsed.domain?.trim() !== normalized) return false;
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    return Date.now() - at < ttlMs;
  } catch {
    return false;
  }
}

function writeAuthOk(storage: Storage, key: string, domain: string): void {
  const normalized = domain.trim();
  if (!normalized) return;
  try {
    storage.setItem(
      key,
      JSON.stringify({ domain: normalized, at: Date.now() })
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Verified in this browser tab recently (sessionStorage). */
export function readAuthSessionOk(domain: string): boolean {
  if (typeof window === "undefined") return false;
  return readAuthOk(
    window.sessionStorage,
    AUTH_SESSION_OK_KEY,
    domain,
    AUTH_SESSION_OK_TTL_MS
  );
}

export function markAuthSessionOk(domain: string): void {
  if (typeof window === "undefined") return;
  writeAuthOk(window.sessionStorage, AUTH_SESSION_OK_KEY, domain);
}

export function clearAuthSessionOk(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(AUTH_SESSION_OK_KEY);
  } catch {
    // ignore
  }
}

/** Verified with backend recently (localStorage) — survives F5 and new tabs. */
export function readAuthLocalOk(domain: string): boolean {
  if (typeof window === "undefined") return false;
  return readAuthOk(
    window.localStorage,
    AUTH_LOCAL_OK_KEY,
    domain,
    AUTH_LOCAL_OK_TTL_MS
  );
}

export function markAuthLocalOk(domain: string): void {
  if (typeof window === "undefined") return;
  writeAuthOk(window.localStorage, AUTH_LOCAL_OK_KEY, domain);
}

export function clearAuthLocalOk(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(AUTH_LOCAL_OK_KEY);
  } catch {
    // ignore
  }
}

/** Client-only: whether we can show workbench without waiting on getShopStatus (SSR-safe). */
export function shouldOptimisticAuthFromStoredShop(domain: string | null): boolean {
  if (!domain?.trim()) return false;
  return readAuthSessionOk(domain) || readAuthLocalOk(domain);
}

export function markAuthVerified(domain: string): void {
  markAuthSessionOk(domain);
  markAuthLocalOk(domain);
}

export function clearAuthVerified(): void {
  clearAuthSessionOk();
  clearAuthLocalOk();
}

/** Drop remembered shop (wrong account, revoked OAuth, or user switched). */
export function clearRememberedShopDomain(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SHOP_STORAGE_KEY);
  } catch {
    // ignore
  }
  clearAuthVerified();
}

const SHOP_USER_ID_KEY = "tangbuy.shopUserId";

/** Per-user shop memory: new login on a shared browser must not reuse another account's domain. */
export function syncRememberedShopForUser(userId: number): void {
  if (typeof window === "undefined") return;
  try {
    const prev = window.localStorage.getItem(SHOP_USER_ID_KEY);
    const next = String(userId);
    if (prev && prev !== next) {
      clearRememberedShopDomain();
    }
    window.localStorage.setItem(SHOP_USER_ID_KEY, next);
  } catch {
    // ignore
  }
}

export interface RestoredShopAuth {
  name: string;
  domain: string;
  authorizedAt: string;
  productCount: number;
}

function fmtAuthorizedAt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("zh-CN", { hour12: false });
}

/**
 * Resolve which shop domain to probe on cold load.
 * Priority: URL ?shop= → remembered localStorage (if still authorized) → first authorized shop.
 * Multi-shop: never overwrite a valid remembered shop with shops[0].
 */
export async function resolveShopDomainToRestore(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const shopFromUrl = new URLSearchParams(window.location.search).get("shop")?.trim();
  if (shopFromUrl) {
    window.localStorage.setItem(SHOP_STORAGE_KEY, shopFromUrl);
    return shopFromUrl;
  }

  const stored = window.localStorage.getItem(SHOP_STORAGE_KEY)?.trim() || null;

  try {
    const list = await api.listAuthorizedShops();
    const shops = Array.isArray(list) ? list : [];
    if (shops.length === 0) {
      // Logged-in user has no shops — ignore orphan localStorage from another session.
      if (stored) clearRememberedShopDomain();
      return null;
    }

    const storedNorm = stored?.toLowerCase() ?? "";
    const match = storedNorm
      ? shops.find((s) => s.shopDomain?.trim().toLowerCase() === storedNorm)
      : undefined;
    const domain = (match?.shopDomain ?? shops[0]?.shopDomain)?.trim() || null;
    if (domain) {
      window.localStorage.setItem(SHOP_STORAGE_KEY, domain);
    }
    return domain;
  } catch {
    return stored;
  }
}

/** Ask backend whether a remembered shop is still authorized. */
export async function fetchRestoredShopAuth(
  shopDomain: string
): Promise<RestoredShopAuth | null> {
  const status = await api.getShopStatus(shopDomain);
  if (!status.authorized) return null;

  const domain = status.shopDomain ?? shopDomain;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SHOP_STORAGE_KEY, domain);
  }

  return {
    name: normalizeShopApiName(status.shopName ?? "") || shopApiNameFromDomain(domain),
    domain,
    authorizedAt: fmtAuthorizedAt(status.authorizedAt),
    productCount: status.productCount ?? 0,
  };
}