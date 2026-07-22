"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopSwitcher } from "@/components/workbench/shop-switcher";
import { cn } from "@/lib/utils";
import type { LogisticsStepDisplay } from "@/lib/logistics/completion-gate";
import type { StepStatus } from "@/lib/types";

function StepIndicator({
  status,
  order,
  logisticsDisplay,
}: {
  status: StepStatus;
  order: number;
  logisticsDisplay?: LogisticsStepDisplay | null;
}) {
  if (logisticsDisplay) {
    return <LogisticsStepIndicator display={logisticsDisplay} order={order} />;
  }

  const completed = status === "completed";
  const active = status === "in_progress" || status === "pending_confirm";
  const errored = status === "error";

  return (
    <div
      className={cn(
        "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
        completed && "bg-brand text-white",
        active && "bg-brand text-white ring-4 ring-brand-soft",
        errored && "bg-red-500 text-white",
        !completed && !active && !errored && "border border-hairline bg-surface text-ink-subtle"
      )}
    >
      {completed ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : errored ? (
        <AlertCircle className="h-3.5 w-3.5" />
      ) : (
        order
      )}
    </div>
  );
}

function LogisticsStepIndicator({
  display,
  order,
}: {
  display: LogisticsStepDisplay;
  order: number;
}) {
  switch (display) {
    case "running":
      return (
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white ring-4 ring-sky-100">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      );
    case "blocked":
      return (
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white">
          <AlertCircle className="h-3.5 w-3.5" />
        </div>
      );
    case "warning":
      return (
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white ring-4 ring-amber-100">
          <AlertTriangle className="h-3.5 w-3.5" />
        </div>
      );
    case "ready":
      return (
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-white ring-4 ring-brand-soft">
          <CheckCircle2 className="h-4 w-4" />
        </div>
      );
    default:
      return (
        <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-[11px] font-semibold text-ink-subtle">
          {order}
        </div>
      );
  }
}

function statusLabel(status: StepStatus): { text: string; tone: string } {
  switch (status) {
    case "completed":
      return { text: "已完成", tone: "text-brand" };
    case "in_progress":
    case "pending_confirm":
      return { text: "进行中", tone: "text-brand" };
    case "error":
      return { text: "异常", tone: "text-red-500" };
    default:
      return { text: "待开始", tone: "text-ink-subtle" };
  }
}

function logisticsDisplayLabel(display: LogisticsStepDisplay): {
  text: string;
  tone: string;
} {
  switch (display) {
    case "running":
      return { text: "匹配中", tone: "text-sky-700" };
    case "blocked":
      return { text: "有阻塞", tone: "text-red-600" };
    case "warning":
      return { text: "有例外", tone: "text-amber-700" };
    case "ready":
      return { text: "可同步", tone: "text-brand" };
    default:
      return { text: "待开始", tone: "text-ink-subtle" };
  }
}

/**
 * Left workflow rail — prototype-aligned timeline with green active step.
 */
export function StepSidebar() {
  const pathname = usePathname();
  const {
    steps,
    syncCompleted,
    syncPhase,
    isAuthorized,
    logisticsStepSnapshot,
  } = useOnboarding();

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progress = syncCompleted
    ? 100
    : Math.round((completedCount / (steps.length + 1)) * 100);

  const syncStatus: StepStatus = syncCompleted
    ? "completed"
    : syncPhase === "syncing"
      ? "in_progress"
      : syncPhase === "ready"
        ? "pending_confirm"
        : "not_started";

  const navItems: {
    id: string;
    order: number;
    title: string;
    description: string;
    href: string;
    status: StepStatus;
  }[] = [
    ...steps.map((s) => ({
      id: s.id,
      order: s.order,
      title: s.title,
      description: s.description,
      href: s.href,
      status: s.status,
    })),
    {
      id: "sync",
      order: steps.length + 1,
      title: "同步到店铺",
      description: "写入映射与履约配置",
      href: "/sync",
      status: syncStatus,
    },
  ];

  return (
    <aside className="flex h-full w-[15.5rem] shrink-0 flex-col border-r border-hairline bg-surface">
      <div className="px-4 py-4">
        <Link href={isAuthorized ? "/" : "/authorize"} className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white shadow-sm">
            T
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold tracking-tight text-ink">
              {APP_NAME}
            </span>
            <span className="block text-[11px] text-brand-strong">{APP_SUBTITLE}</span>
          </span>
        </Link>
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

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-2 px-1 text-[11px] font-medium text-ink-subtle">开店流程</p>
        <ul className="space-y-0.5">
          {navItems.map((step, index) => {
            const active = pathname === step.href;
            const isLogistics = step.id === "logistics";
            const logisticsDisplay =
              isLogistics && logisticsStepSnapshot
                ? logisticsStepSnapshot.display
                : null;
            const label =
              isLogistics && logisticsStepSnapshot
                ? {
                    text: logisticsStepSnapshot.label,
                    tone: logisticsDisplayLabel(logisticsStepSnapshot.display).tone,
                  }
                : statusLabel(step.status);
            const completed =
              step.status === "completed" &&
              (!isLogistics || logisticsDisplay === "ready");
            return (
              <li key={step.id} className="relative">
                {index < navItems.length - 1 ? (
                  <span
                    className={cn(
                      "absolute left-[1.34rem] top-8 z-0 h-[calc(100%-0.5rem)] w-px",
                      completed ? "bg-brand/35" : "bg-hairline"
                    )}
                    aria-hidden
                  />
                ) : null}
                <Link
                  href={step.href}
                  className={cn(
                    "relative z-[1] flex gap-2.5 rounded-[var(--radius-control)] px-2 py-2.5 transition-colors",
                    active
                      ? "bg-brand-soft/80 ring-1 ring-brand/10"
                      : "hover:bg-surface-muted/80"
                  )}
                >
                  <StepIndicator
                    status={step.status}
                    order={step.order}
                    logisticsDisplay={logisticsDisplay}
                  />
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-medium leading-5",
                        active ? "text-brand-strong" : "text-ink"
                      )}
                    >
                      {step.order}. {step.title}
                    </span>
                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-ink-muted">
                      {step.description}
                    </p>
                    <span
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium",
                        label.tone
                      )}
                    >
                      {(step.status === "in_progress" ||
                        step.status === "pending_confirm" ||
                        logisticsDisplay === "running") && (
                        <Circle className="h-1.5 w-1.5 fill-current" />
                      )}
                      {label.text}
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
