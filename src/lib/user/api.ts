/**
 * User-center API client for `/api/plugin/user/**` (profile).
 *
 * Same auth strategy as auth/api.ts and api.ts: cookie or Bearer depending on Host,
 * with a single 401 → refresh → retry so a short-lived access cookie does not
 * falsely surface as “登录已失效” while the sidebar still shows the user.
 */

import { ApiError, refreshAccessCookie } from "@/lib/api";

const USER_BASE = "/api/plugin/user";

async function userRequest<T>(
  path: string,
  init?: RequestInit,
  retried = false
): Promise<T> {
  const url = path.startsWith("/") ? path : `${USER_BASE}/${path}`;

  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();

  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    ...auth.headers,
  };
  const initHeaders = init?.headers;
  if (initHeaders instanceof Headers) {
    initHeaders.forEach((value, key) => {
      mergedHeaders[key] = value;
    });
  } else if (Array.isArray(initHeaders)) {
    for (const [key, value] of initHeaders) mergedHeaders[key] = value;
  } else if (initHeaders) {
    Object.assign(mergedHeaders, initHeaders as Record<string, string>);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: init?.credentials ?? auth.credentials,
      headers: mergedHeaders,
    });
  } catch (cause) {
    throw new ApiError(`Network request failed: ${url}`, 0, cause);
  }

  if (res.status === 401 && !retried && typeof window !== "undefined") {
    const refreshed =
      (await strategy.refreshAfterUnauthorized()) ||
      (await refreshAccessCookie());
    if (refreshed) {
      return userRequest<T>(path, init, true);
    }
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

// ===== Profile =====

export interface UserProfile {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  currency: string;
  aiResponseLanguage: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UpdateProfilePayload {
  name?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  timezone?: string | null;
  currency?: string | null;
  aiResponseLanguage?: string | null;
}

export const userApi = {
  /** GET /profile — current user's profile (richer than /me, includes timestamps). */
  getProfile: () => userRequest<UserProfile>(`${USER_BASE}/profile`),

  /** PUT /profile — partial update; only non-null fields are written server-side. */
  updateProfile: (payload: UpdateProfilePayload) =>
    userRequest<UserProfile>(`${USER_BASE}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};
