"use client";

import { Loader2, Plus, RefreshCw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DECISION_LABELS,
  formatTemplateMeta,
  type LogisticsFilterMode,
} from "@/lib/logistics/display";
import { countryLabel } from "@/lib/logistics/markets";
import { listTemplateCountryCodes } from "@/lib/logistics/template-params";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
} from "@/lib/types";

const STAT_ORDER: LogisticsDecisionStatus[] = [
  "ready_for_quote",
  "pending_postal_meta",
  "pending_sku",
  "needs_review",
  "restricted",
];

const FILTER_TABS: { id: LogisticsFilterMode; label: string }[] = [
  { id: "issues", label: "问题项" },
  { id: "all", label: "全部" },
  { id: "ready", label: "可报价" },
];

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
  const counts = analysis?.decisionStatusCounts;
  const marketCodes = listTemplateCountryCodes(activeTemplate);

  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTemplate(t)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                activeTemplate?.id === t.id
                  ? "bg-brand text-white"
                  : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
              )}
            >
              {t.name}
            </button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-ink-subtle"
            onClick={onAddTemplate}
          >
            <Plus className="mr-1 h-3 w-3" />
            新增
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-ink-subtle"
          onClick={onOpenTemplateConfig}
        >
          <Settings className="mr-1 h-3 w-3" />
          模板配置
        </Button>
      </div>

      <p className="text-xs text-ink-subtle">{formatTemplateMeta(activeTemplate)}</p>

      {marketCodes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-subtle">报价市场</span>
          <Select
            value={quoteMarketCode ?? marketCodes[0]}
            onChange={(e) => onQuoteMarketChange(e.target.value)}
            className="h-7 w-auto min-w-[8rem] text-xs"
          >
            {marketCodes.map((code) => (
              <option key={code} value={code}>
                {countryLabel(code)}
              </option>
            ))}
          </Select>
        </div>
      ) : quoteMarketCode ? (
        <p className="text-[11px] text-ink-subtle">
          报价市场: {countryLabel(quoteMarketCode)}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {STAT_ORDER.map((status) => (
          <div
            key={status}
            className="min-w-[4.5rem] rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-2.5 py-1.5"
          >
            <p className="text-[10px] text-ink-subtle">{DECISION_LABELS[status]}</p>
            <p className="text-sm font-semibold tabular-nums text-ink">
              {counts?.[status] ?? 0}
            </p>
          </div>
        ))}
      </div>

      {analysis ? (
        <p className="text-[11px] text-ink-subtle">
          已关联 {analysis.analyzedCount} 个商品 · {analysis.totalVariants} 个规格
          {analysis.skippedUnboundCount > 0
            ? ` · 跳过未绑 ${analysis.skippedUnboundCount}`
            : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFilterModeChange(tab.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium",
                filterMode === tab.id
                  ? "bg-ink text-white"
                  : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2"
          onClick={onReclassify}
          disabled={reclassifying}
          title="重新归类"
          aria-label="重新归类"
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
