"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2 } from "@/lib/ui/icons";
import { AppLogo } from "@/components/brand/app-logo";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { SidebarAdCarousel } from "@/components/workbench/sidebar-ad-carousel";
import { SidebarUserMenu } from "@/components/workbench/sidebar-user-menu";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { LinkInApp } from "@/host/link-in-app";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
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

export interface WorkbenchSidebarProps {
  /** Hide outer aside chrome when nested (legacy layouts). */
  embedded?: boolean;
}

/**
 * Unified left rail: 开店流程步骤导航。
 */
export function WorkbenchSidebar({ embedded }: WorkbenchSidebarProps) {
  const pathname = usePathname();
  const t = useT();
  const locale = useLocale();
  const { isEmbedded } = useEmbeddedMode();
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
    const timer = window.setTimeout(() => {
      void refreshWorkflowProgress();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [pathname, isAuthorized, refreshWorkflowProgress]);

  const progress = syncCompleted ? 100 : workflowProgressPercent;

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

  // Nested layout prop OR Shopify Admin embedded host — compact chrome.
  // Always h-full so the rail fills the grid cell; mt-auto can pin the footer.
  const compact = Boolean(embedded || isEmbedded);
  const shellClass = compact
    ? "flex h-full min-h-0 flex-col bg-surface"
    : "flex h-full w-[15.5rem] shrink-0 flex-col border-r border-hairline bg-surface";

  return (
    <aside className={shellClass}>
      {!isEmbedded ? (
        <div className="shrink-0 px-4 pb-3 pt-4 leading-none">
          <AppLogo
            variant="sidebar"
            href={localePath(locale, isAuthorized ? "/" : "/authorize")}
          />
        </div>
      ) : null}

      {!isEmbedded ? <ShopSwitcher /> : null}

      <div className={cn("shrink-0 px-4 pb-3", isEmbedded ? "pt-3" : "pt-1")}>
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

      {/* Steps stay compact — do not flex-grow. */}
      <nav
        className="min-h-0 shrink-0 overflow-y-auto px-3 pb-2"
        aria-label={t("nav.workbench")}
      >
        <ul className="space-y-0.5">
          {navItems.map((step) => {
            const current = pathname === step.href;
            const snapshot = step.snapshot;
            const completed = snapshot.statusKey === "completed";

            return (
              <li key={step.id}>
                <LinkInApp
                  href={step.href}
                  aria-current={current ? "page" : undefined}
                  title={t("sidebar.goTo", { title: step.title })}
                  className={cn(
                    "group flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-2 transition-colors",
                    current
                      ? "bg-brand-soft/80 ring-1 ring-brand/10"
                      : "hover:bg-surface-muted/80"
                  )}
                >
                  <StepIndicator
                    order={step.order}
                    completed={completed}
                    current={current}
                  />
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
                </LinkInApp>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Pin carousel + account to the bottom of the full-height rail. */}
      <div className="mt-auto flex shrink-0 flex-col gap-2">
        <div className="px-4 pt-1">
          <SidebarAdCarousel />
        </div>
        <div className="flex items-center gap-2 border-t border-hairline px-4 py-2.5">
          <SidebarUserMenu className="min-w-0 flex-1" />
          <LanguageSwitcher className="shrink-0" />
        </div>
      </div>
    </aside>
  );
}
