"use client";

import { useMemo, type ComponentType } from "react";
import {
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  Package,
  PieChart,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ScanSummaryStats } from "@/lib/scan/copilot-workflow";
import {
  activeWorkflowStep,
  completedWorkflowSteps,
  computeWorkflowProgress,
  copilotStatusHeadline,
  deriveCopilotWorkflow,
  scanBriefingLine,
  type CopilotWorkflowStep,
  type CopilotWorkflowStepId,
} from "@/lib/scan/copilot-workflow";
import type { ScanTaskStatus, ScanTaskView } from "@/components/workbench/scan-stage";

interface AiCopilotScanStageProps {
  tasks: ScanTaskView[];
  stats: ScanSummaryStats;
  progressPercent?: number;
  done: boolean;
  onViewResult: () => void;
}

const STEP_ICON_MAP: Record<CopilotWorkflowStepId, ComponentType<{ className?: string }>> = {
  sync: Store,
  features: Package,
  match: Truck,
  orders: ShoppingBag,
  profit: PieChart,
};

function StepStatusChip({ status }: { status: ScanTaskStatus }) {
  if (status === "running") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-strong">
        <Loader2 className="h-3 w-3 animate-spin" />
        进行中
      </span>
    );
  }
  if (status === "done" || status === "skipped") {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        部分完成
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[10px] text-ink-subtle">等待中</span>
  );
}

function HeroIllustration({ done }: { done: boolean }) {
  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-brand/15 bg-gradient-to-br from-brand-soft via-emerald-50/70 to-white"
      aria-hidden
    >
      {/* soft glow orbs */}
      <div className="absolute -left-3 -top-3 h-10 w-10 rounded-full bg-brand/20 blur-xl" />
      <div className="absolute -bottom-4 -right-3 h-12 w-12 rounded-full bg-emerald-400/20 blur-xl" />

      {/* store node */}
      <div className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-lg border border-brand/20 bg-white/90 text-brand shadow-sm backdrop-blur-sm">
        <Store className="h-3.5 w-3.5" />
      </div>

      {/* connection */}
      <Link2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 text-brand/70" />

      {/* AI node with pulse ring while scanning */}
      <div className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center">
        {!done ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-lg bg-brand/25" />
        ) : null}
        <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-emerald-500 text-white shadow-md">
          {done ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkflowStepRow({
  step,
  isLast,
}: {
  step: CopilotWorkflowStep;
  isLast: boolean;
}) {
  const Icon = STEP_ICON_MAP[step.id];
  const isActive = step.status === "running";
  const isComplete = step.status === "done" || step.status === "skipped";

  return (
    <div className="relative flex gap-3">
      {!isLast ? (
        <div
          className={cn(
            "absolute left-[0.9375rem] top-9 bottom-0 w-px",
            isComplete ? "bg-brand/30" : "bg-hairline"
          )}
        />
      ) : null}
      <div
        className={cn(
          "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm",
          isActive
            ? "border-brand/40 bg-brand-soft"
            : isComplete
              ? "border-emerald-200 bg-emerald-50"
              : "border-hairline bg-white"
        )}
      >
        {isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
        ) : isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <Icon className="h-4 w-4 text-ink-subtle" />
        )}
      </div>
      <div
        className={cn(
          "mb-2 min-w-0 flex-1 rounded-xl border px-3 py-2 shadow-sm transition-all",
          isActive
            ? "border-brand/25 bg-brand-soft/30"
            : "border-hairline/80 bg-white"
        )}
      >
        {/* Line 1: title + primary number */}
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-ink">
            {step.title}
          </p>
          {step.status !== "pending" && step.resultText ? (
            <p
              className={cn(
                "shrink-0 text-[12px] font-semibold tabular-nums",
                isActive ? "text-brand-strong" : "text-ink"
              )}
            >
              {step.resultText}
            </p>
          ) : null}
        </div>
        {/* Line 2: reason/subtitle + status chip */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-ink-subtle">
            {step.reasonText ?? step.subtitle}
          </p>
          <StepStatusChip status={step.status} />
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "warn" | "accent";
}) {
  return (
    <div className="min-w-0 text-center sm:text-left">
      <p
        className={cn(
          "text-xl font-bold tabular-nums leading-none",
          tone === "warn"
            ? "text-amber-600"
            : tone === "accent"
              ? "text-brand-strong"
              : "text-ink"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-ink-muted">{label}</p>
    </div>
  );
}

export function AiCopilotScanStage({
  tasks,
  stats,
  progressPercent = 0,
  done,
  onViewResult,
}: AiCopilotScanStageProps) {
  const steps = useMemo(
    () => deriveCopilotWorkflow(tasks, stats, done),
    [tasks, stats, done]
  );
  const overallPct = useMemo(
    () => computeWorkflowProgress(steps, progressPercent, done),
    [steps, progressPercent, done]
  );
  const completed = completedWorkflowSteps(steps);
  const active = done ? null : activeWorkflowStep(steps);
  const headline = copilotStatusHeadline(steps, done);
  const briefing = scanBriefingLine(stats);
  const unfulfilled = stats.shopContext.unfulfilledOrderCount;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {!done ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-ink-subtle">
          <Clock className="h-3.5 w-3.5" />
          预计完成时间：10～20 秒
        </p>
      ) : null}

      <section className="relative overflow-hidden rounded-2xl border border-brand/15 bg-white shadow-card">
        {/* ambient gradient wash */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-soft/50 via-white to-emerald-50/30" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand/10 blur-3xl" />

        <div className="relative flex items-start gap-4 px-5 py-4">
          <HeroIllustration done={done} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand to-emerald-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-sm">
                <Sparkles className="h-2.5 w-2.5" />
                AI Copilot
              </span>
              {headline.hint ? (
                <span className="text-[11px] font-medium text-ink-subtle">
                  {headline.hint}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1.5 text-[17px] font-bold leading-snug text-ink">
              {headline.title}
            </h2>
            {!done ? (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-ink-muted">总体进度</span>
                  <span className="tabular-nums">
                    <span className="text-sm font-bold text-brand-strong">
                      {completed}
                    </span>
                    <span className="text-ink-subtle"> / {steps.length} 步</span>
                    <span className="ml-2 font-semibold text-ink">{overallPct}%</span>
                  </span>
                </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand via-emerald-500 to-emerald-400 transition-[width] duration-700 ease-out"
                    style={{ width: `${overallPct}%` }}
                  />
                  {/* moving sheen */}
                  <div
                    className="absolute inset-y-0 w-16 animate-pulse rounded-full bg-white/30 blur-md"
                    style={{ left: `calc(${overallPct}% - 4rem)` }}
                  />
                </div>
                {active ? (
                  <p className="text-[11px] text-ink-subtle">
                    正在执行：<span className="font-medium text-ink-muted">{active.title}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">{briefing}</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-white px-4 py-4 shadow-card">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          AI 工作流进度
        </h3>
        <div className="space-y-0">
          {steps.map((step, idx) => (
            <WorkflowStepRow key={step.id} step={step} isLast={idx === steps.length - 1} />
          ))}
        </div>
      </section>

      {done ? (
        <section className="rounded-2xl border border-hairline bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">首轮 AI 选品已完成</p>
                  <p className="text-xs text-ink-muted">{briefing}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <SummaryStat label="店铺商品" value={stats.productCount} />
                <SummaryStat
                  label="推荐匹配"
                  value={stats.matchedCount}
                  tone="accent"
                />
                <SummaryStat
                  label="待确认"
                  value={stats.pendingCount}
                  tone={stats.pendingCount > 0 ? "warn" : "default"}
                />
                {stats.shopContext.orderCount != null ? (
                  <SummaryStat
                    label="待发货订单"
                    value={unfulfilled ?? 0}
                    tone={(unfulfilled ?? 0) > 0 ? "warn" : "default"}
                  />
                ) : null}
              </div>
            </div>
            <Button
              className="h-11 w-full shrink-0 px-6 lg:w-auto"
              onClick={onViewResult}
            >
              查看 AI 推荐结果 →
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
