"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AppLogo } from "@/components/brand/app-logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuth } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function LoginForm() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = params.get("from");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      // On success, navigate to the original page or home.
      const target = from && from.startsWith("/") ? from : localePath(locale, "/");
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  function errorMessage(err: unknown, tt: typeof t): string {
    if (err instanceof ApiError) {
      const code = (err as ApiError & { code?: string }).code;
      if (code === "INVALID_CREDENTIALS" || code === "ACCOUNT_INACTIVE") {
        return tt("auth.errorInvalidCredentials");
      }
      if (err.status === 0) return tt("auth.errorNetwork");
      return err.message;
    }
    return t("auth.errorUnknown");
  }

  return (
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
      <Field label={t("auth.passwordLabel")}>
        <Input
          type="password"
          required
          autoComplete="current-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </Field>

      <div className="flex justify-end">
        <Link
          href={localePath(locale, "/forgot-password")}
          className="text-[11px] font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
        >
          {t("auth.forgotPasswordLink")}
        </Link>
      </div>

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
        {submitting ? t("auth.loginSubmitting") : t("auth.loginSubmit")}
      </Button>

      <p className="text-center text-[12px] text-muted-foreground">
        {t("auth.registerPrompt")}{" "}
        <Link
          href={localePath(locale, "/register")}
          className={cn(
            "font-medium text-link underline-offset-4 hover:text-link-hover hover:underline"
          )}
        >
          {t("auth.registerLink")}
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  const t = useT();
  const locale = useLocale();

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-app-shell px-4 py-10">
      <div className="w-full max-w-[380px] space-y-6">
        <header className="flex flex-col items-center text-center">
          <AppLogo variant="header" size="lg" href={localePath(locale, "/")} />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
            {t("auth.loginTitle")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("auth.loginSubtitle")}
          </p>
        </header>

        <div className="rounded-[var(--radius-card)] border border-surface-border bg-surface p-5 shadow-card">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
