/**
 * User-center API client for `/api/plugin/user/**` (profile).
 *
 * Same pattern as auth/api.ts and billing/api.ts: same-origin path so httpOnly
 * cookies flow automatically. Backend JwtAuthFilter protects this prefix; a
 * missing/expired access cookie returns 401 → api.ts 401-retry will refresh.
 */

import { ApiError } from "@/lib/api";

const USER_BASE = "/api/plugin/user";

async function userRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("/") ? path : `${USER_BASE}/${path}`;
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
