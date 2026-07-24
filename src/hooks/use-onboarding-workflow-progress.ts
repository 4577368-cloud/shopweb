"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import { buildOverviewMetrics } from "@/lib/dashboard/overview";
import {
  computeShopProductStatusSummary,
  type ShopStatusSummary,
} from "@/lib/dashboard/shop-status";
import {
  deriveLogisticsStepSnapshot,
  evaluateLogisticsCompletionGate,
  type LogisticsStepSnapshot,
} from "@/lib/logistics/completion-gate";
import { computeLogisticsPlanMetrics, type LogisticsPlanMetrics } from "@/lib/logistics/display";
import { hasSavedLogisticsTemplate } from "@/lib/logistics/incremental-pipeline";
import {
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
} from "@/lib/logistics/quote-cache";
import { buildLogisticsTemplateScopeKey } from "@/lib/logistics/template-scope-key";
import { listTemplateCountryCodes } from "@/lib/logistics/template-params";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import type { AuthStatus, OnboardingStep, OverviewMetrics, ShopInfo, StepId, SyncPhase } from "@/lib/types";
import {
  computeWorkflowBindingProgress,
  computeWorkflowSkuProgress,
  deriveLogisticsStepStatus,
  deriveProductsStepStatus,
  deriveSkuStepStatus,
  isProductsStepComplete,
  isSkuStepComplete,
  type WorkflowBindingProgress,
  type WorkflowSkuProgress,
} from "@/lib/workflow-progress";
import {
  computeWorkflowPercent,
  snapshotAuthorizeStep,
  snapshotLogisticsStep,
  snapshotProductsStep,
  snapshotSkuStep,
  snapshotSyncStep,
  type WorkflowStepSnapshot,
} from "@/lib/workflow-step-snapshots";

export interface UseOnboardingWorkflowProgressParams {
  shop: ShopInfo;
  setShop: Dispatch<SetStateAction<ShopInfo>>;
  authStatus: AuthStatus;
  isAuthorized: boolean;
  authSessionReady: boolean;
  setOverview: Dispatch<SetStateAction<OverviewMetrics>>;
  logisticsCompleted: boolean;
  setLogisticsCompleted: Dispatch<SetStateAction<boolean>>;
  syncPhase: SyncPhase;
  setSyncPhase: Dispatch<SetStateAction<SyncPhase>>;
  updateStepStatus: (id: StepId, status: OnboardingStep["status"]) => void;
}

export function useOnboardingWorkflowProgress({
  shop,
  setShop,
  authStatus,
  isAuthorized,
  authSessionReady,
  setOverview,
  logisticsCompleted,
  setLogisticsCompleted,
  syncPhase,
  setSyncPhase,
  updateStepStatus,
}: UseOnboardingWorkflowProgressParams) {
  const t = useT();
  const [workflowBinding, setWorkflowBinding] =
    useState<WorkflowBindingProgress | null>(null);
  const [workflowSku, setWorkflowSku] = useState<WorkflowSkuProgress | null>(null);
  const [logisticsStepSnapshot, setLogisticsStepSnapshot] =
    useState<LogisticsStepSnapshot | null>(null);
  const [logisticsPipelineActive, setLogisticsPipelineActive] = useState(false);
  const [workflowLogistics, setWorkflowLogistics] =
    useState<LogisticsPlanMetrics | null>(null);
  const [hasLogisticsTemplate, setHasLogisticsTemplate] = useState(false);
  const [shopStatusSummary, setShopStatusSummary] =
    useState<ShopStatusSummary | null>(null);
  const [dashboardRefreshedAt, setDashboardRefreshedAt] = useState<string | null>(
    null
  );

  const shopApiName = resolveShopApiName(shop);
  const workflowRefreshAtRef = useRef(0);

  const publishLogisticsStepSnapshot = useCallback(
    (snapshot: LogisticsStepSnapshot | null) => {
      setLogisticsStepSnapshot(snapshot);
    },
    []
  );

  const publishLogisticsPipelineActive = useCallback((active: boolean) => {
    setLogisticsPipelineActive(active);
  }, []);

  const refreshWorkflowProgress = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!isAuthorized || !shopApiName) return;
      const now = Date.now();
      if (!opts?.force && now - workflowRefreshAtRef.current < 20_000) {
        return;
      }
      workflowRefreshAtRef.current = now;
      try {
        const [
          products,
          bindings,
          skuOverview,
          logisticsAnalysis,
          logisticsTemplates,
        ] = await Promise.all([
          api.getShopProducts(shopApiName),
          api.listImageBindings(shopApiName).catch(() => []),
          api.getSkuOverview(shopApiName).catch(() => []),
          api.getLogisticsAnalysis(shopApiName).catch(() => null),
          api.listLogisticsTemplates(shopApiName).catch(() => []),
        ]);

        const bindingProgress = computeWorkflowBindingProgress(products, bindings);
        const skuProgress = computeWorkflowSkuProgress(skuOverview);

        setWorkflowBinding(bindingProgress);
        setWorkflowSku(skuProgress);
        setShopStatusSummary(computeShopProductStatusSummary(products));
        setShop((prev) => ({
          ...prev,
          productCount: products.length,
        }));
        setOverview(buildOverviewMetrics(authStatus, bindingProgress, skuProgress));

        const activeTemplate = logisticsTemplates[0] ?? null;
        const templateSaved = hasSavedLogisticsTemplate(logisticsTemplates);
        setHasLogisticsTemplate(templateSaved);

        const scopeKey = buildLogisticsTemplateScopeKey(activeTemplate);
        const quoteResults =
          scopeKey && typeof window !== "undefined"
            ? readQuoteCache(shopApiName, scopeKey)
            : new Map();
        const mergedAnalysis =
          logisticsAnalysis && quoteResults.size > 0
            ? mergeQuoteResultsIntoAnalysis(logisticsAnalysis, quoteResults)
            : logisticsAnalysis;

        const metrics = computeLogisticsPlanMetrics(mergedAnalysis, quoteResults);
        setWorkflowLogistics(metrics);
        setDashboardRefreshedAt(new Date().toISOString());

        const templateMarketsConfigured =
          listTemplateCountryCodes(activeTemplate).length > 0;
        const gate = evaluateLogisticsCompletionGate(
          {
            hasSavedTemplate: templateSaved,
            pipelineActive: false,
            analysis: mergedAnalysis,
            quoteResults,
            templateMarketsConfigured,
          },
          t
        );
        const gateSnapshot = deriveLogisticsStepSnapshot(
          {
            skuReady: isSkuStepComplete(computeWorkflowSkuProgress(skuOverview)),
            pipelineActive: false,
            gate,
            logisticsCompleted:
              metrics.variantCount > 0 &&
              metrics.confirmedCount >= metrics.variantCount,
          },
          t
        );
        setLogisticsStepSnapshot(gateSnapshot);
      } catch {
        // Keep the last known snapshot on transient API errors.
      }
    },
    [authStatus, isAuthorized, setOverview, setShop, shopApiName, t]
  );

  useEffect(() => {
    if (!isAuthorized || !authSessionReady) return;
    const boot = window.setTimeout(() => {
      void refreshWorkflowProgress({ force: true });
    }, 2_000);
    const timer = window.setInterval(() => {
      void refreshWorkflowProgress();
    }, 180_000);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [isAuthorized, authSessionReady, shopApiName, refreshWorkflowProgress]);

  const productsReadyForNext = isProductsStepComplete(workflowBinding);
  const skuReadyForNext = isSkuStepComplete(workflowSku);

  useEffect(() => {
    if (!isAuthorized) return;

    updateStepStatus("authorize", "completed");

    const productsStatus = deriveProductsStepStatus(isAuthorized, workflowBinding);
    updateStepStatus("products", productsStatus);

    const productsComplete = productsStatus === "completed";
    const skuStatus = deriveSkuStepStatus(
      isAuthorized,
      productsComplete,
      workflowSku
    );
    updateStepStatus("sku-align", skuStatus);

    const skuComplete = skuStatus === "completed";
    const logisticsDone =
      workflowLogistics != null &&
      workflowLogistics.variantCount > 0 &&
      workflowLogistics.confirmedCount >= workflowLogistics.variantCount;
    updateStepStatus(
      "logistics",
      deriveLogisticsStepStatus(
        isAuthorized,
        skuComplete,
        logisticsCompleted || logisticsDone,
        workflowSku
      )
    );
  }, [
    isAuthorized,
    workflowBinding,
    workflowSku,
    workflowLogistics,
    logisticsCompleted,
    updateStepStatus,
  ]);

  useEffect(() => {
    if (!workflowLogistics) return;
    const logisticsDone =
      workflowLogistics.variantCount > 0 &&
      workflowLogistics.confirmedCount >= workflowLogistics.variantCount;
    if (logisticsDone && !logisticsCompleted) {
      setLogisticsCompleted(true);
    }
    if (logisticsDone && syncPhase === "blocked") {
      setSyncPhase("ready");
    }
  }, [
    workflowLogistics,
    logisticsCompleted,
    syncPhase,
    setLogisticsCompleted,
    setSyncPhase,
  ]);

  const syncCompleted = syncPhase === "completed";
  const productsComplete = isProductsStepComplete(workflowBinding);
  const logisticsReadyForSync =
    logisticsCompleted ||
    (workflowLogistics != null &&
      workflowLogistics.variantCount > 0 &&
      workflowLogistics.confirmedCount >= workflowLogistics.variantCount);

  const workflowStepSnapshots = useMemo(() => {
    const authorize = snapshotAuthorizeStep(t, isAuthorized, shopApiName || shop.domain);
    const products = snapshotProductsStep(t, isAuthorized, workflowBinding);
    const sku = snapshotSkuStep(t, isAuthorized, productsComplete, workflowSku);

    const logistics = snapshotLogisticsStep(t, {
      authorized: isAuthorized,
      skuReady: skuReadyForNext || Boolean(workflowSku && workflowSku.productCount > 0),
      metrics: workflowLogistics,
      pipelineActive: logisticsPipelineActive,
      hasTemplate: hasLogisticsTemplate,
    });

    const sync = snapshotSyncStep(t, {
      syncCompleted,
      syncPhase,
      logisticsReady: logisticsReadyForSync,
    });

    return {
      authorize,
      products,
      "sku-align": sku,
      logistics,
      sync,
    } satisfies Record<string, WorkflowStepSnapshot>;
  }, [
    t,
    isAuthorized,
    shopApiName,
    shop.domain,
    workflowBinding,
    productsComplete,
    workflowSku,
    skuReadyForNext,
    workflowLogistics,
    logisticsPipelineActive,
    hasLogisticsTemplate,
    logisticsStepSnapshot,
    syncCompleted,
    syncPhase,
    logisticsReadyForSync,
  ]);

  const workflowProgressPercent = useMemo(
    () =>
      computeWorkflowPercent({
        authorized: isAuthorized,
        syncCompleted,
        binding: workflowBinding,
        sku: workflowSku,
        logistics: workflowLogistics,
      }),
    [isAuthorized, syncCompleted, workflowBinding, workflowSku, workflowLogistics]
  );

  return {
    workflowBinding,
    workflowSku,
    workflowLogistics,
    logisticsStepSnapshot,
    publishLogisticsStepSnapshot,
    publishLogisticsPipelineActive,
    shopStatusSummary,
    dashboardRefreshedAt,
    productsReadyForNext,
    skuReadyForNext,
    workflowStepSnapshots,
    workflowProgressPercent,
    refreshWorkflowProgress,
    syncCompleted,
  };
}
