"use client";

import { Lock } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
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
 * Password change is intentionally a Tangbuy-alignment placeholder: login already
 * uses Tangbuy credentials, but change/forgot gateway paths are not wired yet.
 */
export default function AccountSecurityPage() {
  const t = useT();
  const locale = useLocale();
  const { showToast } = useOnboarding();
  const { status, bootstrapping } = useUser();
  const { isEmbedded } = useEmbeddedMode();

  const showTangbuyPasswordPlaceholder = () => {
    showToast(t("accountSecurity.tangbuyPasswordApiNeeded"));
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
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground/80">
              {t("accountSecurity.passwordPlaceholderHint")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={showTangbuyPasswordPlaceholder}>
            {t("accountSecurity.changePassword")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={showTangbuyPasswordPlaceholder}
          >
            {t("accountSecurity.forgotPassword")}
          </Button>
        </div>
      </AccountCard>
    </section>
  );
}
