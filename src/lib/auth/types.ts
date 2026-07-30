/**
 * User authentication & account types (P1 skeleton).
 *
 * Mirrors the backend `AuthDtos` shape from
 * `tangbuy-plugin/.../dto/auth/AuthDtos.java`. Keep field names in sync with
 * the server so the api-client can be a thin passthrough.
 */

/** Server-side user record returned by /me, /register, /login. */
export interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  currency: string;
  aiResponseLanguage: string;
  status: string;
}

/** Client-side auth lifecycle. `loading` is the initial bootstrap state. */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/** Error code returned by the backend (CustomException.code) when present. */
export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "INVALID_EMAIL"
  | "WEAK_PASSWORD"
  | "INVALID_NAME"
  | "WRONG_PASSWORD"
  | "SAME_PASSWORD"
  | "ACCOUNT_INACTIVE"
  | "USER_NOT_FOUND"
  | "UNAUTHENTICATED"
  | "NO_REFRESH_TOKEN"
  | "INVALID_REFRESH_TOKEN"
  | "EXPIRED_REFRESH_TOKEN"
  | "INVALID_TOKEN"
  | "TOKEN_EXPIRED"
  | "TOKEN_ALREADY_USED"
  | "INVALID_REQUEST"
  | (string & {});

export interface AuthError extends Error {
  status: number;
  code?: AuthErrorCode;
}

export interface RegisterPayload {
  email: string;
  password?: string;
  name: string;
  code?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/** Forgot-password request — email only. Backend always returns 200 (anti-enumeration). */
export interface ForgotPasswordPayload {
  email: string;
}

/**
 * Forgot-password response.
 *
 * In dev mode the backend returns the raw `resetToken` so the frontend can
 * redirect to /reset-password?token=… without sending email. In production
 * (after P7 mail integration) `resetToken` is null and the user must open
 * the link from their email inbox.
 */
export interface ForgotPasswordResponse {
  resetToken: string | null;
  expiresAt: string | null;
}

/** Reset-password request — token from email (or dev-mode response) + new password. */
export interface ResetPasswordPayload {
  resetToken: string;
  newPassword: string;
}

/** Reset-password response. On success all sessions are revoked → must re-login. */
export interface ResetPasswordResponse {
  success: boolean;
}
