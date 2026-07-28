/**
 * Account-center data display primitives.
 *
 * StatItem, Pagination, SegmentedFilter — small, presentational, token-aligned.
 * Extracted from balance/shops/profile pages so all account data views share
 * the same look and the same color tokens (semantic, not legacy).
 */

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "@/lib/ui/icons";
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
 * Used for shops summary (total / active / needs attention). Keeps tone→color
 * mapping consistent across account pages.
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
        {t("accountCommon.pageOf", { page, total: totalPages })}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPage(Math.max(0, offset - pageSize))}
          disabled={!hasPrev}
        >
          {t("accountCommon.prev")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPage(offset + pageSize)}
          disabled={!hasNext}
        >
          {t("accountCommon.next")}
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

// ===== LedgerTable =====

/**
 * High-density data table for account ledger views.
 *
 * Replaces the previous "ul + flex-wrap" pattern that doubled as a table but
 * offered no column alignment, no header, and no sort. The table:
 *   - Renders a real `<table>` with a sticky-ish header row, semantic tokens,
 *     and right-aligned numeric columns.
 *   - Supports per-column sort: column is clickable when `sortable: true` AND
 *     a `sortValue` extractor is defined AND the caller wires `onSortChange`.
 *     Use `sortLedgerRows` below if you want client-side sort instead of
 *     pushing sort to the backend.
 *   - Wraps in `overflow-x-auto` so narrow screens scroll horizontally
 *     instead of wrapping every cell into a paragraph.
 *   - Caller still owns loading/empty/error/pagination — the table only
 *     renders the rows you pass.
 */
export type AccountLedgerDir = "asc" | "desc";

export interface AccountLedgerColumn<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right" | "center";
  /** CSS width, e.g. `"120px"`, `"20%"`. */
  width?: string;
  className?: string;
  render: (row: T) => ReactNode;
  /** Required for sort. Return a primitive that's comparable. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Clickable-header affordance is shown only when sortable + sortValue. */
  sortable?: boolean;
}

export interface AccountLedgerTableProps<T> {
  columns: AccountLedgerColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  sortKey?: string;
  sortDir?: AccountLedgerDir;
  onSortChange?: (key: string, dir: AccountLedgerDir) => void;
  className?: string;
  tableClassName?: string;
  zebra?: boolean;
  /** Min-width to force horizontal scroll on narrow screens. Default 100%. */
  minWidth?: string;
}

function ledgerAlignClass(align?: "left" | "right" | "center"): string {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function AccountLedgerTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  sortKey,
  sortDir,
  onSortChange,
  className,
  tableClassName,
  zebra,
  minWidth,
}: AccountLedgerTableProps<T>) {
  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const next: AccountLedgerDir =
      sortKey === key && sortDir === "asc" ? "desc" : "asc";
    onSortChange(key, next);
  };

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table
        className={cn("w-full text-[11px] tabular-nums", tableClassName)}
        style={minWidth ? { minWidth } : undefined}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-y border-surface-border bg-muted/30">
            {columns.map((col) => {
              const canSort = !!col.sortable && !!col.sortValue && !!onSortChange;
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-3 py-2 font-medium text-muted-foreground whitespace-nowrap",
                    ledgerAlignClass(col.align),
                    canSort && "cursor-pointer select-none hover:text-foreground transition-colors",
                    col.className
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={canSort ? () => handleSort(col.key) : undefined}
                  aria-sort={
                    isSorted
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {canSort && isSorted ? (
                      sortDir === "asc" ? (
                        <ArrowUp className="h-3 w-3 text-foreground" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-foreground" />
                      )
                    ) : null}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {rows.map((row, idx) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "transition-colors hover:bg-muted/20",
                zebra && idx % 2 === 1 && "bg-muted/10"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 align-middle",
                    ledgerAlignClass(col.align),
                    col.className
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pure client-side sort helper for callers that don't push sort to the API.
 * Stable on equal keys; null/undefined always sort to the end.
 */
export function sortLedgerRows<T>(
  rows: T[],
  sortKey: string | undefined,
  sortDir: AccountLedgerDir | undefined,
  columns: AccountLedgerColumn<T>[]
): T[] {
  if (!sortKey || !sortDir) return rows;
  const col = columns.find((c) => c.key === sortKey);
  if (!col?.sortValue) return rows;
  const fn = col.sortValue;
  const sorted = [...rows].sort((a, b) => {
    const va = fn(a);
    const vb = fn(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return sorted;
}
