"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import type { BaseCommandPlan } from "@/lib/agents/shared/command-plan";
import type { ConfirmPreviewResult, ConfirmCardTheme } from "@/components/select/command-confirm-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommandSensitivity } from "@/lib/agents/shared/command-plan";

export type ExecutionStep =
  | "executing"
  | "preview_ready"
  | "applying"
  | "batch_running"
  | "done"
  | "error";

export interface BatchProgress {
  current: number;
  total: number;
  success: number;
  failed: number;
}

const STEP_LABELS: Record<ExecutionStep, string> = {
  executing: "正在执行",
  preview_ready: "预览就绪",
  applying: "写入 Shopify",
  batch_running: "批量执行中",
  done: "完成",
  error: "失败",
};

const HIGH_SENSITIVITY_AUTO_APPLY_MS = 3000;
const LOW_SENSITIVITY_AUTO_APPLY_MS = 600;

const THEME_BORDER: Record<ConfirmCardTheme, string> = {
  amber: "border-amber-300",
  sky: "border-sky-300",
  emerald: "border-emerald-300",
  violet: "border-violet-300",
};

const THEME_ACCENT: Record<ConfirmCardTheme, string> = {
  amber: "text-amber-700",
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  violet: "text-violet-700",
};

const THEME_DONE: Record<ConfirmCardTheme, string> = {
  amber: "border-emerald-300 bg-emerald-50/80",
  sky: "border-emerald-300 bg-emerald-50/80",
  emerald: "border-emerald-300 bg-emerald-50/80",
  violet: "border-emerald-300 bg-emerald-50/80",
};

export function ExecutionPipeline({
  plan,
  theme = "sky",
  step,
  preview,
  error,
  sensitivity = "low",
  batchProgress,
  onAutoApply,
  onCancel,
}: {
  plan: BaseCommandPlan;
  theme?: ConfirmCardTheme;
  step: ExecutionStep;
  preview: ConfirmPreviewResult | null;
  error: string | null;
  sensitivity?: CommandSensitivity;
  batchProgress?: BatchProgress | null;
  onAutoApply: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const autoApplyMs =
    sensitivity === "high"
      ? HIGH_SENSITIVITY_AUTO_APPLY_MS
      : LOW_SENSITIVITY_AUTO_APPLY_MS;
  const [countdown, setCountdown] = useState(autoApplyMs);
  const cancelledRef = useRef(false);

  // Auto-apply countdown when preview is ready
  useEffect(() => {
    if (step !== "preview_ready") return;
    cancelledRef.current = false;
    setCountdown(autoApplyMs);

    const start = Date.now();
    const tick = setInterval(() => {
      if (cancelledRef.current) {
        clearInterval(tick);
        return;
      }
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, autoApplyMs - elapsed);
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        if (!cancelledRef.current && preview) {
          onAutoApply(preview.payload);
        }
      }
    }, 50);

    return () => clearInterval(tick);
  }, [step, preview, onAutoApply, autoApplyMs]);

  const isDone = step === "done";
  const isError = step === "error";
  const isBatchRunning = step === "batch_running";
  const showCountdown =
    sensitivity === "high" && step === "preview_ready" && countdown > 0;
  const pct = isBatchRunning && batchProgress
    ? Math.round((batchProgress.current / batchProgress.total) * 100)
    : step === "preview_ready"
      ? Math.round((1 - countdown / autoApplyMs) * 100)
      : isDone
        ? 100
        : 0;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border px-2.5 py-2 transition-colors",
        isDone
          ? THEME_DONE[theme]
          : isError
            ? "border-red-300 bg-red-50/80"
            : THEME_BORDER[theme],
        "bg-sky-50/80",
        (step === "executing" || step === "applying") && "batch-link-shimmer",
        isDone && "pipeline-done-flash"
      )}
    >
      {/* Step indicator bar */}
      <div className="flex items-center gap-1.5">
        {isDone ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : isError ? (
          <X className="h-3.5 w-3.5 text-red-600" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
        )}
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
          {plan.operation}
        </span>
        <span className="text-[10px] text-slate-400">·</span>
        <span className={cn("text-[10px] font-medium", isDone ? "text-emerald-700" : THEME_ACCENT[theme])}>
          {STEP_LABELS[step]}
        </span>
        {showCountdown ? (
          <span className="ml-auto text-[10px] text-slate-500">
            {(countdown / 1000).toFixed(1)}s 后自动应用
          </span>
        ) : null}
      </div>

      {/* Target */}
      <p className="mt-0.5 text-[10px] text-slate-500">
        目标：{plan.targetLabel}
      </p>

      {/* Done summary */}
      {isDone && plan.detailLines.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {plan.detailLines.slice(0, 3).map((line, i) => (
            <p key={i} className="text-[10px] text-emerald-800/70">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {/* Progress bar */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-100",
            isDone
              ? "bg-emerald-500"
              : isError
                ? "bg-red-400"
                : isBatchRunning
                  ? "bg-violet-500"
                  : "bg-sky-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Batch progress details */}
      {isBatchRunning && batchProgress ? (
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
          <span>
            {batchProgress.current} / {batchProgress.total}
          </span>
          <span className="text-emerald-600">成功 {batchProgress.success}</span>
          {batchProgress.failed > 0 && (
            <span className="text-red-500">失败 {batchProgress.failed}</span>
          )}
        </div>
      ) : isBatchRunning ? (
        <p className="mt-1.5 text-[10px] text-slate-500">正在准备，请稍候…</p>
      ) : null}

      {/* Preview diff (when ready) */}
      {preview && (step === "preview_ready" || isDone) ? (
        <div className="mt-2 space-y-1.5">
          {preview.sections.map((section, si) => (
            <div key={si}>
              {section.rows.map((row, ri) => (
                <div key={ri} className="space-y-0.5">
                  <div className="rounded border border-slate-200/80 bg-white/70 px-2 py-1">
                    <p className="text-[10px] text-slate-500">{row.label} · 原</p>
                    <p className="text-[11px] leading-relaxed text-slate-600 line-through decoration-slate-300">
                      {row.before || "（空）"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "rounded px-2 py-1 ring-1",
                      isDone
                        ? "border border-emerald-300/60 bg-emerald-100/60 ring-emerald-200/50"
                        : "border border-sky-400/60 bg-sky-100/80 ring-sky-300/50"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-medium",
                        isDone ? "text-emerald-700" : "text-sky-700"
                      )}
                    >
                      {row.label} · 改后
                    </p>
                    <p
                      className={cn(
                        "text-[11px] font-medium leading-relaxed",
                        isDone ? "text-emerald-950" : "text-sky-950"
                      )}
                    >
                      {row.after}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {preview.extraNote ? (
            <p className="text-[10px] text-slate-500">{preview.extraNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* Impact info (preview only) */}
      {preview?.impact && step === "preview_ready" ? (
        <div className="mt-2 rounded border border-amber-200/60 bg-amber-50/50 px-2 py-1.5">
          <p className="text-[10px] font-medium text-amber-800/80">⚠ 执行前确认</p>
          <div className="mt-0.5 space-y-0.5">
            <p className="text-[10px] text-amber-900/70">
              影响范围：{preview.impact.scope}
            </p>
            {preview.impact.durationHint ? (
              <p className="text-[10px] text-amber-900/70">
                预计耗时：{preview.impact.durationHint}
              </p>
            ) : null}
            <p className="text-[10px] text-amber-900/70">
              {preview.impact.reversible ? "✓ 可撤销（支持手动改回）" : "✗ 不可逆操作"}
            </p>
            {preview.impact.riskNote ? (
              <p className="text-[10px] text-red-700/80">{preview.impact.riskNote}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-[11px] text-red-700">{error}</p>
      ) : null}

      {/* Cancel — preview countdown or batch in progress */}
      {(showCountdown || isBatchRunning || step === "preview_ready") ? (
        <div className="mt-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[10px]"
            onClick={() => {
              cancelledRef.current = true;
              onCancel();
            }}
          >
            取消
          </Button>
        </div>
      ) : null}
    </div>
  );
}
