"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authApi } from "@/lib/auth/api";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Forgot-password page.
 *
 * Flow:
 *   1. User enters email → POST /api/plugin/auth/forgot-password.
 *   2. Backend always returns 200 (anti-enumeration).
 *   3. In dev mode the response carries `resetToken` → redirect directly to
 *      /reset-password?token=… so the flow can be tested without email.
 *   4. In production `resetToken` is null → show "check your inbox" message.
 *
 * The page is public (not in PROTECTED_PREFIXES of proxy.ts).
 */
export default function ForgotPasswordPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await authApi.forgotPassword({ email: email.trim() });
      // Dev mode: backend returns the raw resetToken → skip email, go straight
      // to the reset page. Production: resetToken is null → show inbox message.
      if (resp.resetToken) {
        const target = localePath(
          locale,
          `/reset-password?token=${encodeURIComponent(resp.resetToken)}`
        );
        router.replace(target);
        return;
      }
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function errorMessage(err: unknown, tt: typeof t): string {
    if (err instanceof ApiError) {
      const code = (err as ApiError & { code?: string }).code;
      if (code === "INVALID_EMAIL") return tt("auth.errorInvalidEmail");
      if (err.status === 0) return tt("auth.errorNetwork");
      return err.message;
    }
    return t("auth.errorUnknown");
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-app-shell px-4 py-10">
      <div className="w-full max-w-[380px] space-y-6">
        <header className="flex flex-col items-center text-center">
          <AppLogo variant="header" size="lg" href={localePath(locale, "/")} />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
            {t("auth.forgotPasswordTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("auth.forgotPasswordSubtitle")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-[13px] leading-5 text-muted-foreground">
                {t("auth.forgotPasswordSent")}
              </p>
              <Link
                href={localePath(locale, "/login")}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-control)] bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
              >
                {t("auth.backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label={t("auth.emailLabel")}>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </Field>

              {error ? (
                <p className="text-[12px] leading-4 text-destructive">{error}</p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={submitting}
              >
                {submitting
                  ? t("auth.forgotPasswordSubmitting")
                  : t("auth.forgotPasswordSubmit")}
              </Button>

              <p className="text-center text-[12px] text-muted-foreground">
                {t("auth.rememberPassword")}{" "}
                <Link
                  href={localePath(locale, "/login")}
                  className={cn(
                    "font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
                  )}
                >
                  {t("auth.loginLink")}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
