"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X } from "@/lib/ui/icons";
import { useAuth } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";

type AuthMode = "login" | "register";

interface AuthPanelProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  /** 登录/注册成功后的跳转路径（含 locale 前缀）。 */
  redirectAfterSuccess?: string;
}

/**
 * 右侧登录/注册面板。
 * 复用 useAuth().login / register，错误码复用 auth.* i18n。
 * 登录/注册成功后 router.replace 到工作台入口（由父组件传入 redirectAfterSuccess）。
 */
export function AuthPanel({
  mode,
  onModeChange,
  onClose,
  redirectAfterSuccess,
}: AuthPanelProps) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { login, register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({ email: email.trim(), password });
      } else {
        await register({ name: name.trim(), email: email.trim(), password });
      }
      const target = redirectAfterSuccess ?? localePath(locale, "/authorize");
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: { id: AuthMode; label: string }[] = [
    { id: "login", label: t("landing.authTabLogin") },
    { id: "register", label: t("landing.authTabRegister") },
  ];

  return (
    <div className="landing-auth-panel relative flex h-full w-full flex-col">
      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-[--landing-text-muted] transition hover:bg-white/5 hover:text-[--landing-text]"
        aria-label={t("landing.authClose")}
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-8 py-12">
        <div className="mx-auto w-full max-w-[340px]">
          {/* Tab 切换 */}
          <div className="relative mb-8 flex gap-6 border-b border-[--landing-border]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onModeChange(tab.id);
                  setError(null);
                }}
                className="relative pb-3 text-sm font-medium transition"
                style={{
                  color: mode === tab.id ? "var(--landing-cyan)" : "var(--landing-text-muted)",
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

          {/* 标题 */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[--landing-text]">
              {mode === "login" ? t("landing.authLoginTitle") : t("landing.authRegisterTitle")}
            </h2>
            <p className="mt-1 text-xs text-[--landing-text-muted]">
              {mode === "login" ? t("landing.authLoginSubtitle") : t("landing.authRegisterSubtitle")}
            </p>
          </div>

          {/* 表单 */}
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
                  disabled={submitting}
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
                autoComplete={mode === "login" ? "email" : "email"}
                autoFocus={mode === "login"}
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
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
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={8}
                placeholder={t("auth.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="landing-input w-full px-3 py-2 text-sm"
              />
            </div>

            {mode === "login" ? (
              <div className="flex justify-end">
                <Link
                  href={localePath(locale, "/forgot-password")}
                  className="text-[11px] font-medium text-[--landing-cyan] hover:underline"
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
              disabled={submitting}
              className="landing-btn-primary w-full rounded-[var(--radius-control)] py-2.5 text-sm font-semibold"
            >
              {submitting
                ? t(mode === "login" ? "auth.loginSubmitting" : "auth.registerSubmitting")
                : t(mode === "login" ? "auth.loginSubmit" : "auth.registerSubmit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
