"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ScanTaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface ScanTaskView {
  id: string;
  label: string;
  status: ScanTaskStatus;
  resultText?: string | null;
  error?: string | null;
}

interface ScanStageProps {
  /** Heading of the scan card, e.g. "首轮自动整理". */
  heading: string;
  /** One-line description of what this stage is doing. */
  description?: string;
  tasks: ScanTaskView[];
  /** Streaming "最近完成" lines (only for tasks with genuine per-item output). */
  recent?: string[];
  done: boolean;
  /** "直接查看当前结果" (running) / "查看结果" (done). Never blocks — always available. */
  onViewResult: () => void;
}

function settledCount(tasks: ScanTaskView[]): number {
  return tasks.filter(
    (t) => t.status === "done" || t.status === "failed" || t.status === "skipped"
  ).length;
}

function TaskIcon({ status }: { status: ScanTaskStatus }) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-brand" />;
  if (status === "done")
    return <CheckCircle2 className="h-4 w-4 text-brand-strong" />;
  if (status === "failed")
    return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === "skipped")
    return <MinusCircle className="h-4 w-4 text-ink-subtle" />;
  return <Circle className="h-4 w-4 text-ink-subtle" />;
}

/**
 * Presentational scan-stage panel (Phase 1). Shows a real, task-driven "首轮自动处理": an overall
 * progress bar over concrete tasks, each with its real status + result count, plus an optional
 * streaming "最近完成" list. No fake animation — every row reflects a real orchestrated call.
 */
export function ScanStage({
  heading,
  description,
  tasks,
  recent,
  done,
  onViewResult,
}: ScanStageProps) {
  const total = tasks.length;
  const settled = settledCount(tasks);
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
        <div className="border-b border-hairline px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-ink">{heading}</h2>
            <span className="text-xs text-ink-subtle">
              {settled} / {total}
            </span>
          </div>
          {description ? (
            <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
          ) : null}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ol className="divide-y divide-hairline">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-5 py-3">
              <span className="mt-0.5 shrink-0">
                <TaskIcon status={t.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    t.status === "pending" ? "text-ink-subtle" : "text-ink"
                  )}
                >
                  {t.label}
                </p>
                {t.error ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-amber-600">{t.error}</p>
                ) : t.resultText ? (
                  <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                    {t.resultText}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <span className="text-[11px] text-ink-subtle">
            {done ? "首轮自动处理已完成" : "处理中，可随时查看当前结果"}
          </span>
          <Button size="sm" variant={done ? "primary" : "secondary"} onClick={onViewResult}>
            {done ? "查看结果" : "直接查看当前结果"}
          </Button>
        </div>
      </section>

      {recent && recent.length > 0 ? (
        <section className="rounded-[var(--radius-card)] border border-hairline bg-surface px-5 py-4 shadow-card">
          <p className="mb-2 text-xs font-medium text-ink-subtle">最近完成</p>
          <ul className="space-y-1.5">
            {recent.map((line, idx) => (
              <li
                key={`${line}-${idx}`}
                className="flex items-center gap-2 text-xs text-ink-muted"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-brand-strong" />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
