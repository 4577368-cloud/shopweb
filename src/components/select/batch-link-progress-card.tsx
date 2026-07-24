"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { formatBatchCardQueueLine } from "@/lib/batch-link/confidence-display";
import {
  formatBatchLinkSummary,
  type BatchLinkProgress,
} from "@/lib/batch-link/types";
import { isMatchJobActive } from "@/lib/match-queue-poll";
import type { MatchJobProgress } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function BatchLinkProgressCard({
  batchLinkProgress = null,
  unboundMatchJob = null,
  pendingAckCount = 0,
  onBatchAckPending,
  className,
}: {
  batchLinkProgress?: BatchLinkProgress | null;
  unboundMatchJob?: MatchJobProgress | null;
  pendingAckCount?: number;
  onBatchAckPending?: () => void;
  className?: string;
}) {
  const t = useT();
  const [queueExpanded, setQueueExpanded] = useState(false);

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
  const queueTotal =
    batchActive || batchDone
      ? batchTotal
      : unboundMatchJob != null
        ? Math.max(unboundMatchJob.total, unboundMatchJob.processed)
        : 0;
  const queueProcessed =
    batchActive || batchDone ? batchProcessed : (unboundMatchJob?.processed ?? 0);
  const queuePct =
    batchActive || batchDone
      ? batchPct
      : unboundMatchJob != null
        ? queueTotal > 0
          ? Math.min(100, Math.round((unboundMatchJob.processed / queueTotal) * 100))
          : unboundMatchJob.percent
        : 0;

  const batchLinkSessionActive =
    batchLinkProgress != null && (batchActive || batchDone);
  const show =
    batchLinkSessionActive ||
    (unboundMatchJob != null && (queueActive || queueDone));

  const sessionOrder = batchLinkProgress?.sessionOrder ?? [];
  const cardStates = batchLinkProgress?.cardStates ?? {};
  const hasQueueDetails = sessionOrder.length > 0;

  if (!show) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border px-2.5 py-2 transition-colors",
        queueActive
          ? "border-sky-300 bg-sky-50/80 batch-link-shimmer"
          : "border-emerald-200 bg-emerald-50/80 pipeline-done-flash",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        {queueActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#325BE6]" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
          {t("batchLink.progressTitle")}
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            queueActive ? "text-sky-700" : "text-emerald-700"
          )}
        >
          {queueActive ? t("batchLink.progressRunning") : t("batchLink.progressDone")}
        </span>
        {hasQueueDetails ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-1.5 text-[10px] text-slate-600"
            onClick={() => setQueueExpanded((v) => !v)}
            aria-expanded={queueExpanded}
            aria-label={
              queueExpanded ? t("batchLink.progressCollapseQueue") : t("batchLink.progressExpandQueue")
            }
          >
            {queueExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>

      <p className="mt-0.5 text-[10px] text-slate-500">
        {queueActive ? (
          <>
            {t("batchLink.progressRunningDetail")}
            {queueTotal > 0 ? ` ${queueProcessed}/${queueTotal}` : ""}
            {batchLinkProgress && batchLinkProgress.linked > 0
              ? t("batchLink.progressLinked", { count: batchLinkProgress.linked })
              : unboundMatchJob && unboundMatchJob.linked > 0
                ? t("batchLink.progressLinked", { count: unboundMatchJob.linked })
                : ""}
          </>
        ) : batchDone && batchLinkProgress ? (
          formatBatchLinkSummary(batchLinkProgress)
        ) : unboundMatchJob ? (
          formatUnboundMatchInline(unboundMatchJob, t)
        ) : (
          ""
        )}
      </p>

      {queueActive && batchLinkProgress?.currentProductTitle ? (
        <p className="mt-0.5 truncate text-[10px] text-sky-800">
          {t("batchLink.progressCurrent", { title: batchLinkProgress.currentProductTitle })}
        </p>
      ) : null}

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            queueActive ? "bg-sky-400" : "bg-emerald-500"
          )}
          style={{ width: `${queuePct}%` }}
        />
      </div>

      {queueActive && queueTotal > 0 ? (
        <div className="mt-1.5 text-[10px] text-slate-500">
          {queueProcessed} / {queueTotal}
        </div>
      ) : null}

      {queueDone && pendingAckCount > 0 && onBatchAckPending ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-emerald-200/80 pt-2">
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-emerald-900">
            {t("batchLink.pendingAckHint", { count: pendingAckCount })}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 text-[11px]"
            onClick={onBatchAckPending}
          >
            {t("batchLink.pendingAckAction", { count: pendingAckCount })}
          </Button>
        </div>
      ) : null}

      {queueExpanded && hasQueueDetails ? (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border-t border-slate-200/80 pt-2">
          {sessionOrder.map((productId) => {
            const drive = cardStates[productId];
            if (!drive) return null;
            const title =
              drive.productTitle?.trim() ||
              `商品 ${productId.slice(-6)}`;
            const line = formatBatchCardQueueLine(t, drive);
            const isCurrent = batchLinkProgress?.currentProductId === productId;
            return (
              <li
                key={productId}
                className={cn(
                  "rounded px-1.5 py-1 text-[10px] leading-snug",
                  isCurrent
                    ? "bg-sky-100/80 text-sky-900"
                    : drive.state === "failed"
                      ? "text-red-700"
                      : drive.state === "needs_review"
                        ? "text-amber-800"
                        : drive.state === "done"
                          ? "text-emerald-700"
                          : "text-slate-600"
                )}
              >
                <span className="font-medium">{title}</span>
                <span className="text-slate-400"> · </span>
                <span>{line}</span>
              </li>
            );
          })}
        </ul>
      ) : (batchLinkProgress?.recent.length ?? 0) > 0 ? (
        <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-600">
          {batchLinkProgress!.recent.slice(0, 3).map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      ) : unboundMatchJob?.recent?.length ? (
        <ul className="mt-1.5 space-y-0.5 text-[10px] leading-snug text-slate-600">
          {unboundMatchJob.recent.slice(0, 3).map((line) => (
            <li key={line} className="truncate">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatUnboundMatchInline(
  job: MatchJobProgress,
  t: ReturnType<typeof useT>
): string {
  const total = Math.max(job.total, job.processed);
  if (total <= 0) return t("batchLink.unboundEmpty");
  const parts = [t("batchLink.unboundSearched", { count: total })];
  const detail: string[] = [];
  if (job.linked > 0) detail.push(t("batchLink.unboundLinked", { count: job.linked }));
  const manual = job.skipped + job.failed;
  if (manual > 0) detail.push(t("batchLink.unboundManual", { count: manual }));
  if (detail.length > 0) parts.push(detail.join(t("common.commaSeparator")));
  return parts.join(t("common.commaSeparator"));
}
