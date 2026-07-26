"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ComponentType, type ReactNode } from "react";
import { CheckCircle2, LineChart, ShoppingBag, Truck } from "@/lib/ui/icons";
import { AppLogo } from "@/components/brand/app-logo";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarUpgradeCta } from "@/components/workbench/sidebar-upgrade-cta";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useHubFeatureFlag } from "@/lib/hub/feature-flag";
import {
  OPERATIONS_HUB_PRODUCT_MATCH_PERCENT,
  productSourceLinkPercent,
} from "@/lib/hub/unlock";
import { cn } from "@/lib/utils";
import type { WorkflowStepSnapshot, WorkflowStatusKey } from "@/lib/workflow-step-snapshots";

function StepIndicator({
  order,
  completed,
  current,
}: {
  order: number;
  completed: boolean;
  current: boolean;
}) {
  return (
    <div
      className={cn(
        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
        current ? "bg-[#325BE6] text-white" : "bg-[#EEF2FF] text-[#325BE6]"
      )}
    >
      {completed ? <CheckCircle2 className="h-4 w-4" /> : order}
    </div>
  );
}

function stepKeyFor(id: string): string {
  return id === "sku-align" ? "sku" : id;
}

function HubNavIcon({
  icon: Icon,
  state,
}: {
  icon: ComponentType<{ className?: string }>;
  state: "current" | "default" | "disabled";
}) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-control)]",
        state === "current" && "bg-brand-accent text-white",
        state === "default" && "bg-brand-soft text-brand-accent",
        state === "disabled" && "border border-hairline bg-surface-muted text-ink-subtle/50"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}

export interface WorkbenchSidebarProps {
  /** Extra panel below nav (e.g. 运营中心用量卡). */
  bottomPanel?: ReactNode;
  /** Hide outer aside chrome when nested (legacy layouts). */
  embedded?: boolean;
}

/**
 * Unified left rail: 开店流程 / 代发管理 + 运营中枢（商品货源关联 ≥80% 后中枢入口可用）。
 */
export function WorkbenchSidebar({ bottomPanel, embedded }: WorkbenchSidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();
  const {
    steps,
    syncCompleted,
    operationsHubReady,
    isAuthorized,
    workflowStepSnapshots,
    workflowProgressPercent,
    refreshWorkflowProgress,
    workflowBinding,
  } = useOnboarding();

  useEffect(() => {
    if (!isAuthorized) return;
    const timer = window.setTimeout(() => {
      void refreshWorkflowProgress();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname, isAuthorized, refreshWorkflowProgress]);

  const progress = syncCompleted ? 100 : workflowProgressPercent;
  const flowSectionLabel = syncCompleted ? t("nav.dropship") : t("nav.flow");
  const { enabled: hubEnabled } = useHubFeatureFlag();
  const hubUnlocked = operationsHubReady && hubEnabled;
  const productLinkPct = productSourceLinkPercent(workflowBinding);

  const navItems = steps.map((s) => ({
    id: s.id,
    order: s.order,
    title: t(`steps.${stepKeyFor(s.id)}.title`),
    href: localePath(locale, s.href),
    snapshot:
      workflowStepSnapshots[s.id] ??
      ({
        statusKey: "not_started" as WorkflowStatusKey,
        statusLabel: t("status.notStarted"),
        statusTone: "text-ink-subtle",
        description: t(`steps.${stepKeyFor(s.id)}.desc`),
      } satisfies WorkflowStepSnapshot),
  }));

  const hubItems: {
    id: string;
    title: string;
    href?: string;
    icon: ComponentType<{ className?: string }>;
  }[] = [
    {
      id: "order",
      title: t("nav.order"),
      href: localePath(locale, "/order-center"),
      icon: ShoppingBag,
    },
    {
      id: "ops",
      title: t("nav.ops"),
      href: localePath(locale, "/operations-center"),
      icon: LineChart,
    },
    { id: "fulfillment", title: t("nav.fulfillment"), icon: Truck },
  ];

  const shellClass = embedded
    ? "flex min-h-0 flex-1 flex-col bg-surface"
    : "flex h-full w-[15.5rem] shrink-0 flex-col border-r border-hairline bg-surface";

  return (
    <aside className={shellClass}>
      <div className="shrink-0 px-4 pb-3 pt-4 leading-none">
        <AppLogo
          variant="sidebar"
          href={localePath(locale, isAuthorized ? "/" : "/authorize")}
        />
      </div>

      <ShopSwitcher />

      <div className="px-4 pb-3 pt-1">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-muted">
          <span>{t("sidebar.progress")}</span>
          <span className="font-semibold tabular-nums text-ink">{progress}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-[#90AAFF] transition-all duration-500"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>
      </div>

      <nav
        className="min-h-0 shrink-0 overflow-y-auto px-3 pb-2"
        aria-label={flowSectionLabel}
      >
        <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">{flowSectionLabel}</p>
        <ul className="space-y-0.5">
          {navItems.map((step, index) => {
            const current = pathname === step.href;
            const snapshot = step.snapshot;
            const completed = snapshot.statusKey === "completed";

            return (
              <li key={step.id} className="relative">
                {index < navItems.length - 1 ? (
                  <span
                    className={cn(
                      "pointer-events-none absolute left-[calc(1.25rem-0.5px)] top-7 z-0 h-[calc(100%-0.25rem)] w-px",
                      completed ? "bg-brand/35" : "bg-hairline"
                    )}
                    aria-hidden
                  />
                ) : null}
                <Link
                  href={step.href}
                  aria-current={current ? "page" : undefined}
                  title={t("sidebar.goTo", { title: step.title })}
                  className={cn(
                    "group relative z-[1] flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] px-2 py-2 transition-colors",
                    current ? "bg-brand-soft/80" : "hover:bg-surface-muted/80"
                  )}
                >
                  <StepIndicator order={step.order} completed={completed} current={current} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[13px] font-medium leading-5 transition-colors",
                      current ? "text-brand-accent" : "text-ink group-hover:text-brand-accent"
                    )}
                  >
                    {step.order}. {step.title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {hubEnabled ? (
        <nav
          className="min-h-0 shrink-0 overflow-y-auto border-t border-hairline px-3 py-2"
          aria-label={t("nav.hub")}
        >
          <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">{t("nav.hub")}</p>
          <ul className="space-y-0.5">
            {hubItems.map((item) => {
              const current = item.href ? pathname === item.href : false;
              const disabled = !item.href || !hubUnlocked;
              const disabledHint = !operationsHubReady
                ? t("sidebar.hubLockedUntilProductMatch", {
                    target: OPERATIONS_HUB_PRODUCT_MATCH_PERCENT,
                    current: productLinkPct,
                  })
                : undefined;

              if (disabled) {
                return (
                  <li key={item.id}>
                    <span
                      {...(disabledHint ? { title: disabledHint } : {})}
                      className="flex cursor-not-allowed gap-2.5 rounded-[var(--radius-control)] px-2 py-2 text-[13px] font-medium leading-5 text-ink-subtle/55"
                    >
                      <HubNavIcon icon={item.icon} state="disabled" />
                      <span className="min-w-0 flex-1">{item.title}</span>
                    </span>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <Link
                    href={item.href!}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "group flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] px-2 py-2 transition-colors",
                      current ? "bg-brand-soft/80 ring-1 ring-brand/10" : "hover:bg-surface-muted/80"
                    )}
                  >
                    <HubNavIcon icon={item.icon} state={current ? "current" : "default"} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-[13px] font-medium leading-5",
                        current ? "text-brand-accent" : "text-ink group-hover:text-brand-accent"
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {bottomPanel && hubEnabled ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-hairline px-3 py-3">
          {bottomPanel}
        </div>
      ) : (
        <div className="min-h-0 flex-1" aria-hidden />
      )}

      <SidebarUpgradeCta />

      <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5">
        <SidebarUserMenu className="min-w-0 flex-1" />
        <LanguageSwitcher className="shrink-0" />
      </div>
    </aside>
  );
}
