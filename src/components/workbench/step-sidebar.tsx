"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { AppLogo } from "@/components/brand/app-logo";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/types";
import type { WorkflowStepSnapshot } from "@/lib/workflow-step-snapshots";

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
        completed && "bg-brand text-white",
        current && !completed && "bg-brand text-white ring-4 ring-brand-soft",
        !completed && !current && "border border-hairline bg-surface text-ink-subtle"
      )}
    >
      {completed ? <CheckCircle2 className="h-4 w-4" /> : order}
    </div>
  );
}

function isSnapshotInProgress(snapshot: WorkflowStepSnapshot): boolean {
  return (
    snapshot.statusLabel === "进行中" ||
    snapshot.statusLabel === "匹配中" ||
    snapshot.statusLabel === "待处理" ||
    snapshot.statusLabel === "待配置" ||
    snapshot.statusLabel === "待报价" ||
    snapshot.statusLabel === "可开始" ||
    snapshot.statusLabel === "同步中" ||
    snapshot.statusLabel === "加载中"
  );
}

/**
 * Left workflow rail — navigation first: every step is always clickable.
 */
export function StepSidebar() {
  const pathname = usePathname();
  const {
    steps,
    syncCompleted,
    isAuthorized,
    workflowStepSnapshots,
    workflowProgressPercent,
    refreshWorkflowProgress,
  } = useOnboarding();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshWorkflowProgress();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [pathname, refreshWorkflowProgress]);

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
      title: s.title,
      href: s.href,
      snapshot:
        workflowStepSnapshots[s.id] ??
        ({
          statusLabel: "待开始",
          statusTone: "text-ink-subtle",
          description: s.description,
        } satisfies WorkflowStepSnapshot),
    })),
    {
      id: "sync",
      order: steps.length + 1,
      title: "同步到店铺",
      href: "/sync",
      snapshot: syncSnapshot,
    },
  ];

  return (
    <aside className="flex h-full w-[15.5rem] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="px-4 py-4">
        <AppLogo
          variant="sidebar"
          href={isAuthorized ? "/" : "/authorize"}
        />
      </div>

      <ShopSwitcher />

      <div className="px-4 pb-3 pt-1">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-muted">
          <span>开店进度</span>
          <span className="font-semibold tabular-nums text-ink">{progress}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-brand transition-all duration-500"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label="开店流程导航">
        <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">开店流程</p>
        <ul className="space-y-0.5">
          {navItems.map((step, index) => {
            const current = pathname === step.href;
            const snapshot = step.snapshot;
            const completed = snapshot.statusLabel === "已完成";
            const inProgress = isSnapshotInProgress(snapshot);

            return (
              <li key={step.id} className="relative">
                {index < navItems.length - 1 ? (
                  <span
                    className={cn(
                      "pointer-events-none absolute left-[1.34rem] top-8 z-0 h-[calc(100%-0.5rem)] w-px",
                      completed ? "bg-brand/35" : "bg-hairline"
                    )}
                    aria-hidden
                  />
                ) : null}
                <Link
                  href={step.href}
                  aria-current={current ? "page" : undefined}
                  title={`前往：${step.title}`}
                  className={cn(
                    "group relative z-[1] flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] px-2 py-2 transition-colors",
                    current
                      ? "bg-brand-soft/80 ring-1 ring-brand/10"
                      : "hover:bg-surface-muted/80"
                  )}
                >
                  <StepIndicator order={step.order} completed={completed} current={current} />
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-medium leading-5 transition-colors",
                        current
                          ? "text-brand-strong"
                          : "text-ink group-hover:text-brand-strong"
                      )}
                    >
                      {step.order}. {step.title}
                    </span>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-muted">
                      {snapshot.description}
                    </p>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium",
                        snapshot.statusTone
                      )}
                    >
                      {inProgress && !completed ? (
                        <Circle className="h-1.5 w-1.5 fill-current" />
                      ) : null}
                      {snapshot.statusLabel}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-hairline px-4 py-3">
        <div className="flex flex-col gap-1 text-[11px] text-ink-subtle">
          <Link href="#" className="hover:text-ink-muted">
            需要帮助？
          </Link>
          <Link href="#" className="hover:text-ink-muted">
            查看帮助文档
          </Link>
        </div>
      </div>
    </aside>
  );
}
