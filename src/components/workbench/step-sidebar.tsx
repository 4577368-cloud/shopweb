"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2 } from "@/lib/ui/icons";
import { AppLogo } from "@/components/brand/app-logo";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarAdCarousel } from "@/components/workbench/sidebar-ad-carousel";
import { SidebarUpgradeCta } from "@/components/workbench/sidebar-upgrade-cta";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/types";
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
        current
          ? "bg-[#325BE6] text-white"
          : "bg-[#EEF2FF] text-[#325BE6]"
      )}
    >
      {completed ? <CheckCircle2 className="h-4 w-4" /> : order}
    </div>
  );
}

/** Map a workflow step id to its localized title/description key. */
function stepKeyFor(id: string): string {
  return id === "sku-align" ? "sku" : id;
}

/**
 * Left workflow rail — navigation first: every step is always clickable.
 */
export function StepSidebar() {
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();
  const {
    steps,
    syncCompleted,
    isAuthorized,
    workflowStepSnapshots,
    workflowProgressPercent,
    refreshWorkflowProgress,
  } = useOnboarding();

  useEffect(() => {
    if (!isAuthorized) return;
    // Sidebar progress only — page loads own data; debounced in onboarding context.
    const timer = window.setTimeout(() => {
      void refreshWorkflowProgress();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname, isAuthorized, refreshWorkflowProgress]);

  const progress = syncCompleted ? 100 : workflowProgressPercent;
  const syncSnapshot = workflowStepSnapshots.sync;

  const navItems: {
    id: string;
    order: number;
    title: string;
    href: string;
    snapshot: WorkflowStepSnapshot;
  }[] = [
    ...steps.map((s) => ({
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
    })),
    {
      id: "sync",
      order: steps.length + 1,
      title: t("steps.sync.title"),
      href: localePath(locale, "/sync"),
      snapshot: syncSnapshot,
    },
  ];

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-hairline bg-surface">
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("nav.flow")}>
        <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">{t("nav.flow")}</p>
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
                    current
                      ? "bg-brand-soft/80"
                      : "hover:bg-surface-muted/80"
                  )}
                >
                  <StepIndicator order={step.order} completed={completed} current={current} />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-[13px] font-medium leading-5 transition-colors",
                      current
                        ? "text-brand-accent"
                        : "text-ink group-hover:text-brand-accent"
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

      <SidebarAdCarousel className="px-4 pb-3" />

      <SidebarUpgradeCta />

      <div className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-2.5">
        <SidebarUserMenu className="min-w-0 flex-1" />
        <LanguageSwitcher className="shrink-0" />
      </div>
    </aside>
  );
}
