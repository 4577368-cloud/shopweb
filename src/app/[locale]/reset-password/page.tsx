"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { authApi } from "@/lib/auth/api";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";

function ResetPasswordForm() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();

  const tokenFromUrl = params.get("token") ?? "";

  const [resetToken, setResetToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordValid =
    newPassword.length >= 8 && newPassword === confirmPassword;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (newPassword !== confirmPassword) {
      setError(t("auth.errorConfirmMismatch"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword({
        resetToken: resetToken.trim(),
        newPassword,
      });
      // Success: all sessions revoked → must re-login.
      setDone(true);
      // Auto-redirect to /login after a brief pause so the user sees the
      // success state instead of an abrupt route change.
      setTimeout(() => {
        router.replace(localePath(locale, "/login"));
      }, 1500);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function errorMessage(err: unknown, tt: typeof t): string {
    if (err instanceof ApiError) {
      const code = (err as ApiError & { code?: string }).code;
      if (code === "INVALID_TOKEN") return tt("auth.errorResetTokenInvalid");
      if (code === "TOKEN_EXPIRED") return tt("auth.errorResetTokenExpired");
      if (code === "TOKEN_ALREADY_USED") return tt("auth.errorResetTokenUsed");
      if (code === "WEAK_PASSWORD") return tt("auth.errorWeakPassword");
      if (code === "INVALID_REQUEST") return tt("auth.errorResetTokenInvalid");
      if (err.status === 0) return tt("auth.errorNetwork");
      return tt("auth.errorUnknown");
    }
    return t("auth.errorUnknown");
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-[13px] leading-5 text-brand-accent">
          {t("auth.resetPasswordSuccess")}
        </p>
        <p className="text-[12px] leading-4 text-muted-foreground">
          {t("auth.resetPasswordRedirecting")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {tokenFromUrl ? null : (
        <Field label={t("auth.fieldResetToken")} hint={t("auth.fieldResetTokenHint")}>
          <Input
            type="text"
            required
            autoComplete="off"
            value={resetToken}
            onChange={(e) => setResetToken(e.target.value)}
            disabled={submitting}
            placeholder={t("auth.fieldResetTokenPlaceholder")}
          />
        </Field>
      )}

      <Field label={t("auth.fieldNewPassword")} hint={t("auth.passwordHint")}>
        <Input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={submitting}
          autoFocus={!tokenFromUrl}
        />
      </Field>

      <Field label={t("auth.fieldConfirmPassword")}>
        <Input
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={submitting}
        />
        {confirmPassword.length > 0 && newPassword !== confirmPassword ? (
          <p className="mt-1 text-[10px] text-destructive">
            {t("auth.errorConfirmMismatch")}
          </p>
        ) : null}
      </Field>

      {error ? (
        <p className="text-[12px] leading-4 text-destructive">{error}</p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="md"
        className="w-full"
        disabled={submitting || !passwordValid}
      >
        {submitting
          ? t("auth.resetPasswordSubmitting")
          : t("auth.resetPasswordSubmit")}
      </Button>

      <p className="text-center text-[12px] text-muted-foreground">
        {t("auth.rememberPassword")}{" "}
        <Link
          href={localePath(locale, "/login")}
          className="font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
        >
          {t("auth.loginLink")}
        </Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useT();
  const locale = useLocale();

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-app-shell px-4 py-10">
      <div className="w-full max-w-[380px] space-y-6">
        <header className="flex flex-col items-center text-center">
          <AppLogo variant="header" size="lg" href={localePath(locale, "/")} />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
            {t("auth.resetPasswordTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("auth.resetPasswordSubtitle")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
