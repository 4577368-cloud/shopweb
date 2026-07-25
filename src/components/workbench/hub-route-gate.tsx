"use client";

import type { ReactNode } from "react";
import { useOnboarding } from "@/context/onboarding-context";
import { useT } from "@/i18n/LocaleProvider";
import { HUB_ENABLED } from "@/lib/hub/flags";

/**
 * Blocks 运营中枢 routes until 商品货源关联 ≥80%；生产需 {@link HUB_ENABLED}。
 * 未达标时不展示额外文案或引导按钮（入口在侧栏保持禁用即可）。
 */
export function HubRouteGate({ children }: { children: ReactNode }) {
  const t = useT();
  const { operationsHubReady } = useOnboarding();

  if (!HUB_ENABLED) {
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
