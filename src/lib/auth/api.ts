/**
 * Auth API client for `/api/plugin/auth/**`.
 *
 * Standalone: httpOnly cookies (`tb_access` / `tb_refresh`) via credentials:include.
 * Embedded: same session-token Bearer strategy as business `api.ts` (no cookies).
 *
 * Register/login remain cookie flows (standalone marketing/login pages).
 */

import { ApiError } from "@/lib/api";
import JSEncrypt from "jsencrypt";
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
const TANGBUY_GATEWAY_BASE = (
  process.env.NEXT_PUBLIC_TANGBUY_GATEWAY_BASE_URL ?? "https://tangbuy.cc/gateway"
).replace(/\/+$/, "");
const TOKEN_COOKIE = "TANGBUY_TOKEN";
const REFRESH_COOKIE = "TANGBUY_REFRESHTOKEN";

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

interface TangbuyResponse<T> {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
}

interface TangbuyTokenInfo {
  token: string;
  refreshToken?: string;
  authFlag?: boolean;
  account?: string;
}

interface TangbuyUserInfo {
  userId: number;
  email?: string;
  userName?: string;
  nickName?: string | null;
  avatar?: string | null;
  language?: string;
}

async function tangbuyRequest<T>(
  path: string,
  init?: RequestInit,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
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
    res = await fetch(`${TANGBUY_GATEWAY_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (cause) {
    throw new ApiError(`Network request failed: ${path}`, 0, cause);
  }
  const text = await res.text();
  const body = text ? safeJsonParse(text) : undefined;
  const data = body as TangbuyResponse<T> | undefined;
  if (!res.ok || (data?.code != null && data.code !== 0 && data.code !== 200)) {
    throw new ApiError(data?.msg || data?.message || `Request failed (${res.status})`, res.status || 400, body);
  }
  return data?.data as T;
}

function toUser(info: TangbuyUserInfo): User {
  const email = info.email ?? "";
  const name = info.nickName || info.userName || email || String(info.userId);
  return {
    id: info.userId,
    email,
    name,
    avatarUrl: info.avatar ?? null,
    locale: info.language ?? "en",
    timezone: "",
    currency: "USD",
    aiResponseLanguage: info.language ?? "en",
    status: "active",
  };
}

function setCookie(name: string, value: string, maxAge = 60 * 60 * 24 * 365) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  return raw ? decodeURIComponent(raw) : null;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

async function loginWithPlatform(payload: LoginPayload): Promise<AuthResponse> {
  const password = await encryptPlatformPassword(payload.password);
  const tokenInfo = await tangbuyRequest<TangbuyTokenInfo>(
    "/user/newLogin",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account: payload.email,
        password,
      }),
    }
  );
  if (!tokenInfo?.token || tokenInfo.authFlag) {
    throw new ApiError("Login requires additional verification", 401, tokenInfo);
  }
  setCookie(TOKEN_COOKIE, tokenInfo.token);
  if (tokenInfo.refreshToken) setCookie(REFRESH_COOKIE, tokenInfo.refreshToken);
  return { user: await currentPlatformUser(tokenInfo.token) };
}

async function encryptPlatformPassword(password: string): Promise<string> {
  const publicKey = await tangbuyRequest<string>("/user/pubkey", { method: "GET" });
  const jse = new JSEncrypt();
  jse.setPublicKey(publicKey);
  const encrypted = jse.encrypt(password);
  if (!encrypted) throw new ApiError("Password encryption failed", 400);
  return encrypted;
}

async function afterPlatformLogin(tokenInfo: TangbuyTokenInfo): Promise<AuthResponse> {
  if (!tokenInfo?.token || tokenInfo.authFlag) {
    throw new ApiError("Login requires additional verification", 401, tokenInfo);
  }
  setCookie(TOKEN_COOKIE, tokenInfo.token);
  if (tokenInfo.refreshToken) setCookie(REFRESH_COOKIE, tokenInfo.refreshToken);
  return { user: await currentPlatformUser(tokenInfo.token) };
}

async function currentPlatformUser(token = getCookie(TOKEN_COOKIE)): Promise<User> {
  if (!token) throw new ApiError("Unauthorized: login required", 401, { code: "UNAUTHENTICATED" });
  const info = await tangbuyRequest<TangbuyUserInfo>("/user/getUserInfo", { method: "GET" }, token);
  return toUser(info);
}

export const authApi = {
  exists: (email: string) =>
    tangbuyRequest<boolean>("/user/existUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: email }),
    }),

  sendRegisterCode: (email: string) =>
    tangbuyRequest<unknown>("/user/mail/smartCode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account: email, mailEnum: "REGISTER_CODE" }),
    }),

  /** POST /register — sets auth cookies, returns the new user. */
  register: async (payload: RegisterPayload) => {
    const tokenInfo = await tangbuyRequest<TangbuyTokenInfo>(
      "/user/h5Register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: payload.email,
          code: payload.code,
          userName: payload.name,
          language: "en",
        }),
      }
    );
    return afterPlatformLogin(tokenInfo);
  },

  /** POST /login — sets auth cookies, returns the user. */
  login: loginWithPlatform,

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
    clearCookie(TOKEN_COOKIE);
    clearCookie(REFRESH_COOKIE);
    return null;
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
  me: currentPlatformUser,

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
