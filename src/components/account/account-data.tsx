/**
 * Account-center data display primitives.
 *
 * StatItem, Pagination, SegmentedFilter — small, presentational, token-aligned.
 * Extracted from balance/shops/profile pages so all account data views share
 * the same look and the same color tokens (semantic, not legacy).
 */

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ===== StatItem =====

export type AccountStatTone = "default" | "ok" | "warn" | "muted" | "danger";

const toneClass: Record<AccountStatTone, string> = {
  default: "text-foreground",
  ok: "text-brand-accent",
  warn: "text-amber-600",
  muted: "text-muted-foreground/80",
  danger: "text-destructive",
};

/**
 * Compact stat tile — label + value (+ optional icon).
 *
 * Used for the balance overview (recharged / consumed / refunded) and the
 * shops summary (total / active / needs attention). Keeps tone→color mapping
 * consistent across pages so "warn" always means amber, "ok" always brand.
 */
export function AccountStatItem({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: AccountStatTone;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-surface-border bg-surface px-3 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground/80">
        {icon}
        <span>{label}</span>
      </p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-semibold tabular-nums",
          toneClass[tone]
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ===== Pagination =====

/** Translate-function shape used by i18n across the app. */
type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Minimal prev/next pagination for in-card lists.
 *
 * Returns null when total <= pageSize so single-page lists don't render a
 * footer. Page numbers are 1-based; offset is 0-based (matches the API).
 */
export function AccountPagination({
  offset,
  total,
  pageSize,
  onPage,
  t,
}: {
  offset: number;
  total: number;
  pageSize: number;
  onPage: (offset: number) => void;
  t: TranslateFn;
}) {
  if (total <= pageSize) return null;
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;
  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = Math.ceil(total / pageSize);
  return (
    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
      <span>
        {t("accountBills.pageOf", { page, total: totalPages })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPage(Math.max(0, offset - pageSize))}
          disabled={!hasPrev}
        >
          {t("accountBills.prev")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPage(offset + pageSize)}
          disabled={!hasNext}
        >
          {t("accountBills.next")}
        </Button>
      </div>
    </div>
  );
}

// ===== Segmented filter =====

/**
 * Pill-style segmented control for filtering in-card lists.
 *
 * Visually mirrors a native iOS segmented control — small, contained, no labels.
 * Use for short option sets (≤5). For longer sets, use a Select.
 */
export function AccountSegmentedFilter({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap rounded-[var(--radius-control)] border border-surface-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-[11px] font-medium transition-colors",
            value === o.value
              ? "bg-brand-soft text-brand-accent"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
