"use client";

import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import { needsAttentionCount, pendingWorkCount } from "@/lib/logistics/display";

export type LogisticsWorkflowStep = "setup" | "estimate" | "confirm";

export function deriveLogisticsWorkflowStep(input: {
  hasSavedTemplate: boolean;
  metrics: LogisticsPlanMetrics;
}): LogisticsWorkflowStep {
  if (!input.hasSavedTemplate) return "setup";
  if (input.metrics.pendingQuoteCount > 0) return "estimate";
  return "confirm";
}

export function LogisticsWorkflowSteps({
  step,
  onStepChange,
  hasSavedTemplate,
  metrics,
}: {
  step: LogisticsWorkflowStep;
  onStepChange: (step: LogisticsWorkflowStep) => void;
  hasSavedTemplate: boolean;
  metrics: LogisticsPlanMetrics;
}) {
  const pending = pendingWorkCount(metrics);
  const attention = needsAttentionCount(metrics);

  const tabs = [
    { id: "setup" as const, label: "1 配置策略" },
    {
      id: "estimate" as const,
      label: "2 运费预估",
      count:
        hasSavedTemplate && metrics.pendingQuoteCount > 0
          ? metrics.pendingQuoteCount
          : undefined,
    },
    {
      id: "confirm" as const,
      label: "3 确认方案",
      count:
        hasSavedTemplate && pending + attention > 0
          ? pending + attention
          : undefined,
    },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5 shadow-card">
      <p className="mb-2 text-[11px] text-ink-subtle">
        按步骤完成：先配置模板 → 批量预估普货运费 → 确认或处理异常项
      </p>
      <SegmentedTabs
        variant="chip"
        tabs={tabs}
        value={step}
        onValueChange={(id) => onStepChange(id as LogisticsWorkflowStep)}
      />
    </div>
  );
}
