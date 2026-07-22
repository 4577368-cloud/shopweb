import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type MetricTone = "default" | "brand" | "warning" | "neutral";

export interface MetricSummaryItem {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: MetricTone;
}

const iconToneMap: Record<MetricTone, string> = {
  default: "bg-slate-100 text-slate-500",
  brand: "bg-brand-soft text-brand-strong",
  warning: "bg-amber-50 text-amber-600",
  neutral: "bg-slate-100 text-slate-400",
};

interface MetricSummaryCardsProps {
  items: MetricSummaryItem[];
  className?: string;
}

/**
 * The KPI summary strip used at the top of the work area (prototypes: /sku-align 4 counts).
 * Compact cards: value + label on one line, optional hint below, tinted icon bubble.
 */
export function MetricSummaryCards({ items, className }: MetricSummaryCardsProps) {
  return (
    <div
      className={cn(
        "grid gap-2",
        items.length >= 4
          ? "grid-cols-2 lg:grid-cols-4"
          : items.length === 3
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 shadow-card"
        >
          <div className="min-w-0">
            <p className="flex min-w-0 items-baseline gap-1.5 leading-tight">
              <span className="shrink-0 text-lg font-semibold tabular-nums tracking-tight text-ink">
                {item.value}
              </span>
              <span className="truncate text-xs text-ink-muted">{item.label}</span>
            </p>
            {item.hint ? (
              <p className="mt-0.5 truncate text-[11px] leading-snug text-ink-subtle">
                {item.hint}
              </p>
            ) : null}
          </div>
          {item.icon ? (
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                iconToneMap[item.tone ?? "default"]
              )}
            >
              {item.icon}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
