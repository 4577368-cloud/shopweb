"use client";

import { CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import {
  formatNewArrivalAnalysisSummary,
  type NewArrivalAnalysisResult,
} from "@/lib/new-arrival-analysis-result";
import { isMatchJobActive } from "@/lib/match-queue-poll";
import type { MatchJobProgress } from "@/lib/types";
import {
  formatBatchLinkSummary,
  type BatchLinkProgress,
} from "@/lib/batch-link/types";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  ready: boolean;
  analyzed: number;
  matched: number;
  pending: number;
  unbound: number;
  /** New mirror rows since last scan/sync baseline, not yet image-matched. */
  pendingNewAnalysis?: number;
  recommendedCategories: RecommendedCategory[];
  onRefresh?: () => void;
  onViewDetails?: () => void;
  /** Jump to new-arrival filter in the product list. */
  onViewNewArrivals?: () => void;
  newArrivalAnalysisResult?: NewArrivalAnalysisResult | null;
  onDismissNewArrivalResult?: () => void;
  onViewNewArrivalPending?: () => void;
  onViewNewArrivalUnmatched?: () => void;
  /** Live progress while「一键关联」runs the server-side match queue. */
  unboundMatchJob?: MatchJobProgress | null;
  /** Client-side per-card batch link progress (preferred over server queue). */
  batchLinkProgress?: BatchLinkProgress | null;
  /** Disable new-arrival CTA while any batch link run is active. */
  batchLinkBusy?: boolean;
  className?: string;
}

/** Lightweight Shopify analysis strip for the「我的shopify」tab context. */
export function SmartSourcingSummaryBar({
  ready,
  analyzed,
  matched,
  pending,
  unbound,
  pendingNewAnalysis = 0,
  recommendedCategories,
  onRefresh,
  onViewDetails,
  onViewNewArrivals,
  newArrivalAnalysisResult = null,
  onDismissNewArrivalResult,
  onViewNewArrivalPending,
  onViewNewArrivalUnmatched,
  unboundMatchJob = null,
  batchLinkProgress = null,
  batchLinkBusy = false,
  className,
}: SmartSourcingSummaryBarProps) {
  const pct = analyzed > 0 ? Math.round((matched / analyzed) * 100) : 0;
  const topCats = recommendedCategories.slice(0, 3);
  const batchActive = batchLinkProgress?.active ?? false;
  const batchDone = batchLinkProgress?.done ?? false;
  const batchTotal = batchLinkProgress?.total ?? 0;
  const batchProcessed = batchLinkProgress?.processed ?? 0;
  const batchPct =
    batchTotal > 0 ? Math.min(100, Math.round((batchProcessed / batchTotal) * 100)) : 0;
  const queueActive =
    batchActive ||
    (unboundMatchJob != null && isMatchJobActive(unboundMatchJob.jobStatus));
  const queueDone =
    batchDone ||
    (unboundMatchJob != null && !isMatchJobActive(unboundMatchJob.jobStatus));
  const queueTotal = batchActive || batchDone ? batchTotal : (
    unboundMatchJob != null
      ? Math.max(unboundMatchJob.total, unboundMatchJob.processed)
      : 0
  );
  const queueProcessed = batchActive || batchDone ? batchProcessed : (
    unboundMatchJob?.processed ?? 0
  );
  const queuePct =
    batchActive || batchDone
      ? batchPct
      : unboundMatchJob != null
        ? queueTotal > 0
          ? Math.min(100, Math.round((unboundMatchJob.processed / queueTotal) * 100))
          : unboundMatchJob.percent
        : 0;
  const showQueueStrip =
    (batchActive || batchDone || (unboundMatchJob != null && (queueActive || queueDone)));
  const batchLinkSessionActive =
    batchLinkProgress != null &&
    (batchActive || batchDone);
  const batchLinkLabel = "正在一键关联";

  return (
    <section
      className={cn(
        "rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-2",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-xs leading-5 text-ink-muted">
          {ready ? (
            <>
              已分析 <span className="font-semibold text-ink">{analyzed}</span>
              {" · "}
              自动匹配 <span className="font-semibold text-ink">{matched}</span>
              {" · "}
              待确认{" "}
              <span
                className={
                  pending > 0 ? "font-semibold text-amber-600" : "font-semibold text-ink"
                }
              >
                {pending}
              </span>
              {" · "}
              未匹配 <span className="font-semibold text-ink">{unbound}</span>
              {topCats.length ? (
                <>
                  {" · 推荐 "}
                  {topCats.map((c, i) => (
                    <span key={c.id} className="text-ink">
                      {i > 0 ? " / " : ""}
                      {c.name}
                    </span>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
              正在分析店铺商品…
            </span>
          )}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewDetails ? (
            <button
              type="button"
              onClick={onViewDetails}
              className="text-[11px] font-medium text-brand-strong hover:underline"
            >
              查看详情
            </button>
          ) : null}
          {onRefresh && !batchLinkBusy ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 px-0"
              title="重新分析"
              aria-label="重新分析"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${ready ? pct : 0}%` }}
        />
      </div>

      {ready && showQueueStrip ? (
        <div
          className={cn(
            "mt-2 rounded-md border px-2.5 py-2",
            queueActive
              ? "border-brand/30 bg-brand/5"
              : "border-emerald-200 bg-emerald-50/80"
          )}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {queueActive ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            )}
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink">
              {queueActive ? (
                <>
                  <span className="font-semibold text-ink">
                    {batchLinkLabel}
                    {queueTotal > 0 ? ` ${queueProcessed}/${queueTotal}` : ""}
                  </span>
                  {batchLinkProgress && batchLinkProgress.linked > 0 ? (
                    <span className="text-ink-muted">
                      {" "}
                      · 已关联 {batchLinkProgress.linked} 个
                    </span>
                  ) : unboundMatchJob && unboundMatchJob.linked > 0 ? (
                    <span className="text-ink-muted">
                      {" "}
                      · 已关联 {unboundMatchJob.linked} 个
                    </span>
                  ) : null}
                  {batchLinkProgress?.currentProductTitle ? (
                    <span className="block truncate text-ink-muted">
                      当前：{batchLinkProgress.currentProductTitle}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="font-semibold text-emerald-950">
                  {batchDone && batchLinkProgress
                    ? formatBatchLinkSummary(batchLinkProgress)
                    : unboundMatchJob
                      ? formatUnboundMatchInline(unboundMatchJob)
                      : ""}
                </span>
              )}
            </p>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                queueActive ? "bg-brand" : "bg-emerald-500"
              )}
              style={{ width: `${queuePct}%` }}
            />
          </div>
          {(batchLinkProgress?.recent.length ?? 0) > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-ink-muted">
              {batchLinkProgress!.recent.slice(0, 3).map((line) => (
                <li key={line} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          ) : unboundMatchJob?.recent?.length ? (
            <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-ink-muted">
              {unboundMatchJob.recent.slice(0, 3).map((line) => (
                <li key={line} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {ready && newArrivalAnalysisResult ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-2">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <p className="min-w-0 text-[11px] leading-snug text-emerald-950">
              {formatNewArrivalAnalysisSummary(newArrivalAnalysisResult)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {newArrivalAnalysisResult.pending > 0 && onViewNewArrivalPending ? (
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={onViewNewArrivalPending}
              >
                查看待确认
                {newArrivalAnalysisResult.pending > 1
                  ? ` (${newArrivalAnalysisResult.pending})`
                  : ""}
              </Button>
            ) : null}
            {newArrivalAnalysisResult.unmatched > 0 && onViewNewArrivalUnmatched ? (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 px-2 text-[11px]"
                onClick={onViewNewArrivalUnmatched}
              >
                手动查找候选
                {newArrivalAnalysisResult.unmatched > 1
                  ? ` (${newArrivalAnalysisResult.unmatched})`
                  : ""}
              </Button>
            ) : null}
            {onDismissNewArrivalResult ? (
              <button
                type="button"
                onClick={onDismissNewArrivalResult}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-100/80"
                title="关闭"
                aria-label="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {ready && pendingNewAnalysis > 0 && !batchLinkSessionActive ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-2.5 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-sky-900">
            <span className="font-semibold">{pendingNewAnalysis} 个新商品</span>
            已入库，进入页面后将自动一键关联（主图就绪后执行）。
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onViewNewArrivals ? (
              <button
                type="button"
                onClick={onViewNewArrivals}
                className="text-[11px] font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
              >
                查看新商品
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatUnboundMatchInline(job: MatchJobProgress): string {
  const total = Math.max(job.total, job.processed);
  if (total <= 0) return "暂无可关联的未匹配商品";
  const parts = [`已完成 ${total} 个商品图搜`];
  const detail: string[] = [];
  if (job.linked > 0) detail.push(`${job.linked} 个进入待确认`);
  const manual = job.skipped + job.failed;
  if (manual > 0) detail.push(`${manual} 个需手动查找候选`);
  if (detail.length > 0) parts.push(detail.join("，"));
  return parts.join("，");
}
