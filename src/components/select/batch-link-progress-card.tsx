"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import {
  formatBatchLinkSummary,
  type BatchLinkProgress,
} from "@/lib/batch-link/types";
import { isMatchJobActive } from "@/lib/match-queue-poll";
import type { MatchJobProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BatchLinkProgressCard({
  batchLinkProgress = null,
  unboundMatchJob = null,
  className,
}: {
  batchLinkProgress?: BatchLinkProgress | null;
  unboundMatchJob?: MatchJobProgress | null;
  className?: string;
}) {
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

  if (!show) return null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border px-2.5 py-2 transition-colors",
        queueActive
          ? "border-sky-300 bg-sky-50/80 batch-link-shimmer"
          : "border-emerald-300 bg-emerald-50/80 pipeline-done-flash",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        {queueActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
          一键关联
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span
          className={cn(
            "text-[10px] font-medium",
            queueActive ? "text-sky-700" : "text-emerald-700"
          )}
        >
          {queueActive ? "批量执行中" : "完成"}
        </span>
      </div>

      <p className="mt-0.5 text-[10px] text-slate-500">
        {queueActive ? (
          <>
            正在一键关联
            {queueTotal > 0 ? ` ${queueProcessed}/${queueTotal}` : ""}
            {batchLinkProgress && batchLinkProgress.linked > 0
              ? ` · 已关联 ${batchLinkProgress.linked} 个`
              : unboundMatchJob && unboundMatchJob.linked > 0
                ? ` · 已关联 ${unboundMatchJob.linked} 个`
                : ""}
          </>
        ) : batchDone && batchLinkProgress ? (
          formatBatchLinkSummary(batchLinkProgress)
        ) : unboundMatchJob ? (
          formatUnboundMatchInline(unboundMatchJob)
        ) : (
          ""
        )}
      </p>

      {queueActive && batchLinkProgress?.currentProductTitle ? (
        <p className="mt-0.5 truncate text-[10px] text-sky-800">
          当前：{batchLinkProgress.currentProductTitle}
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

      {(batchLinkProgress?.recent.length ?? 0) > 0 ? (
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
