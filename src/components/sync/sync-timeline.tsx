"use client";

import { Check, Loader2 } from "@/lib/ui/icons";
import { motion } from "framer-motion";
import { useT } from "@/i18n/LocaleProvider";
import type { PipelineStep } from "@/lib/sync/launch-summary";
import { cn } from "@/lib/utils";

export function SyncTimeline({ steps }: { steps: PipelineStep[] }) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-x-auto rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-3 shadow-card"
    >
      <ol className="flex min-w-[720px] gap-2">
        {steps.map((step, index) => {
          const completed = step.status === "completed";
          const active = step.status === "active";

          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 flex-1 flex-col rounded-lg border px-2.5 py-2.5",
                completed && "border-emerald-200 bg-emerald-50/50",
                active && "border-brand/40 bg-brand-soft/40 ring-1 ring-brand/15",
                !completed && !active && "border-hairline bg-surface-muted/20"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                    completed && "bg-emerald-600 text-white",
                    active && "bg-brand text-white",
                    !completed && !active && "bg-slate-200 text-slate-600"
                  )}
                >
                  {completed ? (
                    <Check className="h-3 w-3" />
                  ) : active ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="text-[10px] font-semibold">{index + 1}</span>
                  )}
                </span>
                <span className="truncate text-xs font-semibold text-ink">
                  {step.title}
                </span>
              </div>
              {step.badge ? (
                <span
                  className={cn(
                    "mt-1.5 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    completed && "bg-emerald-100 text-emerald-800",
                    active && "bg-brand-soft text-brand-strong",
                    !completed && !active && "bg-slate-100 text-slate-600"
                  )}
                >
                  {completed ? t("syncUi.stepCompleted") : step.badge}
                </span>
              ) : null}
              <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">
                {step.summary}
              </p>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
