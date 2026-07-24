"use client";

import { Check, Loader2, RefreshCw, X } from "@/lib/ui/icons";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

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
  const t = useT();

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
    (isDone ? t("logisticsPipeline.allProducts") : t("logisticsPipeline.preparing"));

  const pendingReview =
    pendingReviewCount ?? progress.stats.pendingReview;

  const stepLabel = (step: NonNullable<LogisticsPipelineProgress["currentSkuStep"]>) =>
    step === "quote"
      ? t("logisticsPipeline.stepQuote")
      : t("logisticsPipeline.stepAccept");

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
          {t("logisticsPipeline.title")}
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            isDone ? "text-emerald-700" : isError ? "text-red-700" : "text-sky-700"
          )}
        >
          {progress.phase === "waiting"
            ? t("logisticsPipeline.statusWaiting")
            : isDone
              ? t("logisticsPipeline.statusDone")
              : isError
                ? t("logisticsPipeline.statusFailed")
                : t("logisticsPipeline.statusRunning")}
        </span>
        {(isError && onRetry) || (progress.phase === "running" && onCancel) ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="relative z-10 ml-auto h-7 w-7 px-0"
            onClick={isError ? onRetry : onCancel}
            title={
              isError
                ? t("logisticsPipeline.retryAria")
                : t("logisticsPipeline.cancelAria")
            }
            aria-label={
              isError
                ? t("logisticsPipeline.retryAria")
                : t("logisticsPipeline.cancelAria")
            }
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
          ? t("logisticsPipeline.doneSummary", {
              autoAccepted: progress.stats.autoAccepted,
              pendingReview,
            })
          : progress.phase === "waiting"
            ? t("logisticsPipeline.clickEstimate")
          : (progress.activeProductIds?.length ?? 0) > 1
            ? t("logisticsPipeline.parallelActive", {
                completed: progress.productIndex,
                total: progress.productTotal,
                count: progress.activeProductIds!.length,
              })
            : t("logisticsPipeline.productProgress", {
                index: progress.productIndex,
                total: progress.productTotal,
                title,
              })}
      </p>

      {progress.stats.ingestingRetry ? (
        <p className="mt-0.5 text-[10px] text-amber-700">
          {t("logisticsPipeline.ingestingRetryWait", {
            count: progress.stats.ingestingRetry,
          })}
        </p>
      ) : null}

      {progress.currentSkuStep && progress.phase === "running" ? (
        <p className="mt-0.5 text-[10px] text-sky-700">
          {t("logisticsPipeline.currentStep", {
            step: stepLabel(progress.currentSkuStep),
          })}
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
            {t("logisticsPipeline.confirmed", {
              count: progress.stats.autoAccepted,
            })}
          </span>
          {progress.stats.failed > 0 ? (
            <span className="text-red-500">
              {t("logisticsPipeline.failed", { count: progress.stats.failed })}
            </span>
          ) : null}
        </div>
      ) : null}

      {progress.error ? (
        <p className="mt-2 text-[11px] text-red-700">{progress.error}</p>
      ) : null}
    </div>
  );
}
