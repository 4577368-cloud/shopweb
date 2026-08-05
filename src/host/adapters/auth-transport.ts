/**
 * Dual-track auth transport contract.
 *
 * - Standalone: Tangbuy platform token (`TANGBUY_TOKEN`) via Authorization
 * - Embedded: Shopify session token → backend exchange → short-lived API JWT (Bearer)
 *
 * Feature packages must not choose a strategy; {@link resolveAuthStrategy} / api client does.
 */

import { readEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import {
  clearEmbeddedAccessToken,
  getEmbeddedAccessToken,
} from "@/host/embedded/session-token-store";
import {
  ensureEmbeddedAccessToken,
  exchangeSessionToken,
} from "@/host/embedded/exchange-session-token";

export type AuthTransportKind = "cookie" | "session-token";

export interface AuthRequestHeaders {
  /** Extra headers to merge into fetch (e.g. Authorization). */
  headers: Record<string, string>;
  /** Fetch credentials mode. */
  credentials: RequestCredentials;
}

export interface AuthStrategy {
  readonly kind: AuthTransportKind;
  /** Build headers/credentials for an outgoing API call. */
  prepareRequest(): Promise<AuthRequestHeaders>;
  /** Attempt refresh after 401. Return true if the caller should retry once. */
  refreshAfterUnauthorized(): Promise<boolean>;
}

/** Cookie / standalone strategy — current production behavior. */
export const cookieAuthStrategy: AuthStrategy = {
  kind: "cookie",
  async prepareRequest() {
    const token = readCookie("TANGBUY_TOKEN");
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return {
      headers,
      credentials: "include",
    };
  },
  async refreshAfterUnauthorized() {
    const { refreshAccessCookie } = await import("@/lib/api");
    return refreshAccessCookie();
  },
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  return (
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

/** Session-token strategy for Admin iframe. */
export const sessionTokenAuthStrategy: AuthStrategy = {
  kind: "session-token",
  async prepareRequest() {
    await ensureEmbeddedAccessToken();
    const token = getEmbeddedAccessToken();
    if (!token) {
      return { headers: {} as Record<string, string>, credentials: "omit" as const };
    }
    return {
      headers: { Authorization: `Bearer ${token}` } as Record<string, string>,
      credentials: "omit" as const,
    };
  },
  async refreshAfterUnauthorized() {
    clearEmbeddedAccessToken();
    const result = await exchangeSessionToken(true, { launchOauthOnNeed: false });
    return result.ok;
  },
};

export function resolveAuthStrategy(isEmbedded: boolean): AuthStrategy {
  return isEmbedded ? sessionTokenAuthStrategy : cookieAuthStrategy;
}

/** Resolve strategy from live URL (non-React call sites). */
export function resolveAuthStrategyFromLocation(): AuthStrategy {
  return resolveAuthStrategy(readEmbeddedMode().isEmbedded);
}
