"use client";

import { useCallback, useEffect, useRef } from "react";
import { deriveLogisticsWorkflowStep } from "@/components/logistics/logistics-workflow-steps";
import {
  coerceLogisticsFilterMode,
  type LogisticsFilterMode,
  type LogisticsPlanMetrics,
} from "@/lib/logistics/display";
import type { LogisticsWorkflowStep } from "@/lib/logistics/page-constants";

export interface UseLogisticsWorkflowNavigationParams {
  workflowStep: LogisticsWorkflowStep;
  setWorkflowStep: (step: LogisticsWorkflowStep) => void;
  hasSavedTemplate: boolean;
  planMetrics: LogisticsPlanMetrics;
  setFilterMode: React.Dispatch<React.SetStateAction<LogisticsFilterMode>>;
  onClearFocusTarget?: () => void;
}

/** Workflow step changes, filter coercion, list scroll, and template-driven step sync. */
export function useLogisticsWorkflowNavigation({
  workflowStep,
  setWorkflowStep,
  hasSavedTemplate,
  planMetrics,
  setFilterMode,
  onClearFocusTarget,
}: UseLogisticsWorkflowNavigationParams) {
  const logisticsListRef = useRef<HTMLDivElement>(null);

  const scrollToLogisticsList = useCallback(() => {
    requestAnimationFrame(() => {
      logisticsListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  useEffect(() => {
    setFilterMode((prev) => coerceLogisticsFilterMode(prev, planMetrics));
  }, [planMetrics, setFilterMode]);

  // Migrate leftover setup step / auto-pick estimate vs confirm from metrics.
  // Never force setup — template lives on the rail card like pricing.
  useEffect(() => {
    if (workflowStep === "setup") {
      setWorkflowStep(
        deriveLogisticsWorkflowStep({ hasSavedTemplate, metrics: planMetrics })
      );
    }
  }, [hasSavedTemplate, planMetrics, workflowStep, setWorkflowStep]);

  const handleWorkflowStepChange = useCallback(
    (step: LogisticsWorkflowStep) => {
      const next = step === "setup" ? "estimate" : step;
      setWorkflowStep(next);
      if (next === "estimate") {
        setFilterMode("pending_quote");
        scrollToLogisticsList();
      } else if (next === "confirm") {
        const attention =
          planMetrics.exceptionCount + planMetrics.skuUnlinkedCount;
        setFilterMode(attention > 0 ? "needs_attention" : "pending_confirm");
        scrollToLogisticsList();
      } else {
        setFilterMode("all");
      }
    },
    [
      planMetrics.exceptionCount,
      planMetrics.skuUnlinkedCount,
      scrollToLogisticsList,
      setFilterMode,
      setWorkflowStep,
    ]
  );

  const handleViewPendingConfirm = useCallback(() => {
    setFilterMode("pending_confirm");
    onClearFocusTarget?.();
    scrollToLogisticsList();
  }, [onClearFocusTarget, scrollToLogisticsList, setFilterMode]);

  const handleViewExceptions = useCallback(() => {
    setFilterMode("needs_attention");
    onClearFocusTarget?.();
    scrollToLogisticsList();
  }, [onClearFocusTarget, scrollToLogisticsList, setFilterMode]);

  return {
    logisticsListRef,
    scrollToLogisticsList,
    handleWorkflowStepChange,
    handleViewPendingConfirm,
    handleViewExceptions,
  };
}
