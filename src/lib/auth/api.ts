/**
 * Auth API client for `/api/plugin/auth/**`.
 *
 * Standalone: httpOnly cookies (`tb_access` / `tb_refresh`) via credentials:include.
 * Embedded: same session-token Bearer strategy as business `api.ts` (no cookies).
 *
 * Register/login remain cookie flows (standalone marketing/login pages).
 */

import { ApiError } from "@/lib/api";
import type {
  ChangePasswordPayload,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  ResetPasswordResponse,
  User,
} from "./types";

/** Auth endpoints live under /api/plugin/auth, so they use the same-origin path. */
const AUTH_BASE = "/api/plugin/auth";

async function authRequest<T>(
  path: string,
  init?: RequestInit,
  opts?: { forceCookie?: boolean }
): Promise<T> {
  const url = path.startsWith("/") ? path : `${AUTH_BASE}/${path}`;

  let credentials: RequestCredentials = "include";
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (!opts?.forceCookie && typeof window !== "undefined") {
    const { resolveAuthStrategyFromLocation } = await import(
      "@/host/adapters/auth-transport"
    );
    const strategy = resolveAuthStrategyFromLocation();
    const auth = await strategy.prepareRequest();
    credentials = auth.credentials;
    Object.assign(headers, auth.headers);
  }

  const initHeaders = init?.headers;
  if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) headers[key] = value;
  } else if (initHeaders) {
    Object.assign(headers, initHeaders as Record<string, string>);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: init?.credentials ?? credentials,
      headers,
    });
  } catch (cause) {
    throw new ApiError(`Network request failed: ${url}`, 0, cause);
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    let message = `Request failed (${res.status}): ${url}`;
    let code: string | undefined;
    if (data && typeof data === "object" && data !== null) {
      const m = (data as { message?: unknown }).message;
      const c = (data as { code?: unknown }).code;
      if (typeof m === "string" && m.trim()) message = m;
      if (typeof c === "string" && c.trim()) code = c;
    }
    const err = new ApiError(message, res.status, data) as ApiError & {
      code?: string;
    };
    err.code = code;
    throw err;
  }

  // 204 No Content (logout, change-password) — return null.
  if (res.status === 204 || !data) return null as T;
  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface AuthResponse {
  user: User;
}

interface RefreshResponse {
  accessToken: string;
}

export const authApi = {
  /** POST /register — sets auth cookies, returns the new user. */
  register: (payload: RegisterPayload) =>
    authRequest<AuthResponse>(
      `${AUTH_BASE}/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { forceCookie: true }
    ),

  /** POST /login — sets auth cookies, returns the user. */
  login: (payload: LoginPayload) =>
    authRequest<AuthResponse>(
      `${AUTH_BASE}/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { forceCookie: true }
    ),

  /** POST /logout — clears cookies (standalone) or drops Bearer (embedded). */
  logout: async () => {
    if (typeof window !== "undefined") {
      const { resolveAuthStrategyFromLocation } = await import(
        "@/host/adapters/auth-transport"
      );
      const strategy = resolveAuthStrategyFromLocation();
      if (strategy.kind === "session-token") {
        const { clearEmbeddedAccessToken } = await import(
          "@/host/embedded/session-token-store"
        );
        clearEmbeddedAccessToken();
        return null;
      }
    }
    return authRequest<null>(
      `${AUTH_BASE}/logout`,
      { method: "POST" },
      { forceCookie: true }
    );
  },

  /** POST /refresh — cookie rotation (standalone only). Embedded re-exchanges session token. */
  refresh: async () => {
    if (typeof window !== "undefined") {
      const { resolveAuthStrategyFromLocation } = await import(
        "@/host/adapters/auth-transport"
      );
      const strategy = resolveAuthStrategyFromLocation();
      if (strategy.kind === "session-token") {
        const ok = await strategy.refreshAfterUnauthorized();
        if (!ok) {
          throw new ApiError("Embedded session refresh failed", 401);
        }
        return { accessToken: "" } satisfies RefreshResponse;
      }
    }
    return authRequest<RefreshResponse>(
      `${AUTH_BASE}/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { forceCookie: true }
    );
  },

  /** GET /me — cookie or Bearer depending on Host. */
  me: () => authRequest<User>(`${AUTH_BASE}/me`),

  /** POST /change-password — revokes all sessions; cookies are cleared server-side. */
  changePassword: (payload: ChangePasswordPayload) =>
    authRequest<null>(`${AUTH_BASE}/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /**
   * POST /forgot-password — public endpoint. Always returns 200 (anti-enumeration).
   * In dev mode the response carries `resetToken` so the frontend can redirect
   * to /reset-password directly; in production `resetToken` is null (sent via email).
   */
  forgotPassword: (payload: ForgotPasswordPayload) =>
    authRequest<ForgotPasswordResponse>(
      `${AUTH_BASE}/forgot-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { forceCookie: true }
    ),

  /**
   * POST /reset-password — public endpoint. Validates the reset token, changes
   * the password, and revokes ALL sessions. User must re-login after success.
   */
  resetPassword: (payload: ResetPasswordPayload) =>
    authRequest<ResetPasswordResponse>(
      `${AUTH_BASE}/reset-password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { forceCookie: true }
    ),
};
