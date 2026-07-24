"use client";

import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import { needsAttentionCount, pendingWorkCount } from "@/lib/logistics/display";
import type { LogisticsWorkflowStep } from "@/lib/logistics/page-constants";
import { useT } from "@/i18n/LocaleProvider";

export type { LogisticsWorkflowStep } from "@/lib/logistics/page-constants";

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
  const t = useT();
  const pending = pendingWorkCount(metrics);
  const attention = needsAttentionCount(metrics);

  const tabs = [
    { id: "setup" as const, label: t("logisticsWorkflow.stepSetup") },
    {
      id: "estimate" as const,
      label: t("logisticsWorkflow.stepEstimate"),
      count:
        hasSavedTemplate && metrics.pendingQuoteCount > 0
          ? metrics.pendingQuoteCount
          : undefined,
    },
    {
      id: "confirm" as const,
      label: t("logisticsWorkflow.stepConfirm"),
      count:
        hasSavedTemplate && pending + attention > 0
          ? pending + attention
          : undefined,
    },
  ];

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5 shadow-card">
      <p className="mb-2 text-[11px] text-ink-subtle">{t("logisticsWorkflow.hint")}</p>
      <SegmentedTabs
        variant="chip"
        tabs={tabs}
        value={step}
        onValueChange={(id) => onStepChange(id as LogisticsWorkflowStep)}
      />
    </div>
  );
}
