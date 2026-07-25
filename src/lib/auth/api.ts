/**
 * Auth API client for `/api/plugin/auth/**`.
 *
 * Uses the same-origin path (Next.js rewrites proxy to tangbuy-plugin) so cookies
 * flow automatically. `credentials: "include"` is set explicitly to remain correct
 * if the deployment ever goes cross-origin.
 *
 * The backend sets httpOnly cookies `tb_access` and `tb_refresh`; the client never
 * reads them — it only reads the `{ user }` JSON body returned by register/login/me.
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
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("/") ? path : `${AUTH_BASE}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
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
    authRequest<AuthResponse>(`${AUTH_BASE}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /login — sets auth cookies, returns the user. */
  login: (payload: LoginPayload) =>
    authRequest<AuthResponse>(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /logout — clears cookies server-side. Idempotent; safe to call when unauthenticated. */
  logout: () =>
    authRequest<null>(`${AUTH_BASE}/logout`, {
      method: "POST",
    }),

  /** POST /refresh — rotates the access cookie. Returns the new access token (rarely needed client-side). */
  refresh: () =>
    authRequest<RefreshResponse>(`${AUTH_BASE}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }),

  /** GET /me — current user. 401 means the access cookie is missing/expired; try /refresh. */
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
    authRequest<ForgotPasswordResponse>(`${AUTH_BASE}/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /**
   * POST /reset-password — public endpoint. Validates the reset token, changes
   * the password, and revokes ALL sessions. User must re-login after success.
   */
  resetPassword: (payload: ResetPasswordPayload) =>
    authRequest<ResetPasswordResponse>(`${AUTH_BASE}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};
