"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  AlertCircle,
  Loader2,
  Lightbulb,
  Store,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/types";

function StepDot({ status, order }: { status: StepStatus; order: number }) {
  const base =
    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold";
  if (status === "completed") {
    return <CheckCircle2 className="h-5 w-5 text-brand" />;
  }
  if (status === "in_progress" || status === "pending_confirm") {
    return <span className={cn(base, "bg-brand text-white")}>{order}</span>;
  }
  if (status === "error") {
    return <AlertCircle className="h-5 w-5 text-red-500" />;
  }
  return (
    <span className={cn(base, "border border-hairline-strong text-ink-subtle")}>
      {order}
    </span>
  );
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

interface StepSidebarProps {
  /** Simplified assist / tip card rendered near the bottom. Defaults to a compact AI tip card. */
  tip?: ReactNode;
}

/**
 * Left rail (Step 3): brand header → shop switcher (visual) → progress → compact step timeline →
 * simplified assist/tip card → help footer. Reads the onboarding context (same source as the legacy
 * StepNav) and renders every step compactly with a green active state. teal/green is used only for the
 * active step, progress and status.
 */
export function StepSidebar({ tip }: StepSidebarProps) {
  const pathname = usePathname();
  const {
    steps,
    shop,
    syncCompleted,
    syncPhase,
    isAuthorized,
    logisticsCompleted,
  } = useOnboarding();

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progress = syncCompleted
    ? 100
    : Math.round(
        ((completedCount + (logisticsCompleted ? 0 : 0)) / (steps.length + 1)) *
          100
      );

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
    <aside className="flex h-full flex-col border-r border-hairline bg-surface">
      <div className="px-4 py-4">
        <Link href={isAuthorized ? "/" : "/authorize"} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-white">
            T
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold tracking-tight text-ink">
                {APP_NAME}
              </span>
              <span className="rounded bg-brand-soft px-1 py-0.5 text-[9px] font-semibold text-brand-strong">
                AI
              </span>
            </span>
            <span className="block text-[11px] text-ink-muted">{APP_SUBTITLE}</span>
          </span>
        </Link>
      </div>

      {/* Shop switcher — visual only this round (single connected shop). */}
      <div className="px-4">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
        >
          <Store className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
            {isAuthorized ? shop.name : "未连接店铺"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
        </button>
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-muted">
          <span>开店进度</span>
          <span className="font-medium text-ink">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.max(progress, 4)}%` }}
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
          开店流程
        </p>
        <ul className="space-y-0.5">
          {navItems.map((step) => {
            const active = pathname === step.href;
            const label = statusLabel(step.status);
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-start gap-2.5 rounded-[var(--radius-control)] px-2.5 py-2 transition-colors",
                    active
                      ? "bg-brand-soft"
                      : "hover:bg-slate-50"
                  )}
                >
                  <div className="mt-0.5">
                    <StepDot status={step.status} order={step.order} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] font-medium leading-4",
                        active ? "text-brand-strong" : "text-ink"
                      )}
                    >
                      {step.order}. {step.title}
                    </span>
                    <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-ink-muted">
                      {step.description}
                    </p>
                    <span className={cn("mt-0.5 block text-[11px] font-medium", label.tone)}>
                      {label.text}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-hairline p-3">
        {tip ?? <DefaultTip />}
        <div className="mt-3 flex items-center gap-3 px-1 text-[11px] text-ink-subtle">
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

/** Compact AI tip card shown by default at the bottom of the rail. */
function DefaultTip() {
  return (
    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink">
        <Lightbulb className="h-3 w-3 text-amber-500" />
        AI 小贴士
      </div>
      <p className="text-[11px] leading-4 text-ink-muted">
        我是 Tangbuy AI 助手，会帮你完成开店的每一步，有任何问题都可以问我。
      </p>
    </div>
  );
}
