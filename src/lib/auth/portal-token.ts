/**
 * Resolve the current Tangbuy portal JWT for mall gateway calls
 * (allSubScriptionSearch / itemGet / estimate / …).
 *
 * Same model as dropshipping.tangbuy.cc: per-login-user Bearer, not a fixed env secret.
 *
 * Resolution order:
 * 1. Embedded Admin — in-memory platform token from session-token exchange
 * 2. Standalone — `TANGBUY_TOKEN` cookie (newLogin / platform login)
 * 3. Embedded handoff — localStorage copy written before Admin iframe open
 */

import { getEmbeddedAccessToken } from "@/host/embedded/session-token-store";
import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { TANGBUY_TOKEN_HANDOFF_KEY } from "@/lib/shopify-install";

export const PORTAL_TOKEN_COOKIE = "TANGBUY_TOKEN";

const LOGIN_REQUIRED_MSG = "请先登录 Tangbuy 账号";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function readHandoffToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(TANGBUY_TOKEN_HANDOFF_KEY)?.trim();
    return v || null;
  } catch {
    return null;
  }
}

/** Current portal JWT, or null when the user is not logged into Tangbuy. */
export function getPortalMallToken(): string | null {
  if (typeof window === "undefined") return null;

  if (readEmbeddedMode().isEmbedded) {
    const embedded = getEmbeddedAccessToken()?.trim();
    if (embedded) return embedded;
    const handoff = readHandoffToken();
    if (handoff) return handoff;
  }

  const cookie = readCookie(PORTAL_TOKEN_COOKIE)?.trim();
  if (cookie) return cookie;

  // Standalone may still have a handoff remnant after Shopify install.
  return readHandoffToken();
}

/** True when browser-side mall/catalog/estimate can call tangbuy.cc as this user. */
export function hasPortalMallToken(): boolean {
  return Boolean(getPortalMallToken());
}

/** Require portal JWT or throw a user-facing login error. */
export function requirePortalMallToken(): string {
  const token = getPortalMallToken();
  if (!token) {
    throw new Error(LOGIN_REQUIRED_MSG);
  }
  return token;
}

/**
 * Server / Route Handler: prefer the caller's Authorization or TANGBUY_TOKEN cookie.
 * Does not fall back to a shared env mall token.
 */
export function resolvePortalTokenFromRequest(request: {
  headers: Headers;
}): string | null {
  const auth = request.headers.get("authorization")?.trim();
  if (auth && auth.length > 7 && auth.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)TANGBUY_TOKEN=([^;]*)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1].trim()) || null;
  } catch {
    return match[1].trim() || null;
  }
}
