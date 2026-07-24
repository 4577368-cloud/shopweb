"use client";

import { Loader2, RefreshCw, Search, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";
import { useT } from "@/i18n/LocaleProvider";
import { localizeRecommendedCategoryName } from "@/lib/recommended-categories";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  ready: boolean;
  analyzed: number;
  matched: number;
  pending: number;
  unbound: number;
  pendingNewAnalysis?: number;
  recommendedCategories: RecommendedCategory[];
  onRefresh?: () => void;
  onViewDetails?: () => void;
  onViewNewArrivals?: () => void;
  /** Manual batch link for new arrivals only (no auto-run). */
  onBatchLinkNewArrivals?: () => void;
  batchLinkBusy?: boolean;
  className?: string;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function SmartSourcingSummaryBar({
  ready,
  analyzed,
  matched,
  pending,
  unbound,
  pendingNewAnalysis = 0,
  recommendedCategories,
  onRefresh,
  onViewDetails,
  onViewNewArrivals,
  onBatchLinkNewArrivals,
  batchLinkBusy = false,
  className,
  searchQuery = "",
  onSearchChange,
}: SmartSourcingSummaryBarProps) {
  const t = useT();
  const topCats = recommendedCategories.slice(0, 3);

  return (
    <section
      className={cn(
        "rounded-[var(--radius-control)] border border-hairline bg-surface/80 px-3 py-1.5",
        className
      )}
    >
      <div className="flex items-center gap-x-2 gap-y-1">
        {ready ? (
          <div className="hidden min-w-[12rem] flex-1 overflow-hidden rounded-full bg-surface-muted sm:block">
            <div className="flex h-1.5 rounded-full">
              <div
                className="rounded-l-full bg-[#90AAFF] transition-all duration-500"
                style={{ width: `${analyzed > 0 ? ((matched - pending) / analyzed) * 100 : 0}%` }}
                title={t("sourcing.confirmedTooltip", { count: matched - pending })}
              />
              <div
                className="bg-amber-400 transition-all duration-500"
                style={{ width: `${analyzed > 0 ? (pending / analyzed) * 100 : 0}%` }}
                title={t("sourcing.pendingTooltip", { count: pending })}
              />
              <div
                className="rounded-r-full bg-slate-400 transition-all duration-500"
                style={{ width: `${analyzed > 0 ? (unbound / analyzed) * 100 : 0}%` }}
                title={t("sourcing.unboundTooltip", { count: unbound })}
              />
            </div>
          </div>
        ) : null}

        <p className="ml-auto hidden shrink-0 text-xs leading-5 text-ink-muted sm:block transition-opacity duration-200">
          {ready ? (
            <>
              {t("sourcing.analyzed")}{" "}
              <span className="font-semibold text-ink">{analyzed}</span>
              {" · "}
              {t("sourcing.autoMatched")}{" "}
              <span className="font-semibold text-ink">{matched}</span>
              {" · "}
              {t("sourcing.pending")}{" "}
              <span
                className={
                  pending > 0 ? "font-semibold text-amber-600" : "font-semibold text-ink"
                }
              >
                {pending}
              </span>
              {" · "}
              {t("sourcing.unbound")}{" "}
              <span className="font-semibold text-ink">{unbound}</span>
              {topCats.length ? (
                <>
                  {" · "}
                  {t("sourcing.recommended")}{" "}
                  {topCats.map((c, i) => (
                    <span key={c.id} className="text-ink">
                      {i > 0 ? " / " : ""}
                      {localizeRecommendedCategoryName(t, c.id, c.name)}
                    </span>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#325BE6]" />
              {t("sourcing.analyzing")}
            </span>
          )}
        </p>

        {onSearchChange ? (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("sourcing.searchPlaceholder")}
              className="h-7 w-44 rounded-[var(--radius-control)] border border-hairline bg-surface pl-7 pr-2 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-1.5">
          {onViewDetails ? (
            <button
              type="button"
              onClick={onViewDetails}
              className="hidden text-[11px] font-medium text-link hover:text-link-hover hover:underline sm:inline"
            >
              {t("sourcing.viewDetails")}
            </button>
          ) : null}
          {onRefresh && !batchLinkBusy ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              className="h-7 w-7 px-0"
              title={t("sourcing.refreshTitle")}
              aria-label={t("sourcing.refreshAria")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <p className="mt-1 text-xs leading-5 text-ink-muted sm:hidden">
        {ready
          ? t("sourcing.mobileSummary", { analyzed, matched, pending, unbound })
          : t("sourcing.analyzing")}
      </p>

      {ready && pendingNewAnalysis > 0 && !batchLinkBusy ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-2.5 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-sky-900">
            {t("sourcing.newArrivalsBanner", { count: pendingNewAnalysis })}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {onBatchLinkNewArrivals ? (
              <Button
                type="button"
                size="sm"
                onClick={onBatchLinkNewArrivals}
                disabled={batchLinkBusy}
              >
                {batchLinkBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("productsPage.batchLinkNewArrivals", { count: pendingNewAnalysis })}
              </Button>
            ) : null}
            {onViewNewArrivals ? (
              <button
                type="button"
                onClick={onViewNewArrivals}
                className="text-[11px] font-medium text-sky-800 underline underline-offset-2 hover:text-sky-950"
              >
                {t("sourcing.viewNewArrivals")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
