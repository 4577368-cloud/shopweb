"use client";

import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import {
  buildLogisticsFilterTabs,
  collectPostalLimitFilterOptions,
  computeLogisticsPlanMetrics,
  type LogisticsFilterMode,
  type PostalLimitFilter,
} from "@/lib/logistics/display";
import type { LogisticsEstimateResult } from "@/lib/api";
import type { LogisticsAnalysis } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";

/** Sticky / header filter chips + postal-limit select for logistics. */
export function LogisticsFilterBar({
  analysis,
  filterMode,
  onFilterModeChange,
  postalLimitFilter,
  onPostalLimitFilterChange,
  quoteResults,
  className,
}: {
  analysis: LogisticsAnalysis | null;
  filterMode: LogisticsFilterMode;
  onFilterModeChange: (mode: LogisticsFilterMode) => void;
  postalLimitFilter: PostalLimitFilter;
  onPostalLimitFilterChange: (value: PostalLimitFilter) => void;
  quoteResults?: Map<string, LogisticsEstimateResult>;
  className?: string;
}) {
  const t = useT();
  const metrics = computeLogisticsPlanMetrics(analysis, quoteResults);
  const postalOptions = collectPostalLimitFilterOptions(t, analysis);
  const filterTabs = buildLogisticsFilterTabs(t, metrics);

  if (!analysis) return null;

  return (
    <div className={className ?? "flex min-w-0 flex-wrap items-center gap-2"}>
      <SegmentedTabs
        variant="chip"
        tabs={filterTabs}
        value={filterMode}
        onValueChange={(id) => onFilterModeChange(id as LogisticsFilterMode)}
        className="min-w-0"
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
  );
}
