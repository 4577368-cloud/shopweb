/**
 * Obtain Shopify session idToken (App Bridge 4) and exchange for Tangbuy Bearer JWT.
 * On NEED_OAUTH, kicks off login-free embedded install (top-level redirect).
 */

import {
  clearEmbeddedAccessToken,
  getEmbeddedAccessToken,
  isEmbeddedAccessTokenExpiredOrMissing,
  setEmbeddedAccessToken,
} from "@/host/embedded/session-token-store";
import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { openExternal } from "@/host/adapters/external-link";

export type SessionTokenExchangeResult =
  | { ok: true; shopDomain: string; shopName: string }
  | { ok: false; code: string; message: string; shopDomain?: string };

/**
 * App Bridge CDN is injected on mount, so the first exchange can run before
 * `window.shopify` exists. Wait briefly instead of reporting a false failure.
 */
async function waitForAppBridge(timeoutMs = 4000): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof window.shopify?.idToken === "function") return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return typeof window.shopify?.idToken === "function";
}

async function readShopifyIdToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!(await waitForAppBridge())) return null;
  try {
    // shopify.idToken() can hang forever if App Bridge never finishes handshake —
    // that used to freeze the install "读取中…" gate indefinitely.
    const token = await Promise.race([
      window.shopify!.idToken!(),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 4000);
      }),
    ]);
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

/** Top-level navigate to login-free OAuth (consent cannot run inside the iframe). */
export function launchEmbeddedInstall(shopDomain: string, host?: string): void {
  if (typeof window === "undefined") return;
  const shop = shopDomain.trim();
  if (!shop) return;
  const q = new URLSearchParams();
  q.set("shop", shop);
  if (host?.trim()) q.set("host", host.trim());
  const path = `/api/plugin/shopify/auth/install-embedded?${q.toString()}`;
  // Absolute URL required when assigning window.top from the Admin iframe.
  openExternal(`${window.location.origin}${path}`, { newTab: false });
}

export type ExchangeSessionTokenOptions = {
  /**
   * When session exchange returns NEED_OAUTH, top-level navigate to install-embedded.
   * Default true (App Bridge bootstrap / App Store first open).
   * Install-page gates should pass false so a failed probe does not re-fire OAuth.
   */
  launchOauthOnNeed?: boolean;
};

export async function exchangeSessionToken(
  force = false,
  opts?: ExchangeSessionTokenOptions
): Promise<SessionTokenExchangeResult> {
  const launchOauthOnNeed = opts?.launchOauthOnNeed !== false;
  const mode = readEmbeddedMode();
  if (!mode.isEmbedded) {
    return { ok: false, code: "NOT_EMBEDDED", message: "Not in embedded mode" };
  }
  if (!force && !isEmbeddedAccessTokenExpiredOrMissing()) {
    const { getEmbeddedShopDomain } = await import(
      "@/host/embedded/session-token-store"
    );
    return {
      ok: true,
      shopDomain: getEmbeddedShopDomain() || mode.shop || "",
      shopName: "",
    };
  }

  const sessionToken = await readShopifyIdToken();
  if (!sessionToken) {
    return {
      ok: false,
      code: "NO_SHOPIFY_TOKEN",
      message: "Shopify App Bridge idToken unavailable",
    };
  }

  try {
    const res = await fetch("/api/plugin/shopify/auth/session-token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "omit",
      body: JSON.stringify({ sessionToken }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      accessToken?: string;
      expiresIn?: number;
      shopDomain?: string;
      shopName?: string;
      email?: string;
      code?: string;
      message?: string;
    };
    if (!res.ok || !data.accessToken) {
      const code = data.code || `HTTP_${res.status}`;
      if (code === "SHOP_NOT_BOUND" || code === "NEED_OAUTH") {
        clearEmbeddedAccessToken();
        const shop = data.shopDomain || mode.shop;
        if (shop && launchOauthOnNeed) {
          launchEmbeddedInstall(shop, mode.host);
          return {
            ok: false,
            code: "NEED_OAUTH",
            message: "Redirecting to Shopify authorization…",
            shopDomain: shop,
          };
        }
        return {
          ok: false,
          code: "NEED_OAUTH",
          message: data.message || "Shop needs Shopify OAuth authorization first",
          shopDomain: shop,
        };
      }
      return {
        ok: false,
        code,
        message: data.message || "Session token exchange failed",
        shopDomain: data.shopDomain,
      };
    }
    setEmbeddedAccessToken(data.accessToken, {
      shopDomain: data.shopDomain,
      shopEmail: data.email,
      expiresInSeconds: data.expiresIn,
    });
    return {
      ok: true,
      shopDomain: data.shopDomain || mode.shop,
      shopName: data.shopName || "",
    };
  } catch (e) {
    return {
      ok: false,
      code: "NETWORK",
      message: e instanceof Error ? e.message : "Network error",
    };
  }
}

/** Ensure a valid embedded Bearer exists; returns false when exchange fails. */
export async function ensureEmbeddedAccessToken(): Promise<boolean> {
  if (!readEmbeddedMode().isEmbedded) return false;
  if (getEmbeddedAccessToken()) return true;
  const result = await exchangeSessionToken(true, { launchOauthOnNeed: false });
  return result.ok;
}
