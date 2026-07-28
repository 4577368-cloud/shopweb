"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Lock,
  ShieldCheck,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useOnboarding } from "@/context/onboarding-context";
import { useUser } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import {
  AccountCard,
  AccountLoadingState,
  AccountPageHeader,
  AccountSignInState,
} from "@/components/account/account-primitives";

/**
 * Account → Security.
 *
 * Change password — calls /api/plugin/auth/change-password. The backend
 * revokes ALL sessions on success (including the current one) and clears
 * cookies, so after a successful change we toast and redirect to /login.
 */
export default function AccountSecurityPage() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useOnboarding();
  const { status, bootstrapping, changePassword } = useUser();
  const { isEmbedded } = useEmbeddedMode();

  // ===== Change password state =====
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordValid =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    newPassword !== currentPassword;

  const handlePasswordChange = async () => {
    if (!passwordValid || changingPassword) return;
    if (newPassword !== confirmPassword) {
      setPasswordError(t("accountSecurity.errorConfirmMismatch"));
      return;
    }
    setChangingPassword(true);
    setPasswordError(null);
    try {
      // changePassword revokes all sessions server-side and clears cookies.
      // UserProvider sets status to unauthenticated automatically.
      await changePassword({
        currentPassword,
        newPassword,
      });
      // Surface a toast BEFORE the redirect so the user understands why they
      // are being sent to /login (otherwise it looks like an auth failure).
      showToast(t("accountSecurity.toastPasswordChanged"));
      // Wait briefly so the toast is visible before the route changes.
      setTimeout(() => {
        if (isEmbedded) {
          router.replace(localePath(locale, "/authorize"));
          return;
        }
        const from = encodeURIComponent("/account/security");
        router.replace(localePath(locale, `/login?from=${from}`));
      }, 1200);
    } catch (err) {
      setPasswordError(readError(err, t));
    } finally {
      setChangingPassword(false);
    }
  };

  if (bootstrapping) {
    return <AccountLoadingState message={t("common.loading")} />;
  }

  if (status !== "authenticated") {
    return (
      <AccountSignInState
        icon={<Lock className="h-4 w-4 text-muted-foreground" />}
        message={t("accountSecurity.signInRequired")}
        signInLabel={t("userMenu.signIn")}
        signInHref={localePath(locale, `/login?from=${encodeURIComponent("/account/security")}`)}
        hideSignIn={isEmbedded}
      />
    );
  }

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("accountSecurity.title")}
        subtitle={t("accountSecurity.subtitle")}
      />

      <AccountCard>
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-foreground">
              {t("accountSecurity.sectionPassword")}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {t("accountSecurity.passwordHint")}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:max-w-md">
          <Field label={t("accountSecurity.fieldCurrent")} labelHtmlFor="pwd-current">
            <Input
              id="pwd-current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={changingPassword}
            />
          </Field>
          <Field label={t("accountSecurity.fieldNew")} labelHtmlFor="pwd-new">
            <Input
              id="pwd-new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={changingPassword}
              placeholder={t("accountSecurity.fieldNewPlaceholder")}
            />
            {newPassword.length > 0 && newPassword.length < 8 ? (
              <p className="mt-1 text-[10px] text-amber-600">
                {t("accountSecurity.errorWeak")}
              </p>
            ) : null}
          </Field>
          <Field label={t("accountSecurity.fieldConfirm")} labelHtmlFor="pwd-confirm">
            <Input
              id="pwd-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={changingPassword}
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword ? (
              <p className="mt-1 text-[10px] text-destructive">
                {t("accountSecurity.errorConfirmMismatch")}
              </p>
            ) : null}
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handlePasswordChange()}
              disabled={!passwordValid || changingPassword}
            >
              {changingPassword ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {t("accountSecurity.changePassword")}
            </Button>

            {passwordError ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                {passwordError}
              </span>
            ) : null}
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground/80">
            {t("accountSecurity.passwordSideEffect")}
          </p>
        </div>
      </AccountCard>
    </section>
  );
}

// ===== Helpers =====

function readError(err: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (err instanceof ApiError) {
    const code = (err as ApiError & { code?: string }).code;
    if (err.status === 0) return t("auth.errorNetwork");
    if (err.status === 401) return t("accountSecurity.errorUnauthenticated");
    if (code === "WRONG_PASSWORD") return t("accountSecurity.errorWrongPassword");
    if (code === "SAME_PASSWORD") return t("accountSecurity.errorSamePassword");
    if (code === "WEAK_PASSWORD") return t("accountSecurity.errorWeak");
    return t("auth.errorUnknown");
  }
  return t("auth.errorUnknown");
}
