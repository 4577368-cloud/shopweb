"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";

/**
 * Forgot-password page — Tangbuy alignment placeholder until gateway paths land.
 */
export default function ForgotPasswordPage() {
  const t = useT();
  const locale = useLocale();
  const { showToast } = useOnboarding();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    showToast(t("auth.tangbuyPasswordApiNeeded"));
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
            {t("auth.forgotPasswordPlaceholderHint")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t("auth.emailLabel")}>
              <Input
                type="email"
                required
                autoComplete="email"
                autoFocus
                placeholder={t("auth.emailPlaceholder")}
              />
            </Field>

            <Button type="submit" variant="primary" size="md" className="w-full">
              {t("auth.forgotPasswordSubmit")}
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
        </div>
      </div>
    </main>
  );
}
