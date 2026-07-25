"use client";

import type { ReactNode } from "react";
import { useOnboarding } from "@/context/onboarding-context";
import { useT } from "@/i18n/LocaleProvider";
import { useHubFeatureFlag } from "@/lib/hub/feature-flag";

/**
 * Blocks 运营中枢 routes until 商品货源关联 ≥80% 且用户显式开启 Hub 开关。
 * 开关默认关闭，可在 账户 → 安全设置 中开启。
 */
export function HubRouteGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { operationsHubReady } = useOnboarding();
  const { enabled: hubEnabled } = useHubFeatureFlag();

  if (!hubEnabled) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center text-sm text-ink-muted">
        <p>{t("sidebar.hubUnavailable")}</p>
      </div>
    );
  }

  if (!operationsHubReady) {
    return null;
  }

  return <>{children}</>;
}
