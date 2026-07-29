"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useHubFeatureFlag } from "@/lib/hub/feature-flag";

/**
 * Soft gate for hub-era routes (order-center).
 * Unlock: NEXT_PUBLIC_HUB_ENABLED=true, or localStorage tb_hub_enabled=true
 * (dev defaults on). Does not require the old operationsHubReady binding threshold.
 */
export function HubRouteGate({ children }: { children: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { isAuthorized } = useOnboarding();
  const { enabled: hubEnabled } = useHubFeatureFlag();

  const fallback = localePath(
    locale,
    !isAuthorized ? "/authorize" : "/products"
  );

  useEffect(() => {
    if (hubEnabled) return;
    router.replace(fallback);
  }, [hubEnabled, fallback, router]);

  if (!hubEnabled) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-ink-muted">
        <p>{t("sidebar.hubUnavailable")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
