"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Store,
  PackagePlus,
} from "lucide-react";
import { APP_NAME, APP_SUBTITLE } from "@/data/mock";
import { useOnboarding } from "@/context/onboarding-context";
import { StepStatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import type { StepStatus } from "@/lib/types";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  }
  if (status === "in_progress" || status === "pending_confirm") {
    return <Loader2 className="h-4 w-4 text-amber-600" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }
  return <Circle className="h-4 w-4 text-slate-300" />;
}

export function StepNav() {
  const pathname = usePathname();
  const { steps, shop, syncCompleted, syncPhase, isAuthorized, logisticsCompleted } =
    useOnboarding();

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

  return (
    <aside className="flex w-[232px] shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-4">
        <Link href={isAuthorized ? "/" : "/authorize"} className="block">
          <div className="text-[15px] font-semibold tracking-tight text-slate-900">
            {APP_NAME}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{APP_SUBTITLE}</div>
        </Link>
      </div>

      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Store className="h-3.5 w-3.5" />
          <span className="truncate">
            {isAuthorized ? shop.name : "未连接店铺"}
          </span>
        </div>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>开店进度</span>
            <span className="font-medium text-slate-700">{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600 transition-all"
              style={{ width: `${Math.max(progress, 4)}%` }}
            />
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          开店流程
        </p>
        <ul className="space-y-0.5">
          {steps.map((step) => {
            const active = pathname === step.href;
            return (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className={cn(
                    "flex items-start gap-2.5 rounded-md px-2.5 py-2.5 transition-colors",
                    active
                      ? "bg-teal-50 text-teal-900"
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <div className="mt-0.5">
                    <StepIcon status={step.status} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {step.order}. {step.title}
                    </span>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      {step.description}
                    </p>
                    <div className="mt-1.5">
                      <StepStatusBadge status={step.status} />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/sync"
              className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-2.5 transition-colors",
                pathname === "/sync"
                  ? "bg-teal-50 text-teal-900"
                  : "text-slate-700 hover:bg-slate-50"
              )}
            >
              <div className="mt-0.5">
                <StepIcon status={syncStatus} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">5. 同步到店铺</span>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  写入映射与履约配置
                </p>
                <div className="mt-1.5">
                  <StepStatusBadge status={syncStatus} />
                </div>
              </div>
            </Link>
          </li>
        </ul>

        <p className="mt-4 mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          路径B · 实测
        </p>
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/catalog"
              className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-2.5 transition-colors",
                pathname === "/catalog"
                  ? "bg-teal-50 text-teal-900"
                  : "text-slate-700 hover:bg-slate-50"
              )}
            >
              <div className="mt-0.5">
                <PackagePlus className="h-4 w-4 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">离线目录上架</span>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  定价模板 + 一键上架到店铺
                </p>
              </div>
            </Link>
          </li>
        </ul>
      </nav>

      <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">
        原型演示 · Mock Data
      </div>
    </aside>
  );
}
