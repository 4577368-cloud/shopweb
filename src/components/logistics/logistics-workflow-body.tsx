"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import type { CompletionGateResult } from "@/lib/logistics/completion-gate";
import type { LogisticsAnalysis } from "@/lib/types";
import {
  LogisticsDecisionWorkspace,
  type LogisticsDecisionWorkspaceProps,
} from "@/components/logistics/logistics-decision-workspace";
import { useT } from "@/i18n/LocaleProvider";

const LogisticsPlanStatusCard = dynamic(
  () =>
    import("@/components/logistics/logistics-plan-status-card").then((m) => ({
      default: m.LogisticsPlanStatusCard,
    })),
  { ssr: false }
);
const LogisticsSyncConfirmCard = dynamic(
  () =>
    import("@/components/logistics/logistics-sync-confirm-card").then((m) => ({
      default: m.LogisticsSyncConfirmCard,
    })),
  { ssr: false }
);
const LogisticsClassifyStage = dynamic(
  () =>
    import("@/components/logistics/logistics-classify-stage").then((m) => ({
      default: m.LogisticsClassifyStage,
    })),
  { ssr: false }
);

type PlanStatusProps = ComponentProps<typeof LogisticsPlanStatusCard>;

export interface LogisticsWorkflowBodyProps {
  loading: boolean;
  classifying: boolean;
  error: string | null;
  analysis: LogisticsAnalysis | null;
  hasSavedTemplate: boolean;
  onOpenTemplateDrawer: () => void;
  planStatus: PlanStatusProps | null;
  showSyncConfirm: boolean;
  completionGate: CompletionGateResult;
  saving: boolean;
  onSyncConfirm: () => void;
  onSyncCancel: () => void;
  onRetryLoad: () => void;
  workflowSkuProductCount?: number;
  showDecisionWorkspace: boolean;
  decisionWorkspace: Omit<
    LogisticsDecisionWorkspaceProps,
    "listRef" | "skuUnlinkedCount" | "pipelineRunning" | "pipelineProgress"
  > | null;
  listRef: RefObject<HTMLDivElement | null>;
  skuUnlinkedCount: number;
  pipelineRunning: boolean;
  pipelineProgress: LogisticsDecisionWorkspaceProps["pipelineProgress"];
}

/** Main logistics panel: plan status, load/error, decision list (no step tabs). */
export function LogisticsWorkflowBody({
  loading,
  classifying,
  error,
  analysis,
  hasSavedTemplate,
  onOpenTemplateDrawer,
  planStatus,
  showSyncConfirm,
  completionGate,
  saving,
  onSyncConfirm,
  onSyncCancel,
  onRetryLoad,
  workflowSkuProductCount,
  showDecisionWorkspace,
  decisionWorkspace,
  listRef,
  skuUnlinkedCount,
  pipelineRunning,
  pipelineProgress,
}: LogisticsWorkflowBodyProps) {
  const t = useT();

  return (
    <div className="space-y-4">
      {!isMallGatewayConfigured() ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          {t("logistics.tokenMissing")}
        </div>
      ) : null}

      {!hasSavedTemplate && !loading && analysis ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-amber-950">
              {t("logistics.templateRequiredTitle")}
            </p>
            <p className="text-xs leading-5 text-amber-900/80">
              {t("logistics.templateRequiredDesc")}
            </p>
          </div>
          <Button
            size="sm"
            className="mt-2 shrink-0 sm:mt-0"
            onClick={onOpenTemplateDrawer}
          >
            {t("logistics.templateRequiredCta")}
          </Button>
        </div>
      ) : null}

      {planStatus ? <LogisticsPlanStatusCard {...planStatus} /> : null}

      {showSyncConfirm ? (
        <LogisticsSyncConfirmCard
          gate={completionGate}
          saving={saving}
          onConfirm={onSyncConfirm}
          onCancel={onSyncCancel}
        />
      ) : null}

      {loading && !analysis ? (
        <LogisticsClassifyStage
          phase={classifying ? "classifying" : "loading"}
          productCount={workflowSkuProductCount}
        />
      ) : error && !analysis ? (
        <div className="rounded-[var(--radius-card)] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
          <Button
            size="sm"
            variant="secondary"
            className="ml-3"
            onClick={onRetryLoad}
          >
            {t("logistics.retry")}
          </Button>
        </div>
      ) : showDecisionWorkspace && decisionWorkspace ? (
        <LogisticsDecisionWorkspace
          listRef={listRef}
          skuUnlinkedCount={skuUnlinkedCount}
          pipelineRunning={pipelineRunning}
          pipelineProgress={pipelineProgress}
          {...decisionWorkspace}
        />
      ) : null}
    </div>
  );
}
