"use client";

import { Sparkles } from "lucide-react";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { cn } from "@/lib/utils";
import {
  computeLogisticsPlanMetrics,
  type LogisticsFilterMode,
} from "@/lib/logistics/display";
import { countryFlagEmoji, countryMarketLabel } from "@/lib/logistics/markets";
import {
  formatSpeedPriorityLabel,
  listTemplateCountryCodes,
} from "@/lib/logistics/template-params";
import type { LogisticsAnalysis, LogisticsTemplate } from "@/lib/types";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import type { LogisticsEstimateResult } from "@/lib/api";

function ProgressRing({
  percent,
  size = 60,
}: {
  percent: number;
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
        <span className="mt-0.5 text-[9px] text-ink-subtle">已报价</span>
      </div>
    </div>
  );
}

const FILTER_TABS = (
  metrics: ReturnType<typeof computeLogisticsPlanMetrics>
): { id: LogisticsFilterMode; label: string; count?: number }[] => [
  { id: "all", label: "全部", count: metrics.variantCount },
  { id: "ready", label: "自动完成", count: metrics.autoReadyCount },
  { id: "quoted", label: "已报价", count: metrics.quotedCount },
  { id: "issues", label: "需确认", count: metrics.reviewCount },
  { id: "unidentified", label: "无法识别", count: metrics.unidentifiedCount },
];

function StrategyCard({
  activeTemplate,
  marketCode,
  onOpenStrategy,
}: {
  activeTemplate: LogisticsTemplate | null;
  marketCode: string;
  onOpenStrategy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpenStrategy}
      className="flex min-w-[10.5rem] flex-col rounded-[var(--radius-control)] border border-hairline bg-surface-muted/30 px-3 py-2 text-left shadow-card transition-colors hover:border-brand/30 hover:bg-brand-soft/20"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-ink">当前物流策略</p>
        <span className="shrink-0 text-[10px] font-medium text-brand-strong">
          修改
        </span>
      </div>
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
        <span className="text-sm leading-none" aria-hidden>
          {countryFlagEmoji(marketCode)}
        </span>
        {countryMarketLabel(marketCode)}
      </p>
      <p className="mt-0.5 text-[10px] leading-snug text-ink-subtle">
        {activeTemplate
          ? formatSpeedPriorityLabel(activeTemplate.speedPreference)
          : "未配置模板"}
        {activeTemplate?.name ? ` · ${activeTemplate.name}` : ""}
      </p>
    </button>
  );
}

function PlanStatusTip({
  metrics,
}: {
  metrics: ReturnType<typeof computeLogisticsPlanMetrics>;
}) {
  if (
    metrics.reviewCount > 0 ||
    metrics.unidentifiedCount > 0 ||
    metrics.autoReadyCount > 0
  ) {
    const parts: string[] = [];
    if (metrics.quotedCount > 0) {
      parts.push(`已报价 ${metrics.quotedCount} 个 SKU`);
    }
    if (metrics.autoReadyCount > 0) {
      parts.push(`待拉取报价 ${metrics.autoReadyCount} 个`);
    }
    if (metrics.reviewCount > 0) {
      parts.push(`需确认 ${metrics.reviewCount} 个`);
    }
    if (metrics.unidentifiedCount > 0) {
      parts.push(`无法识别 ${metrics.unidentifiedCount} 个`);
    }
    return (
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-amber-900">
        {parts.join(" · ")}。请切换对应 Tab 处理。
      </p>
    );
  }
  if (metrics.quotedCount > 0) {
    return (
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-brand-strong">
        全部 SKU 已报价，确认方案后即可进入同步。
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
  quoteMarketCode: string | null;
  onOpenStrategy: () => void;
  pipelineProgress?: LogisticsPipelineProgress;
  quoteResults?: Map<string, LogisticsEstimateResult>;
  className?: string;
}) {
  const metrics = computeLogisticsPlanMetrics(analysis, quoteResults);
  const marketCodes = listTemplateCountryCodes(activeTemplate);
  const marketCode = quoteMarketCode ?? marketCodes[0] ?? "US";
  const filterTabs = FILTER_TABS(metrics);
  const pipelineRunning = pipelineProgress?.phase === "running";
  const ringPercent =
    pipelineRunning && pipelineProgress.productTotal > 0
      ? Math.round(
          (pipelineProgress.productIndex / pipelineProgress.productTotal) * 100
        )
      : metrics.completionPercent;
  const tip = pipelineRunning ? (
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-sky-900">
      正在获取运费预估{" "}
      <span className="font-semibold tabular-nums">
        {pipelineProgress?.productIndex ?? 0}/{pipelineProgress?.productTotal ?? 0}
      </span>
      {pipelineProgress?.currentProductTitle
        ? ` · ${pipelineProgress.currentProductTitle}`
        : ""}
    </p>
  ) : metrics.autoReadyCount > 0 && metrics.quotedCount === 0 ? (
    <p className="min-w-0 flex-1 text-[11px] leading-snug text-ink-subtle">
      点击右上角「一键预估」开始拉取线路报价。
    </p>
  ) : (
    <PlanStatusTip metrics={metrics} />
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
            <h2 className="text-xs font-semibold text-ink">AI 匹配进度</h2>
          </div>
          {tip}
        </div>

        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <ProgressRing percent={ringPercent} />

            <div
              className="grid min-h-[3.75rem] flex-1 grid-cols-2 divide-x divide-hairline sm:grid-cols-5"
              aria-label="物流匹配统计"
            >
              <StatCell label="商品总数" value={metrics.productCount} />
              <StatCell
                label="已报价"
                value={metrics.quotedCount}
                valueClassName="text-brand-strong"
              />
              <StatCell label="自动完成" value={metrics.autoReadyCount} />
              <StatCell
                label="需确认"
                value={metrics.reviewCount}
                valueClassName="text-amber-600"
              />
              <StatCell
                label="无法识别"
                value={metrics.unidentifiedCount}
                valueClassName="text-ink-subtle"
              />
            </div>
          </div>

          <div className="hidden w-px shrink-0 self-stretch bg-hairline lg:block" aria-hidden />

          <StrategyCard
            activeTemplate={activeTemplate}
            marketCode={marketCode}
            onOpenStrategy={onOpenStrategy}
          />
        </div>
      </div>

      <SegmentedTabs
        variant="chip"
        tabs={filterTabs}
        value={filterMode}
        onValueChange={(id) => onFilterModeChange(id as LogisticsFilterMode)}
      />
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
