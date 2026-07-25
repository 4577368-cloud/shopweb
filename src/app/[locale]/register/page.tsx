"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      router.replace(localePath(locale, "/"));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const code = (err as ApiError & { code?: string }).code;
      if (code === "EMAIL_TAKEN") return t("auth.errorEmailTaken");
      if (code === "WEAK_PASSWORD") return t("auth.errorWeakPassword");
      if (code === "INVALID_EMAIL") return t("auth.errorInvalidEmail");
      if (err.status === 0) return t("auth.errorNetwork");
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
            {t("auth.registerTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("auth.registerSubtitle")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label={t("auth.nameLabel")}>
              <Input
                type="text"
                required
                autoComplete="name"
                autoFocus
                maxLength={128}
                placeholder={t("auth.namePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label={t("auth.emailLabel")}>
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </Field>
            <Field label={t("auth.passwordLabel")} hint={t("auth.passwordHint")}>
              <Input
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {submitting ? t("auth.registerSubmitting") : t("auth.registerSubmit")}
            </Button>

            <p className="text-center text-[12px] text-muted-foreground">
              {t("auth.loginPrompt")}{" "}
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
