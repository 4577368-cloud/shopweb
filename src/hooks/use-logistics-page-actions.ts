"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { api, readableError } from "@/lib/api";
import {
  deriveLogisticsStepSnapshot,
  evaluateLogisticsCompletionGate,
} from "@/lib/logistics/completion-gate";
import type { LogisticsTemplateUpsert } from "@/lib/types";
import { stashLogisticsSyncExceptionCount } from "@/lib/logistics/sync-handoff";
import { resolveQuoteMarketCode } from "@/lib/logistics/template-params";
import type { LogisticsWorkflowStep } from "@/lib/logistics/page-constants";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
} from "@/lib/types";
import type { LogisticsEstimateResult } from "@/lib/api";
import type { MutableRefObject } from "react";

import type { Locale } from "@/i18n/config";
import type { WorkflowSkuProgress } from "@/lib/workflow-progress";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseLogisticsPageActionsParams {
  shopName: string;
  locale: Locale;
  router: AppRouterInstance;
  localePath: typeof import("@/i18n/LocaleLink").localePath;
  analysis: LogisticsAnalysis | null;
  setAnalysis: React.Dispatch<React.SetStateAction<LogisticsAnalysis | null>>;
  setTemplates: React.Dispatch<React.SetStateAction<LogisticsTemplate[]>>;
  activeTemplate: LogisticsTemplate | null;
  setActiveTemplate: React.Dispatch<React.SetStateAction<LogisticsTemplate | null>>;
  quoteResults: Map<string, LogisticsEstimateResult>;
  hasSavedTemplate: boolean;
  pipelineRunning: boolean;
  pipelineActive: boolean;
  suppressScopeSwitchToastRef: MutableRefObject<boolean>;
  setQuoteMarketCode: (code: string | null) => void;
  setWorkflowStep: (step: LogisticsWorkflowStep) => void;
  setShowDrawer: (open: boolean) => void;
  saveLogistics: () => void;
  showToast: (message: string) => void;
  t: TranslateFn;
  isAuthorized: boolean;
  skuReadyForNext: boolean;
  logisticsCompleted: boolean;
  workflowSku: WorkflowSkuProgress | null;
  publishLogisticsPipelineActive: (active: boolean) => void;
  publishLogisticsStepSnapshot: (
    snapshot: ReturnType<typeof deriveLogisticsStepSnapshot> | null
  ) => void;
}

export function useLogisticsPageActions({
  shopName,
  locale,
  router,
  localePath,
  analysis,
  setAnalysis,
  setTemplates,
  activeTemplate,
  setActiveTemplate,
  quoteResults,
  hasSavedTemplate,
  pipelineRunning,
  pipelineActive,
  suppressScopeSwitchToastRef,
  setQuoteMarketCode,
  setWorkflowStep,
  setShowDrawer,
  saveLogistics,
  showToast,
  t,
  isAuthorized,
  skuReadyForNext,
  logisticsCompleted,
  workflowSku,
  publishLogisticsPipelineActive,
  publishLogisticsStepSnapshot,
}: UseLogisticsPageActionsParams) {
  const [saving, setSaving] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  const completionGate = useMemo(
    () =>
      evaluateLogisticsCompletionGate(
        {
          hasSavedTemplate,
          pipelineActive: pipelineRunning,
          analysis,
          quoteResults,
          templateMarketsConfigured: Boolean(
            activeTemplate && codesFromSelections(activeTemplate.markets).length > 0
          ),
        },
        t
      ),
    [
      hasSavedTemplate,
      pipelineRunning,
      analysis,
      quoteResults,
      activeTemplate,
      t,
    ]
  );

  const skuBindingGap = useMemo(() => {
    if (workflowSku) {
      return {
        products: workflowSku.issueProductCount,
        skus: workflowSku.needsReview + workflowSku.unbound,
      };
    }
    let products = 0;
    let skus = 0;
    for (const product of analysis?.productProfiles ?? []) {
      const pending = (product.variantDecisions ?? []).filter(
        (v) => v.decisionStatus === "pending_sku"
      );
      if (pending.length > 0) {
        products += 1;
        skus += pending.length;
      }
    }
    return { products, skus };
  }, [workflowSku, analysis]);

  useEffect(() => {
    publishLogisticsPipelineActive(pipelineActive);
  }, [pipelineActive, publishLogisticsPipelineActive]);

  useEffect(() => {
    if (!isAuthorized) {
      publishLogisticsStepSnapshot(null);
      return;
    }
    publishLogisticsStepSnapshot(
      deriveLogisticsStepSnapshot(
        {
          skuReady: skuReadyForNext,
          pipelineActive,
          gate: completionGate,
          logisticsCompleted,
        },
        t
      )
    );
  }, [
    isAuthorized,
    skuReadyForNext,
    pipelineActive,
    completionGate,
    logisticsCompleted,
    publishLogisticsStepSnapshot,
    t,
  ]);

  const handleCorrect = async (itemId: string, type: LogisticsTypeCode) => {
    if (correctingId) return;
    setCorrectingId(itemId);
    try {
      const updated = await api.correctLogisticsType(shopName, itemId, type);
      setAnalysis((prev) => {
        if (!prev) return prev;
        const productProfiles = prev.productProfiles.map((p) =>
          p.thirdPlatformItemId === itemId ? updated : p
        );

        const totalVariants = productProfiles.reduce(
          (sum, p) => sum + p.totalVariants,
          0
        );
        const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
          pending_sku: 0,
          pending_postal_meta: 0,
          ready_for_quote: 0,
          confirmed: 0,
          restricted: 0,
          needs_review: 0,
        };
        for (const p of productProfiles) {
          for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
            decisionStatusCounts[status as LogisticsDecisionStatus] += count;
          }
        }

        const highRiskTypes = productProfiles
          .map((p) => p.dominantLogisticsType)
          .filter(
            (typeCode, i, arr) =>
              (typeCode === "BATTERY_MAGNETIC" ||
                typeCode === "FOOD" ||
                typeCode === "BLADE" ||
                typeCode === "LIQUID" ||
                typeCode === "POWDER") &&
              arr.indexOf(typeCode) === i
          );

        return {
          ...prev,
          productProfiles,
          totalVariants,
          decisionStatusCounts,
          highRiskTypes,
        };
      });
      showToast(t("logistics.toastTypeCorrected"));
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setCorrectingId(null);
    }
  };

  const handleSaveTemplate = async (upsertData: LogisticsTemplateUpsert) => {
    setSaving(true);
    try {
      const saved = await api.upsertLogisticsTemplate(shopName, upsertData);
      setTemplates([saved]);
      suppressScopeSwitchToastRef.current = true;
      setActiveTemplate(saved);
      showToast(t("logistics.toastTemplateSavedEstimate"));
      setWorkflowStep("estimate");
      setShowDrawer(false);
      return saved;
    } catch (err) {
      showToast(readableError(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = useCallback(
    async (goSync = false, syncExceptionCount?: number) => {
      if (!activeTemplate || saving) return;
      const codes = codesFromSelections(activeTemplate.markets);
      if (codes.length === 0) {
        showToast(t("logistics.toastPickMarket"));
        return;
      }
      setSaving(true);
      try {
        saveLogistics();
        if (goSync) {
          if (syncExceptionCount && syncExceptionCount > 0) {
            stashLogisticsSyncExceptionCount(syncExceptionCount);
          }
          router.push(localePath(locale, "/sync"));
        }
      } finally {
        setSaving(false);
      }
    },
    [
      activeTemplate,
      saving,
      saveLogistics,
      router,
      locale,
      localePath,
      showToast,
      t,
    ]
  );

  const handleSaveAndSync = useCallback(() => {
    if (!hasSavedTemplate) {
      showToast(t("completionGate.blockerNoTemplate"));
      return;
    }
    if (pipelineActive) {
      showToast(t("completionGate.blockerPipelineRunning"));
      return;
    }
    void handleSave(true, completionGate.exceptionCount);
  }, [
    hasSavedTemplate,
    pipelineActive,
    handleSave,
    completionGate.exceptionCount,
    showToast,
    t,
  ]);

  return {
    saving,
    correctingId,
    completionGate,
    skuBindingGap,
    handleCorrect,
    handleSaveTemplate,
    handleSave,
    handleSaveAndSync,
  };
}
