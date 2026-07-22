"use client";

import { Check, Loader2, RefreshCw, X } from "lucide-react";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEP_LABEL: Record<
  NonNullable<LogisticsPipelineProgress["currentSkuStep"]>,
  string
> = {
  quote: "运费预估",
  accept: "自动确认（普货）",
};

export function LogisticsPipelineTaskCard({
  progress,
  pendingReviewCount,
  onRetry,
  onCancel,
}: {
  progress: LogisticsPipelineProgress;
  pendingReviewCount?: number;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  if (progress.phase === "idle") return null;

  const isDone = progress.phase === "done";
  const isError = progress.phase === "error";
  const isRunning = progress.phase === "running" || progress.phase === "waiting";
  const pct =
    progress.productTotal > 0 && progress.phase === "running"
      ? Math.round((progress.productIndex / progress.productTotal) * 100)
      : isDone
        ? 100
        : progress.phase === "waiting"
          ? 8
          : 0;

  const title =
    progress.currentProductTitle?.trim() ||
    (isDone ? "全部商品" : "准备中…");

  const pendingReview =
    pendingReviewCount ?? progress.stats.pendingReview;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border px-2.5 py-2 transition-colors",
        isDone
          ? "border-emerald-300 bg-emerald-50/80"
          : isError
            ? "border-red-300 bg-red-50/80"
            : "border-sky-300 bg-sky-50/80",
        isRunning && "batch-link-shimmer",
        isDone && "pipeline-done-flash"
      )}
    >
      <div className="flex items-center gap-1.5">
        {isDone ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : isError ? (
          <X className="h-3.5 w-3.5 text-red-600" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
          物流自动匹配
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            isDone ? "text-emerald-700" : isError ? "text-red-700" : "text-sky-700"
          )}
        >
          {progress.phase === "waiting"
            ? "待开始"
            : isDone
              ? "完成"
              : isError
                ? "失败"
                : "预估中"}
        </span>
        {(isError && onRetry) || (progress.phase === "running" && onCancel) ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="relative z-10 ml-auto h-7 w-7 px-0"
            onClick={isError ? onRetry : onCancel}
            title={isError ? "重新匹配" : "取消"}
            aria-label={isError ? "重新匹配" : "取消"}
          >
            {isError ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>

      <p className="mt-0.5 text-[10px] text-slate-500">
        {isDone
          ? `匹配完成 · 自动确认 ${progress.stats.autoAccepted} · 待你确认 ${pendingReview}`
          : progress.phase === "waiting"
            ? "点击右上角「运费预估」开始"
            : `商品 ${progress.productIndex}/${progress.productTotal} · ${title}`}
      </p>

      {progress.currentSkuStep && progress.phase === "running" ? (
        <p className="mt-0.5 text-[10px] text-sky-700">
          当前：{STEP_LABEL[progress.currentSkuStep]}
        </p>
      ) : null}

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-100",
            isDone ? "bg-emerald-500" : isError ? "bg-red-400" : "bg-sky-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress.phase === "running" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
          <span>
            {progress.productIndex} / {progress.productTotal}
          </span>
          <span className="text-emerald-600">
            已确认 {progress.stats.autoAccepted}
          </span>
          {progress.stats.failed > 0 ? (
            <span className="text-red-500">失败 {progress.stats.failed}</span>
          ) : null}
        </div>
      ) : null}

      {progress.error ? (
        <p className="mt-2 text-[11px] text-red-700">{progress.error}</p>
      ) : null}
    </div>
  );
}
