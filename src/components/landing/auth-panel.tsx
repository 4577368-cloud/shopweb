"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, X } from "@/lib/ui/icons";
import { useAuth } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";
import { authApi } from "@/lib/auth/api";
import { markJustRegistered } from "@/lib/auth/just-registered";
import {
  adminAppDeepLink,
  launchShopifyLogin,
  rememberShopDomain,
  resolveInstallError,
} from "@/lib/shopify-install";

type AuthMode = "login" | "register";
type LoginMethod = "shopify" | "email";
type AuthPhase = "form" | "submitting" | "success";

interface AuthPanelProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  /** 登录/注册成功后的跳转路径（含 locale 前缀）。 */
  redirectAfterSuccess?: string;
}

/**
 * 右侧登录/注册面板。
 * 登录：Shopify | 邮箱 Tab（独立站主路径仍是 OAuth → cookie → 工作台）。
 * 注册：邮箱表单；可选 Shopify 快捷开通。
 * 嵌入式不挂载此面板。
 */
export function AuthPanel({
  mode,
  onModeChange,
  onClose,
  redirectAfterSuccess,
}: AuthPanelProps) {
  const t = useT();
  const locale = useLocale();
  const { login, register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopHandle, setShopHandle] = useState("");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("shopify");
  const [phase, setPhase] = useState<AuthPhase>("form");
  const [error, setError] = useState<string | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [successTarget, setSuccessTarget] = useState<string | null>(null);
  const [showManualContinue, setShowManualContinue] = useState(false);

  const busy = phase !== "form" || shopifyBusy;

  useEffect(() => {
    if (phase !== "success" || !successTarget) return;
    const timer = window.setTimeout(() => setShowManualContinue(true), 2500);
    return () => window.clearTimeout(timer);
  }, [phase, successTarget]);

  const adminHref = useMemo(
    () =>
      adminAppDeepLink(shopHandle, {
        localePath: localePath(locale, "/authorize"),
      }),
    [shopHandle, locale]
  );

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const code = (err as ApiError & { code?: string }).code;
      if (mode === "login") {
        if (code === "INVALID_CREDENTIALS" || code === "ACCOUNT_INACTIVE") {
          return t("auth.errorInvalidCredentials");
        }
      } else {
        if (code === "EMAIL_TAKEN") return t("auth.errorEmailTaken");
        if (code === "WEAK_PASSWORD") return t("auth.errorWeakPassword");
        if (code === "INVALID_EMAIL") return t("auth.errorInvalidEmail");
      }
      if (err.status === 0) return t("auth.errorNetwork");
      return t("auth.errorUnknown");
    }
    return t("auth.errorUnknown");
  }

  async function ensureSessionAfterRegister(payload: {
    email: string;
    password: string;
    name: string;
  }) {
    await register(payload);
    try {
      await authApi.me();
    } catch {
      await login({ email: payload.email, password: payload.password });
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setPhase("submitting");
    setError(null);
    setShopifyError(null);
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    try {
      if (mode === "login") {
        await login({ email: trimmedEmail, password });
      } else {
        await ensureSessionAfterRegister({
          name: trimmedName,
          email: trimmedEmail,
          password,
        });
        markJustRegistered();
      }
      setPhase("success");
      const target = redirectAfterSuccess ?? localePath(locale, "/authorize");
      setSuccessTarget(target);
      window.location.assign(target);
    } catch (err) {
      setError(errorMessage(err));
      setPhase("form");
    }
  }

  function onShopifyLogin() {
    if (busy) return;
    setShopifyError(null);
    setError(null);
    setShopifyBusy(true);
    const returnTo = redirectAfterSuccess ?? localePath(locale, "/products");
    const result = launchShopifyLogin(shopHandle, { returnTo });
    if (!result.ok) {
      setShopifyBusy(false);
      setShopifyError(
        resolveInstallError(t, result.errorCode, t("auth.shopifyLoginError"))
      );
    }
  }

  const modeTabs: { id: AuthMode; label: string }[] = [
    { id: "login", label: t("landing.authTabLogin") },
    { id: "register", label: t("landing.authTabRegister") },
  ];

  const methodTabs: { id: LoginMethod; label: string }[] = [
    { id: "shopify", label: t("auth.methodTabShopify") },
    { id: "email", label: t("auth.methodTabEmail") },
  ];

  const showShopifyPane = mode === "login" ? loginMethod === "shopify" : false;
  const showEmailPane =
    mode === "register" || (mode === "login" && loginMethod === "email");

  return (
    <div className="landing-auth-panel relative flex h-full w-full flex-col">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[--landing-text-muted] transition hover:bg-white/5 hover:text-[--landing-text]"
        aria-label={t("landing.authClose")}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col justify-start px-8 pb-8 pt-8 lg:px-9 lg:pt-9">
        <div className="mx-auto w-full max-w-[340px]">
          <div className="relative mb-5 flex gap-6 border-b border-[--landing-border]">
            {modeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (busy) return;
                  onModeChange(tab.id);
                  setError(null);
                  setShopifyError(null);
                }}
                disabled={busy}
                className="relative pb-2.5 text-sm font-medium transition disabled:opacity-60"
                style={{
                  color:
                    mode === tab.id
                      ? "var(--landing-cyan)"
                      : "var(--landing-text-muted)",
                }}
              >
                {tab.label}
                {mode === tab.id ? (
                  <motion.span
                    layoutId="landing-auth-tab"
                    className="landing-tab-indicator absolute inset-x-0 -bottom-px h-0.5"
                  />
                ) : null}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <h2 className="text-xl font-semibold text-[--landing-text]">
              {mode === "login"
                ? t("landing.authLoginTitle")
                : t("landing.authRegisterTitle")}
            </h2>
            <p className="mt-1 text-xs text-[--landing-text-muted]">
              {mode === "login"
                ? loginMethod === "shopify"
                  ? t("auth.shopifyLoginHint")
                  : t("landing.authLoginSubtitle")
                : t("landing.authRegisterSubtitle")}
            </p>
          </div>

          {mode === "login" && phase !== "success" ? (
            <div
              className="mb-5 grid grid-cols-2 gap-0.5 rounded-lg bg-slate-100 p-0.5"
              role="tablist"
              aria-label={t("auth.methodTablistAria")}
            >
              {methodTabs.map((tab) => {
                const active = loginMethod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setLoginMethod(tab.id);
                      setError(null);
                      setShopifyError(null);
                    }}
                    className={
                      active
                        ? "h-8 rounded-md bg-[#0f172a] px-3 text-xs font-semibold text-white shadow-sm transition"
                        : "h-8 rounded-md px-3 text-xs font-semibold text-[--landing-text-muted] transition hover:text-[--landing-text]"
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          {phase === "success" ? (
            <div
              className="flex flex-col items-center gap-3 rounded-[var(--radius-control)] border border-[--landing-border] bg-white/5 px-4 py-8 text-center"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 className="h-8 w-8 text-[--landing-cyan]" aria-hidden />
              <p className="text-sm font-medium text-[--landing-text]">
                {mode === "register"
                  ? t("auth.registerSuccessTitle")
                  : t("auth.loginSuccessTitle")}
              </p>
              <p className="text-xs leading-5 text-[--landing-text-muted]">
                {mode === "register"
                  ? t("auth.registerSuccessRedirecting")
                  : t("auth.loginSuccessRedirecting")}
              </p>
              <Loader2 className="mt-1 h-4 w-4 animate-spin text-[--landing-cyan]" aria-hidden />
              {showManualContinue && successTarget ? (
                <a
                  href={successTarget}
                  className="mt-2 text-xs font-medium text-[--landing-cyan] hover:underline"
                >
                  {t("auth.continueManually")}
                </a>
              ) : null}
            </div>
          ) : (
            <>
              {showShopifyPane ? (
                <div className="space-y-3">
                  <div className="flex overflow-hidden rounded-[var(--radius-control)] border border-[--landing-border]">
                    <input
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("auth.shopifyShopPlaceholder")}
                      value={shopHandle}
                      onChange={(e) => setShopHandle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          onShopifyLogin();
                        }
                      }}
                      disabled={busy}
                      aria-label={t("auth.shopifyShopAria")}
                      className="landing-input min-w-0 flex-1 rounded-none border-0 px-3 py-2 text-sm"
                    />
                    <span className="flex shrink-0 items-center border-l border-[--landing-border] bg-white/5 px-2.5 text-[11px] font-medium text-[--landing-text-muted]">
                      {t("install.domainSuffix")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onShopifyLogin}
                    disabled={busy}
                    className="landing-btn-primary inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] py-2.5 text-sm font-semibold"
                  >
                    {shopifyBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {t("auth.shopifyLoginSubmitting")}
                      </>
                    ) : (
                      t("auth.shopifyLoginSubmit")
                    )}
                  </button>
                  {shopifyError ? (
                    <p className="text-xs leading-4 text-red-400">{shopifyError}</p>
                  ) : null}
                  {adminHref ? (
                    <p className="text-center text-[11px] leading-4 text-[--landing-text-muted]">
                      <a
                        href={adminHref}
                        className="font-medium text-[--landing-cyan] hover:underline"
                        onClick={() => {
                          rememberShopDomain(shopHandle);
                        }}
                      >
                        {t("auth.openInShopifyAdmin")}
                      </a>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {showEmailPane ? (
                <form onSubmit={onSubmit} className="space-y-4">
                  {mode === "register" ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[--landing-text-muted]">
                        {t("auth.nameLabel")}
                      </label>
                      <input
                        type="text"
                        required
                        autoComplete="name"
                        autoFocus
                        maxLength={128}
                        placeholder={t("auth.namePlaceholder")}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={busy}
                        className="landing-input w-full px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[--landing-text-muted]">
                      {t("auth.emailLabel")}
                    </label>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      autoFocus={mode === "login"}
                      placeholder={t("auth.emailPlaceholder")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      className="landing-input w-full px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[--landing-text-muted]">
                      {t("auth.passwordLabel")}
                    </label>
                    <input
                      type="password"
                      required
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      minLength={8}
                      placeholder={t("auth.passwordPlaceholder")}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      className="landing-input w-full px-3 py-2 text-sm"
                    />
                  </div>

                  {mode === "login" ? (
                    <div className="flex justify-end">
                      <Link
                        href={localePath(locale, "/forgot-password")}
                        className="text-[11px] font-medium text-[--landing-cyan] hover:underline"
                        tabIndex={busy ? -1 : undefined}
                      >
                        {t("auth.forgotPasswordLink")}
                      </Link>
                    </div>
                  ) : null}

                  {error ? (
                    <p className="text-xs leading-4 text-red-400">{error}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={busy}
                    className="landing-btn-primary inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] py-2.5 text-sm font-semibold"
                  >
                    {phase === "submitting" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        {t(
                          mode === "login"
                            ? "auth.loginSubmitting"
                            : "auth.registerSubmitting"
                        )}
                      </>
                    ) : (
                      t(
                        mode === "login"
                          ? "auth.loginSubmit"
                          : "auth.registerSubmit"
                      )
                    )}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
