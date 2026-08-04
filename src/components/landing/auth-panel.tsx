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
  SHOP_STORAGE_KEY,
} from "@/lib/shopify-install";
import { shopHandleFromDomain } from "@/components/shopify/shop-domain-connect-field";

type AuthMode = "login" | "register";
type AuthPhase = "form" | "submitting" | "success";
type EmailStep = "account" | "password" | "register";

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
  const { login, register, googleLogin, appleLogin } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [shopHandle, setShopHandle] = useState("");
  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(SHOP_STORAGE_KEY);
      if (remembered) setShopHandle(shopHandleFromDomain(remembered));
    } catch {
      // ignore localStorage failures
    }
  }, []);
  const [emailStep, setEmailStep] = useState<EmailStep>("account");
  const [phase, setPhase] = useState<AuthPhase>("form");
  const [error, setError] = useState<string | null>(null);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [shopifyBusy, setShopifyBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [successTarget, setSuccessTarget] = useState<string | null>(null);
  const [showManualContinue, setShowManualContinue] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);

  const busy = phase !== "form" || shopifyBusy || googleBusy || appleBusy;

  useEffect(() => {
    if (phase !== "success" || !successTarget) return;
    const timer = window.setTimeout(() => setShowManualContinue(true), 2500);
    return () => window.clearTimeout(timer);
  }, [phase, successTarget]);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCodeCooldown((current) => Math.max(0, current - 1)),
      1000
    );
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

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
      if (err.message && !err.message.startsWith("Request failed")) {
        return err.message;
      }
      return t("auth.errorUnknown");
    }
    return t("auth.errorUnknown");
  }

  function switchMode(nextMode: AuthMode) {
    onModeChange(nextMode);
    setError(null);
    setShopifyError(null);
    setEmailStep(nextMode === "register" ? "register" : "account");
  }

  async function continueWithEmail(trimmedEmail: string) {
    const exists = await authApi.exists(trimmedEmail);
    if (exists) {
      setEmailStep("password");
      return;
    }
    onModeChange("register");
    setEmailStep("register");
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
      if (mode === "login" && emailStep === "account") {
        await continueWithEmail(trimmedEmail);
        setPhase("form");
        return;
      }

      if (mode === "login") {
        await login({ email: trimmedEmail, password });
      } else {
        await register({
          name: trimmedName || trimmedEmail,
          email: trimmedEmail,
          code: code.trim(),
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

  async function onSendCode() {
    if (busy || codeCooldown > 0) return;
    setPhase("submitting");
    setError(null);
    setShopifyError(null);
    try {
      await authApi.sendRegisterCode(email.trim());
      setCodeCooldown(60);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
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

  async function onGoogleLogin() {
    if (busy) return;
    setGoogleBusy(true);
    setError(null);
    setShopifyError(null);
    try {
      await googleLogin();
      setPhase("success");
      const target = redirectAfterSuccess ?? localePath(locale, "/authorize");
      setSuccessTarget(target);
      window.location.assign(target);
    } catch (err) {
      setError(errorMessage(err));
      setPhase("form");
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onAppleLogin() {
    if (busy) return;
    setAppleBusy(true);
    setError(null);
    setShopifyError(null);
    try {
      await appleLogin(locale);
      setPhase("success");
      const target = redirectAfterSuccess ?? localePath(locale, "/authorize");
      setSuccessTarget(target);
      window.location.assign(target);
    } catch (err) {
      setError(errorMessage(err));
      setPhase("form");
    } finally {
      setAppleBusy(false);
    }
  }

  const modeTabs: { id: AuthMode; label: string }[] = [
    { id: "login", label: t("landing.authTabLogin") },
    { id: "register", label: t("landing.authTabRegister") },
  ];

  const showEmailPane = true;

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

      <div className="flex min-h-0 flex-1 flex-col justify-center px-8 py-10 lg:py-14">
        <div className="mx-auto w-full max-w-[340px]">
          <div className="relative mb-6 flex gap-6 border-b border-[--landing-border]">
            {modeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (busy) return;
                  switchMode(tab.id);
                }}
                disabled={busy}
                className="relative pb-3 text-sm font-medium transition disabled:opacity-60"
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

          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[--landing-text]">
              {mode === "login"
                ? t("landing.authLoginTitle")
                : t("landing.authRegisterTitle")}
            </h2>
            <p className="mt-1 text-xs text-[--landing-text-muted]">
              {mode === "login"
                ? t("landing.authLoginSubtitle")
                : t("landing.authRegisterSubtitle")}
            </p>
          </div>

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
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (mode === "login" && emailStep !== "account") {
                          setEmailStep("account");
                          setPassword("");
                          setCode("");
                        }
                      }}
                      disabled={busy}
                      className="landing-input w-full px-3 py-2 text-sm"
                    />
                  </div>

                  {mode === "register" ? (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[--landing-text-muted]">
                        Verification code
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="Email code"
                          value={code}
                          onChange={(e) => setCode(e.target.value)}
                          disabled={busy}
                          className="landing-input min-w-0 flex-1 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={onSendCode}
                          disabled={busy || !email.trim() || codeCooldown > 0}
                          className="inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[--landing-border] px-3 py-2 text-xs font-semibold text-[--landing-text] transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {codeCooldown > 0 ? `${codeCooldown}s` : "Send code"}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {mode === "login" && emailStep === "password" ? (
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
                  ) : null}

                  {mode === "login" && emailStep === "password" ? (
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
                      mode === "login" && emailStep === "account"
                        ? "Continue"
                        : t(
                            mode === "login"
                              ? "auth.loginSubmit"
                              : "auth.registerSubmit"
                          )
                    )}
                  </button>
                </form>
              ) : null}

              {mode === "login" ? (
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3 text-[11px] text-[--landing-text-muted]">
                    <span className="h-px flex-1 bg-[--landing-border]" />
                    <span>Third-party authorization</span>
                    <span className="h-px flex-1 bg-[--landing-border]" />
                  </div>
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
                    <span className="flex shrink-0 items-center border-l border-[--landing-border] bg-slate-50 px-2.5 text-[11px] font-medium text-[--landing-text-muted]">
                      {t("install.domainSuffix")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onShopifyLogin}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[--landing-border] bg-white px-3 py-2.5 text-sm font-semibold text-[--landing-text] transition hover:border-[--landing-accent] hover:bg-[--landing-accent-soft] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {shopifyBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span aria-hidden>Shopify</span>
                    )}
                    Continue with Shopify
                  </button>
                  <button
                    type="button"
                    onClick={onGoogleLogin}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[--landing-border] bg-white px-3 py-2.5 text-sm font-semibold text-[--landing-text] transition hover:border-[--landing-accent] hover:bg-[--landing-accent-soft] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {googleBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span aria-hidden className="font-bold text-[#4285f4]">G</span>
                    )}
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    onClick={onAppleLogin}
                    disabled={busy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[--landing-border] bg-white px-3 py-2.5 text-sm font-semibold text-[--landing-text] transition hover:border-[--landing-accent] hover:bg-[--landing-accent-soft] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {appleBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <span aria-hidden className="font-bold">Apple</span>
                    )}
                    Continue with Apple
                  </button>
                  {shopifyError ? (
                    <p className="text-xs leading-4 text-red-500">{shopifyError}</p>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
