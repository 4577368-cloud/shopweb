"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useHubFeatureFlag } from "@/lib/hub/feature-flag";

/**
 * Blocks 运营中枢 routes until 商品货源关联 ≥80% 且用户显式开启 Hub 开关。
 * 开关默认关闭，可在 账户 → 安全设置 中开启。
 *
 * 未解锁时不要把 URL 留在 /operations-center（刷新会像「被跳到运营中心」）；
 * 导回授权或选品第一步。
 */
export function HubRouteGate({ children }: { children: ReactNode }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const { isAuthorized, operationsHubReady } = useOnboarding();
  const { enabled: hubEnabled } = useHubFeatureFlag();

  const blocked = !hubEnabled || !operationsHubReady;
  const fallback = localePath(
    locale,
    !isAuthorized ? "/authorize" : "/products"
  );

  useEffect(() => {
    if (!blocked) return;
    router.replace(fallback);
  }, [blocked, fallback, router]);

  if (!hubEnabled) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-ink-muted">
        <p>{t("sidebar.hubUnavailable")}</p>
      </div>
    );
  }

  if (!operationsHubReady) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-ink-muted">
        <p>{t("sidebar.hubLockedRedirecting")}</p>
      </div>
    );
  }

  return <>{children}</>;
}
