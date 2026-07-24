"use client";

import { Sparkles } from "@/lib/ui/icons";
import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { cn } from "@/lib/utils";
import {
  buildLogisticsFilterTabs,
  collectPostalLimitFilterOptions,
  computeLogisticsPlanMetrics,
  pendingWorkCount,
  needsAttentionCount,
  type LogisticsFilterMode,
  type PostalLimitFilter,
} from "@/lib/logistics/display";
import { countryFlagEmoji, localizedCountryMarketLabel } from "@/lib/logistics/markets";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import {
  listTemplateCountryCodes,
} from "@/lib/logistics/template-params";
import type { LogisticsAnalysis, LogisticsTemplate } from "@/lib/types";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import type { LogisticsEstimateResult } from "@/lib/api";

function ProgressRing({
  percent,
  quotedLabel,
  size = 60,
}: {
  percent: number;
  quotedLabel: string;
  size?: number;
}) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset =
    circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-surface-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-brand transition-all duration-700"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold tabular-nums leading-none text-ink">
          {percent}%
        </span>
        <span className="mt-0.5 text-[9px] text-ink-subtle">{quotedLabel}</span>
      </div>
    </div>
  );
}

function speedPriorityLabel(
  t: ReturnType<typeof useT>,
  pref: LogisticsTemplate["speedPreference"] | string | undefined
): string {
  switch (pref) {
    case "ECONOMY":
      return t("logisticsUi.speedEconomyDays");
    case "FAST":
      return t("logisticsUi.speedFastDays");
    case "BALANCED":
    default:
      return t("logisticsUi.speedBalancedDays");
  }
}

function StrategyCard({
  activeTemplate,
  marketCode,
  onOpenStrategy,
  t,
  locale,
}: {
  activeTemplate: LogisticsTemplate | null;
  marketCode: string;
  onOpenStrategy: () => void;
  t: ReturnType<typeof useT>;
  locale: ReturnType<typeof useLocale>;
}) {
  return (
    <button
      type="button"
      onClick={onOpenStrategy}
      className="flex min-w-[10.5rem] flex-col rounded-[var(--radius-control)] border border-hairline bg-surface-muted/30 px-3 py-2 text-left shadow-card transition-colors hover:border-brand/30 hover:bg-brand-soft/20"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink">{t("logisticsUi.currentStrategy")}</p>
        <span className="shrink-0 text-[10px] font-medium text-brand-strong">
          {t("logisticsUi.modify")}
        </span>
      </div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
        <span className="text-sm leading-none" aria-hidden>
          {countryFlagEmoji(marketCode)}
        </span>
        {localizedCountryMarketLabel(marketCode, locale)}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-ink-subtle">
        {activeTemplate
          ? speedPriorityLabel(t, activeTemplate.speedPreference)
          : t("logisticsUi.noTemplate")}
        {activeTemplate?.name ? ` · ${activeTemplate.name}` : ""}
      </p>
    </button>
  );
}

function PlanStatusTip({
  metrics,
  t,
}: {
  metrics: ReturnType<typeof computeLogisticsPlanMetrics>;
  t: ReturnType<typeof useT>;
}) {
  if (
    metrics.pendingConfirmCount > 0 ||
    metrics.skuUnlinkedCount > 0 ||
    metrics.pendingQuoteCount > 0
  ) {
    const parts: string[] = [];
    const pending = pendingWorkCount(metrics);
    if (pending > 0) {
      parts.push(t("logisticsUi.tipPendingCount", { count: pending }));
    }
    const attention = needsAttentionCount(metrics);
    if (attention > 0) {
      parts.push(t("logisticsUi.tipAttentionCount", { count: attention }));
    }
    return (
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-900">
        {parts.join(" · ")}
        {t("logisticsUi.tipPendingSuffix")}
      </p>
    );
  }
  if (metrics.quotedCount > 0) {
    return (
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-brand-strong">
        {t("logisticsUi.tipAllQuoted")}
      </p>
    );
  }
  return null;
}

export function LogisticsPlanStatusCard({
  analysis,
  activeTemplate,
  filterMode,
  onFilterModeChange,
  postalLimitFilter,
  onPostalLimitFilterChange,
  quoteMarketCode,
  onOpenStrategy,
  pipelineProgress,
  quoteResults,
  className,
}: {
  analysis: LogisticsAnalysis | null;
  activeTemplate: LogisticsTemplate | null;
  filterMode: LogisticsFilterMode;
  onFilterModeChange: (mode: LogisticsFilterMode) => void;
  postalLimitFilter: PostalLimitFilter;
  onPostalLimitFilterChange: (value: PostalLimitFilter) => void;
  quoteMarketCode: string | null;
  onOpenStrategy: () => void;
  pipelineProgress?: LogisticsPipelineProgress;
  quoteResults?: Map<string, LogisticsEstimateResult>;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const metrics = computeLogisticsPlanMetrics(analysis, quoteResults);
  const postalOptions = collectPostalLimitFilterOptions(t, analysis);
  const marketCodes = listTemplateCountryCodes(activeTemplate);
  const marketCode = quoteMarketCode ?? marketCodes[0] ?? "US";
  const filterTabs = buildLogisticsFilterTabs(t, metrics);
  const pipelineRunning = pipelineProgress?.phase === "running";
  const ringPercent =
    pipelineRunning && pipelineProgress.productTotal > 0
      ? Math.round(
          (pipelineProgress.productIndex / pipelineProgress.productTotal) * 100
        )
      : metrics.completionPercent;
  const tip = pipelineRunning ? (
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-sky-900">
      {t("logisticsUi.pipelineFetching")}{" "}
      <span className="font-semibold tabular-nums">
        {pipelineProgress?.productIndex ?? 0}/{pipelineProgress?.productTotal ?? 0}
      </span>
      {pipelineProgress?.currentProductTitle
        ? ` · ${pipelineProgress.currentProductTitle}`
        : ""}
    </p>
  ) : metrics.pendingQuoteCount > 0 && metrics.quotedCount === 0 ? (
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-subtle">
      {t("logisticsUi.clickEstimateHint")}
    </p>
  ) : (
    <PlanStatusTip metrics={metrics} t={t} />
  );

  return (
    <section className={cn("space-y-2", className)}>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline/80 px-3 py-2",
            tip ? (pipelineRunning ? "bg-sky-50/50" : "bg-amber-50/50") : undefined
          )}
        >
          <div className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand-strong" />
            <h2 className="text-xs font-semibold text-ink">{t("logisticsUi.planProgressTitle")}</h2>
          </div>
          {tip}
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <ProgressRing
              percent={ringPercent}
              quotedLabel={t("logisticsUi.quotedPercent")}
            />

            <div
              className="grid min-h-[3.75rem] flex-1 grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-4 sm:divide-y-0"
              aria-label={t("logisticsUi.quoteStatsAria")}
            >
              <StatCell
                label={t("logisticsUi.filterPendingQuote")}
                value={metrics.pendingQuoteCount}
                valueClassName={
                  metrics.pendingQuoteCount > 0 ? "text-amber-600" : undefined
                }
              />
              <StatCell
                label={t("logisticsUi.filterPendingConfirm")}
                value={metrics.pendingConfirmCount}
                valueClassName={
                  metrics.pendingConfirmCount > 0 ? "text-sky-700" : undefined
                }
              />
              <StatCell
                label={t("logisticsUi.filterNeedsAttention")}
                value={needsAttentionCount(metrics)}
                valueClassName={
                  needsAttentionCount(metrics) > 0 ? "text-violet-700" : undefined
                }
              />
              <StatCell
                label={t("logisticsUi.quotedPercent")}
                value={metrics.quotedCount}
                valueClassName="text-brand-strong"
              />
            </div>
          </div>

          <div className="hidden w-px shrink-0 self-stretch bg-hairline lg:block" aria-hidden />

          <StrategyCard
            activeTemplate={activeTemplate}
            marketCode={marketCode}
            onOpenStrategy={onOpenStrategy}
            t={t}
            locale={locale}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs
          variant="chip"
          tabs={filterTabs}
          value={filterMode}
          onValueChange={(id) => onFilterModeChange(id as LogisticsFilterMode)}
          className="min-w-0 flex-1"
        />
        {postalOptions.length > 0 ? (
          <Select
            value={postalLimitFilter}
            onChange={(e) => onPostalLimitFilterChange(e.target.value)}
            className="h-8 w-auto min-w-[8.5rem] shrink-0 text-[11px]"
            aria-label={t("logisticsUi.postalFilterAria")}
          >
            <option value="all">{t("logisticsUi.allPostalLimits")}</option>
            {postalOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.count})
              </option>
            ))}
          </Select>
        ) : null}
      </div>
    </section>
  );
}

function StatCell({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center px-2 text-center">
      <p
        className={cn(
          "text-xl font-semibold tabular-nums leading-none text-ink",
          valueClassName
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] leading-none text-ink-subtle">{label}</p>
    </div>
  );
}
