"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";

const LogisticsTemplateSetupCard = dynamic(
  () =>
    import("@/components/logistics/logistics-template-setup-card").then((m) => ({
      default: m.LogisticsTemplateSetupCard,
    })),
  { ssr: false }
);

export interface LogisticsWorkflowSetupSectionProps {
  workflowStep: "setup" | "estimate" | "confirm";
  hasSavedTemplate: boolean;
  loading: boolean;
  hasAnalysis: boolean;
  onOpenTemplate: () => void;
  onStartEstimate: () => void;
}

/** Setup step: first-time template card or post-save CTA to estimate. */
export function LogisticsWorkflowSetupSection({
  workflowStep,
  hasSavedTemplate,
  loading,
  hasAnalysis,
  onOpenTemplate,
  onStartEstimate,
}: LogisticsWorkflowSetupSectionProps) {
  const t = useT();

  if (workflowStep !== "setup") return null;

  if (!hasSavedTemplate && !loading) {
    return <LogisticsTemplateSetupCard onOpenTemplate={onOpenTemplate} />;
  }

  if (hasSavedTemplate && hasAnalysis) {
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/20 px-4 py-6 text-center">
        <p className="text-sm font-medium text-ink">
          {t("logistics.strategyConfigured")}
        </p>
        <p className="mt-1 text-xs text-ink-subtle">
          {t("logistics.strategyConfiguredDesc")}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Button size="sm" onClick={onStartEstimate}>
            {t("logistics.actionEstimate")}
          </Button>
          <Button size="sm" variant="secondary" onClick={onOpenTemplate}>
            {t("logistics.editStrategy")}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
