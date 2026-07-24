"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import { formatTargetMoney } from "@/lib/agents/products/match-rank";
import {
  useAiFieldEditPhases,
  type AiFieldEditPhases,
} from "@/hooks/use-ai-field-edit-highlight";

function profitTone(amount: number): string {
  return amount >= 0 ? "text-brand-accent" : "text-red-600";
}

export function EditedFieldValue({
  edit,
  phases: phasesProp,
  onEditConsumed,
  className,
  children,
}: {
  edit?: AiFieldEditRecord | null;
  phases?: AiFieldEditPhases;
  onEditConsumed?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const internal = useAiFieldEditPhases(phasesProp ? null : edit, onEditConsumed);
  const phases = phasesProp ?? internal;

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-1 -mx-1 transition-colors duration-300",
          phases.valueHighlight && "ai-field-value-highlight",
          className
        )}
      >
        <span
          className={cn(
            "transition-colors duration-300",
            phases.valueHighlight && "text-sky-700"
          )}
        >
          {children}
        </span>
        {phases.pill ? (
          <span className="ai-edit-pill inline-flex shrink-0 rounded-full bg-sky-100/90 px-1.5 py-px text-[9px] font-semibold tracking-wide text-sky-700">
            AI修改
          </span>
        ) : null}
      </span>
      {phases.beforeAfter && edit ? (
        <span className="ai-before-after text-[10px] font-medium tabular-nums text-sky-600/75">
          {edit.previousDisplay} → {edit.nextDisplay}
          {edit.currency ? ` ${edit.currency}` : ""}
        </span>
      ) : null}
    </span>
  );
}

/** Profit line with strike-through old value when listing price was AI-edited. */
export function EditedProfitLine({
  label = "每单获利：",
  previous,
  next,
  phases,
  className,
  inline = false,
  valueColor,
}: {
  label?: string;
  previous?: { amount: number; currency: string } | null;
  next?: { amount: number; currency: string } | null;
  phases?: AiFieldEditPhases;
  className?: string;
  inline?: boolean;
  /** Override value color (e.g. to match label). Falls back to profitTone when unset. */
  valueColor?: string;
}) {
  if (!next) return null;

  const Tag = inline ? "span" : "p";

  const showTransition =
    previous != null &&
    Math.abs(previous.amount - next.amount) >= 0.01;

  if (!showTransition) {
    return (
      <Tag
        className={cn(
          inline
            ? "inline-flex items-baseline gap-0.5 text-[11px] font-semibold tabular-nums"
            : "mt-0.5 text-[11px] font-semibold tabular-nums",
          className
        )}
      >
        <span className="text-slate-500">{label}</span>
        <span className={valueColor ?? profitTone(next.amount)}>
          {formatTargetMoney(next.amount, next.currency)}
        </span>
      </Tag>
    );
  }

  return (
    <Tag
      className={cn(
        inline
          ? "inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold"
          : "mt-0.5 inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-semibold",
        className
      )}
    >
      <span className="text-slate-500">{label}</span>
      <span
        className={cn(
          "tabular-nums line-through decoration-slate-400/90 text-slate-400 transition-opacity duration-300",
          phases?.valueHighlight && "opacity-80"
        )}
      >
        {formatTargetMoney(previous.amount, previous.currency)}
      </span>
      <span className="text-slate-300" aria-hidden>
        →
      </span>
      <span
        className={cn(
          "rounded px-0.5 -mx-0.5 tabular-nums transition-colors duration-300",
          phases?.valueHighlight && "ai-field-value-highlight text-sky-700",
          !phases?.valueHighlight && (valueColor ?? profitTone(next.amount))
        )}
      >
        {formatTargetMoney(next.amount, next.currency)}
      </span>
    </Tag>
  );
}

export { useAiFieldEditPhases };
