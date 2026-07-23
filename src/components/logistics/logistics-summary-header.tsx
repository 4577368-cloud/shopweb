"use client";

import { Loader2, Plus, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { cn } from "@/lib/utils";
import {
  buildLogisticsFilterTabs,
  computeLogisticsPlanMetrics,
  type LogisticsFilterMode,
} from "@/lib/logistics/display";
import { countryLabel } from "@/lib/logistics/markets";
import { listTemplateCountryCodes } from "@/lib/logistics/template-params";
import type { LogisticsAnalysis, LogisticsTemplate } from "@/lib/types";

const FILTER_TABS = buildLogisticsFilterTabs;

export function LogisticsSummaryHeader({
  analysis,
  templates,
  activeTemplate,
  filterMode,
  onFilterModeChange,
  onSelectTemplate,
  onAddTemplate,
  onOpenTemplateConfig,
  onReclassify,
  reclassifying,
  quoteMarketCode,
  onQuoteMarketChange,
}: {
  analysis: LogisticsAnalysis | null;
  templates: LogisticsTemplate[];
  activeTemplate: LogisticsTemplate | null;
  filterMode: LogisticsFilterMode;
  onFilterModeChange: (mode: LogisticsFilterMode) => void;
  onSelectTemplate: (template: LogisticsTemplate) => void;
  onAddTemplate: () => void;
  onOpenTemplateConfig: () => void;
  onReclassify: () => void;
  reclassifying: boolean;
  quoteMarketCode: string | null;
  onQuoteMarketChange: (code: string) => void;
}) {
  const metrics = computeLogisticsPlanMetrics(analysis);
  const marketCodes = listTemplateCountryCodes(activeTemplate);
  const filterTabs = FILTER_TABS(metrics);

  return (
    <section className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5 shadow-card">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTemplate(t)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              activeTemplate?.id === t.id
                ? "bg-brand text-white"
                : "bg-surface-muted text-ink-subtle hover:text-ink"
            )}
          >
            {t.name}
          </button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 px-0"
          onClick={onAddTemplate}
          title="新增模板"
          aria-label="新增模板"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 px-0"
          onClick={onOpenTemplateConfig}
          title="模板配置"
          aria-label="模板配置"
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="hidden h-4 w-px bg-hairline sm:block" aria-hidden />

      {marketCodes.length > 1 ? (
        <Select
          value={quoteMarketCode ?? marketCodes[0]}
          onChange={(e) => onQuoteMarketChange(e.target.value)}
          className="h-7 w-auto min-w-[7rem] text-[11px]"
        >
          {marketCodes.map((code) => (
            <option key={code} value={code}>
              {countryLabel(code)}
            </option>
          ))}
        </Select>
      ) : quoteMarketCode ? (
        <span className="text-[11px] text-ink-subtle">{countryLabel(quoteMarketCode)}</span>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <SegmentedTabs
          variant="chip"
          tabs={filterTabs}
          value={filterMode}
          onValueChange={(id) => onFilterModeChange(id as LogisticsFilterMode)}
        />
        <Button
          size="sm"
          variant="secondary"
          className="h-7 w-7 px-0"
          onClick={onReclassify}
          disabled={reclassifying}
          title="重新分析"
          aria-label="重新分析"
        >
          {reclassifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </section>
  );
}
