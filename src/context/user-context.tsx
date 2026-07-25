"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, registerRefreshHandler } from "@/lib/api";
import { authApi } from "@/lib/auth/api";
import type {
  AuthError,
  AuthStatus,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  User,
} from "@/lib/auth/types";

interface UserContextValue {
  user: User | null;
  status: AuthStatus;
  error: AuthError | null;
  /** True only during the initial bootstrap /me call. Use to gate app render. */
  bootstrapping: boolean;
  register: (payload: RegisterPayload) => Promise<User>;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (payload: ChangePasswordPayload) => Promise<void>;
  /** Force-refresh the current user from /me (auto-refreshes access cookie on 401). */
  refreshUser: () => Promise<User | null>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<AuthError | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  /**
   * Dedupes concurrent refresh attempts. While non-null, callers await the same promise
   * so a burst of 401s (e.g. multiple parallel API calls failing at once) results in
   * exactly one /refresh round-trip.
   */
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);

  /**
   * Exchange the refresh cookie for a new access cookie. Returns true on success,
   * false on failure. Never throws — callers treat `false` as "session ended".
   *
   * Idempotent: the backend does not rotate the refresh token itself, so multiple
   * successful refreshes within a short window are safe.
   */
  const refreshAccess = useCallback(async (): Promise<boolean> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const p = (async () => {
      try {
        await authApi.refresh();
        return true;
      } catch {
        return false;
      } finally {
        // Clear immediately after resolution. Concurrent callers that arrived
        // while this was in-flight already hold the same promise reference;
        // later callers should issue a fresh refresh (the previous one is done).
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = p;
    return p;
  }, []);

  // P2.1: register this dedup-aware refresh as the app-wide handler so api.ts's 401
  // auto-retry (in lib/api.ts requestWithRetry) shares the same in-flight /refresh.
  // Without this, a burst of 401s from both /me and business APIs could fire two
  // concurrent /refresh calls. Registered once on mount; refreshAccess is stable
  // (useCallback with [] deps).
  useEffect(() => {
    registerRefreshHandler(refreshAccess);
  }, [refreshAccess]);

  /**
   * Fetch the current user from /me. On 401, tries /refresh once then retries /me.
   * Non-401 errors (network/500) propagate to the caller — status is NOT downgraded
   * so transient failures don't log the user out.
   */
  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const u = await authApi.me();
      setUser(u);
      setStatus("authenticated");
      setError(null);
      return u;
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
      const ok = await refreshAccess();
      if (!ok) {
        setUser(null);
        setStatus("unauthenticated");
        return null;
      }
      try {
        const u = await authApi.me();
        setUser(u);
        setStatus("authenticated");
        setError(null);
        return u;
      } catch {
        setUser(null);
        setStatus("unauthenticated");
        return null;
      }
    }
  }, [refreshAccess]);

  // Bootstrap on mount. Effect only runs in the browser, so this is SSR-safe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshUser();
      } catch {
        // Network error during bootstrap — mark unauthenticated so the UI can
        // show the login page and retry on next user action.
        if (!cancelled) setStatus("unauthenticated");
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { user: u } = await authApi.register(payload);
    setUser(u);
    setStatus("authenticated");
    setError(null);
    return u;
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const { user: u } = await authApi.login(payload);
    setUser(u);
    setStatus("authenticated");
    setError(null);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Even if the logout call fails (network), clear local state so the UI
      // reflects the signed-out intent. The cookie will eventually expire.
    }
    setUser(null);
    setStatus("unauthenticated");
    setError(null);
    refreshPromiseRef.current = null;
  }, []);

  const changePassword = useCallback(
    async (payload: ChangePasswordPayload) => {
      await authApi.changePassword(payload);
      // Backend revokes all sessions and clears cookies. Local state must follow:
      // the user must re-login on this device too.
      setUser(null);
      setStatus("unauthenticated");
      setError(null);
      refreshPromiseRef.current = null;
    },
    []
  );

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      status,
      error,
      bootstrapping,
      register,
      login,
      logout,
      changePassword,
      refreshUser,
    }),
    [
      user,
      status,
      error,
      bootstrapping,
      register,
      login,
      logout,
      changePassword,
      refreshUser,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/** Current user + auth status. Throws if used outside UserProvider. */
export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider");
  }
  return ctx;
}

/**
 * Auth actions (register/login/logout/changePassword/refreshUser).
 * Same value as useUser — exposed under a separate name for call-site clarity
 * (e.g. `const { login } = useAuth()` reads better than `useUser().login`).
 */
export function useAuth() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useAuth must be used within UserProvider");
  }
  return ctx;
}
