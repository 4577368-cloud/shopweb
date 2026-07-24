"use client";

import Link from "next/link";
import { Loader2, RefreshCw, Search, X } from "@/lib/ui/icons";
import {
  MetricSummaryCards,
  type MetricSummaryItem,
} from "@/components/workbench/metric-summary-cards";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  SkuProductCard,
  type SkuFilterMode,
} from "@/components/sku-align/sku-binding-panel";
import type { PricingTemplate, SkuProductOverview } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import type { Locale } from "@/i18n/config";

export interface SkuAlignResultBodyProps {
  locale: Locale;
  metrics: MetricSummaryItem[];
  filterTabs: { id: string; label: string; count: number }[];
  filter: SkuFilterMode;
  onFilterChange: (id: SkuFilterMode) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  products: SkuProductOverview[];
  filtered: SkuProductOverview[];
  shopName: string;
  pricingTemplate: PricingTemplate | null;
  onRefresh: () => void;
  onAligned: () => void | Promise<void>;
  showToast: (message: string) => void;
}

export function SkuAlignResultBody({
  locale,
  metrics,
  filterTabs,
  filter,
  onFilterChange,
  searchQuery,
  onSearchQueryChange,
  loading,
  refreshing,
  error,
  products,
  filtered,
  shopName,
  pricingTemplate,
  onRefresh,
  onAligned,
  showToast,
}: SkuAlignResultBodyProps) {
  const t = useT();

  return (
    <div className="space-y-4">
      <MetricSummaryCards items={metrics} />

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedTabs
          variant="chip"
          tabs={filterTabs}
          value={filter}
          onValueChange={(id) => onFilterChange(id as SkuFilterMode)}
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:w-56 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={t("sku.searchPlaceholder")}
              className="h-8 w-full rounded-[var(--radius-control)] border border-hairline bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchQueryChange("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                aria-label={t("sku.clearSearchAria")}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 shrink-0 px-0"
            onClick={() => void onRefresh()}
            disabled={loading || refreshing}
            title={t("sku.refreshListAria")}
            aria-label={t("sku.refreshListAria")}
          >
            {loading || refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span>
              {t("sku.loadFailed", { error })}
              {error.includes("502") ? (
                <span className="mt-1 block text-xs text-red-600/90">
                  {t("sku.loadFailedHint")}
                </span>
              ) : null}
            </span>
            <Button size="sm" variant="secondary" onClick={() => void onRefresh()}>
              {t("sku.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <FadeSwap
        loading={loading && products.length === 0}
        minHeightClass="min-h-[420px]"
        skeleton={
          <Card>
            <TableSkeleton rows={5} />
          </Card>
        }
      >
        {error ? null : products.length === 0 ? (
          <EmptyState
            title={t("sku.emptyBoundTitle")}
            description={t("sku.emptyBoundDesc")}
            action={
              <Link href={localePath(locale, "/products")}>
                <Button size="sm" className="mt-1">
                  {t("sku.goSourcing")}
                </Button>
              </Link>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={
              searchQuery.trim() ? t("sku.emptySearchTitle") : t("sku.emptyFilterTitle")
            }
            description={
              searchQuery.trim()
                ? t("sku.emptySearchDesc")
                : filter === "fully_linked"
                  ? t("sku.emptyAllLinkedDesc")
                  : filter === "partially_linked"
                    ? t("sku.emptyPartialDesc")
                    : t("sku.emptyDefaultDesc")
            }
          />
        ) : (
          <div className="space-y-2.5">
            {filtered.map((p) => (
              <SkuProductCard
                key={p.thirdPlatformItemId}
                product={p}
                shopName={shopName}
                onAligned={async () => {
                  await onAligned();
                }}
                showToast={showToast}
                filterMode={filter}
                pricingTemplate={pricingTemplate}
              />
            ))}
          </div>
        )}
      </FadeSwap>
    </div>
  );
}
