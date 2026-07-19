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
 * The KPI summary strip used at the top of the work area (prototypes: /sku-align 4 counts,
 * /products 4 metrics). A responsive grid of light cards, each with a big value, a label, an optional
 * hint, and a tinted icon bubble. Presentational only; callers pass already-computed values.
 */
export function MetricSummaryCards({ items, className }: MetricSummaryCardsProps) {
  return (
    <div
      className={cn(
        "grid gap-2.5",
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
          className="flex items-start justify-between gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3.5 py-3 shadow-card"
        >
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-7 tracking-tight text-ink">
              {item.value}
            </p>
            <p className="mt-0.5 truncate text-xs text-ink-muted">{item.label}</p>
            {item.hint ? (
              <p className="mt-0.5 truncate text-[11px] text-ink-subtle">{item.hint}</p>
            ) : null}
          </div>
          {item.icon ? (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
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
