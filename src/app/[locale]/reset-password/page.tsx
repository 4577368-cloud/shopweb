"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { Suspense } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

function ResetPasswordForm() {
  const t = useT();
  const locale = useLocale();
  const { showToast } = useOnboarding();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    showToast(t("auth.tangbuyPasswordApiNeeded"));
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-[13px] leading-5 text-muted-foreground">
          {t("auth.forgotPasswordPlaceholderHint")}
        </p>
        <Button type="submit" variant="primary" size="md" className="w-full">
          {t("auth.resetPasswordSubmit")}
        </Button>
        <p className="text-center text-[12px] text-muted-foreground">
          <Link
            href={localePath(locale, "/login")}
            className="font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
          >
            {t("auth.backToLogin")}
          </Link>
        </p>
      </form>
    </div>
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
            {t("auth.forgotPasswordPlaceholderHint")}
          </p>
        </header>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
