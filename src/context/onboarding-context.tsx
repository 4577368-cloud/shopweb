"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLogisticsForm,
  initialSteps,
  mockProductMatches,
  mockSkuAlignments,
} from "@/data/mock";
import { buildDashboardActivities } from "@/lib/dashboard/activities";
import { EMPTY_OVERVIEW } from "@/lib/dashboard/overview";
import { useT } from "@/i18n/LocaleProvider";
import { useOnboardingShopAuth } from "@/hooks/use-onboarding-shop-auth";
import { useOnboardingWorkflowProgress } from "@/hooks/use-onboarding-workflow-progress";
import type {
  ActivityItem,
  AuthStatus,
  LogisticsForm,
  OnboardingStep,
  OverviewMetrics,
  ProductMatch,
  ProductMatchStatus,
  ShopInfo,
  SkuAlignment,
  SkuAlignStatus,
  SkuHandleStatus,
  StepId,
  SyncPhase,
} from "@/lib/types";
import type { LogisticsStepSnapshot } from "@/lib/logistics/completion-gate";
import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import type {
  WorkflowBindingProgress,
  WorkflowSkuProgress,
} from "@/lib/workflow-progress";
import type { WorkflowStepSnapshot } from "@/lib/workflow-step-snapshots";
import type { ShopStatusSummary } from "@/lib/dashboard/shop-status";

interface OnboardingState {
  steps: OnboardingStep[];
  shop: ShopInfo;
  authStatus: AuthStatus;
  shopDomainInput: string;
  overview: OverviewMetrics;
  productMatches: ProductMatch[];
  skuAlignments: SkuAlignment[];
  logisticsForm: LogisticsForm;
  selectedLogisticsPlanId: string;
  logisticsCompleted: boolean;
  syncPhase: SyncPhase;
  toastMessage: string | null;
  setShopDomainInput: (value: string) => void;
  connectShop: () => void;
  hydrateAuthorizedShop: (info: {
    name: string;
    domain: string;
    authorizedAt: string;
    productCount: number;
  }) => void;
  updateProductStatus: (id: string, status: ProductMatchStatus) => void;
  batchConfirmHighMatches: () => void;
  updateSkuStatus: (id: string, status: SkuAlignStatus) => void;
  swapSkuPlaceholder: (id: string) => void;
  batchConfirmReadySkus: () => void;
  updateLogisticsForm: (patch: Partial<LogisticsForm>) => void;
  setSelectedLogisticsPlanId: (id: string) => void;
  saveLogistics: () => void;
  startSync: (options?: { force?: boolean }) => void;
  completeSyncCeremony: () => void;
  clearToast: () => void;
  showToast: (message: string) => void;
  isAuthorized: boolean;
  authSessionReady: boolean;
  authBootstrapping: boolean;
  productsReadyForNext: boolean;
  skuReadyForNext: boolean;
  workflowSku: WorkflowSkuProgress | null;
  workflowBinding: WorkflowBindingProgress | null;
  workflowLogistics: LogisticsPlanMetrics | null;
  workflowProgressPercent: number;
  workflowStepSnapshots: Record<string, WorkflowStepSnapshot>;
  logisticsStepSnapshot: LogisticsStepSnapshot | null;
  publishLogisticsStepSnapshot: (snapshot: LogisticsStepSnapshot | null) => void;
  publishLogisticsPipelineActive: (active: boolean) => void;
  syncCompleted: boolean;
  shopStatusSummary: ShopStatusSummary | null;
  dashboardActivities: ActivityItem[];
  refreshWorkflowProgress: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingState | null>(null);

export function isProductResolved(status: ProductMatchStatus) {
  return (
    status === "confirmed" ||
    status === "deferred" ||
    status === "rejected" ||
    status === "flagged"
  );
}

export function isSkuResolved(row: SkuAlignment | SkuAlignStatus) {
  if (typeof row === "string") {
    return (
      row === "confirmed" || row === "skipped" || row === "flagged"
    );
  }
  return (
    row.handleStatus === "accepted" ||
    row.handleStatus === "skipped" ||
    row.handleStatus === "flagged"
  );
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [steps, setSteps] = useState(initialSteps);
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [productMatches, setProductMatches] = useState(mockProductMatches);
  const [skuAlignments, setSkuAlignments] = useState(mockSkuAlignments);
  const [logisticsForm, setLogisticsForm] = useState(defaultLogisticsForm);
  const [selectedLogisticsPlanId, setSelectedLogisticsPlanId] = useState("lp1");
  const [logisticsCompleted, setLogisticsCompleted] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("blocked");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const updateStepStatus = useCallback(
    (id: StepId, status: OnboardingStep["status"]) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
    },
    []
  );

  const {
    shop,
    setShop,
    authStatus,
    shopDomainInput,
    setShopDomainInput,
    connectShop,
    hydrateAuthorizedShop,
    isAuthorized,
    authSessionReady,
    authBootstrapping,
  } = useOnboardingShopAuth({ updateStepStatus, setOverview });

  const {
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
  } = useOnboardingWorkflowProgress({
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
  });

  const updateProductStatus = useCallback((id: string, status: ProductMatchStatus) => {
    setProductMatches((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }, []);

  const batchConfirmHighMatches = useCallback(() => {
    setProductMatches((prev) =>
      prev.map((item) =>
        item.matchScore >= 85 && !isProductResolved(item.status)
          ? { ...item, status: "confirmed" as const }
          : item
      )
    );
    setToastMessage(t("toast.batchConfirmHighMatch"));
  }, [t]);

  const updateSkuStatus = useCallback((id: string, status: SkuAlignStatus) => {
    const handleMap: Partial<Record<SkuAlignStatus, SkuHandleStatus>> = {
      confirmed: "accepted",
      skipped: "skipped",
      flagged: "flagged",
      needs_confirm: "modified",
    };
    setSkuAlignments((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const handleStatus = handleMap[status] ?? item.handleStatus;
        return {
          ...item,
          status,
          handleStatus,
        };
      })
    );
  }, []);

  const swapSkuPlaceholder = useCallback((id: string) => {
    setSkuAlignments((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              sourceSku: {
                ...item.sourceSku,
                title: `${item.sourceSku.title.replace(new RegExp(`${t("onboarding.candidateSwappedSuffix").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), "")}${t("onboarding.candidateSwappedSuffix")}`,
                sku: item.sourceSku.sku.endsWith("-ALT")
                  ? item.sourceSku.sku
                  : `${item.sourceSku.sku}-ALT`,
              },
              status: "needs_confirm" as const,
              handleStatus: "modified" as const,
              diffSummary: t("onboarding.diffSummarySwapped"),
              note: t("onboarding.noteSwapped"),
            }
          : item
      )
    );
    setToastMessage(t("toast.skuCandidateSwitched"));
  }, [t]);

  const batchConfirmReadySkus = useCallback(() => {
    setSkuAlignments((prev) =>
      prev.map((item) =>
        item.judgment === "acceptable" && item.handleStatus === "unhandled"
          ? {
              ...item,
              status: "confirmed" as const,
              handleStatus: "accepted" as const,
            }
          : item
      )
    );
    setToastMessage(t("toast.skuBatchAccepted"));
  }, [t]);

  const updateLogisticsForm = useCallback((patch: Partial<LogisticsForm>) => {
    setLogisticsForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveLogistics = useCallback(() => {
    setLogisticsCompleted(true);
    setSyncPhase("ready");
    updateStepStatus("logistics", "completed");
    setToastMessage(t("toast.logisticsStaged"));
  }, [updateStepStatus, t]);

  const startSync = useCallback(
    (options?: { force?: boolean }) => {
      if (!logisticsCompleted && !options?.force) return;
      setSyncPhase("syncing");
      window.setTimeout(() => {
        setSyncPhase("completed");
        setToastMessage(t("toast.syncComplete"));
      }, 1200);
    },
    [logisticsCompleted, t]
  );

  const completeSyncCeremony = useCallback(() => {
    setSyncPhase("completed");
  }, []);

  const clearToast = useCallback(() => setToastMessage(null), []);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const dashboardActivities = useMemo(
    () =>
      buildDashboardActivities(
        {
          isAuthorized,
          shop,
          binding: workflowBinding,
          sku: workflowSku,
          logistics: workflowLogistics,
          logisticsCompleted,
          syncCompleted,
          refreshedAt: dashboardRefreshedAt,
        },
        t
      ),
    [
      t,
      isAuthorized,
      shop,
      workflowBinding,
      workflowSku,
      workflowLogistics,
      logisticsCompleted,
      syncCompleted,
      dashboardRefreshedAt,
    ]
  );

  const value = useMemo(
    () => ({
      steps,
      shop,
      authStatus,
      shopDomainInput,
      overview,
      productMatches,
      skuAlignments,
      logisticsForm,
      selectedLogisticsPlanId,
      logisticsCompleted,
      syncPhase,
      toastMessage,
      setShopDomainInput,
      connectShop,
      hydrateAuthorizedShop,
      updateProductStatus,
      batchConfirmHighMatches,
      updateSkuStatus,
      swapSkuPlaceholder,
      batchConfirmReadySkus,
      updateLogisticsForm,
      setSelectedLogisticsPlanId,
      saveLogistics,
      startSync,
      completeSyncCeremony,
      clearToast,
      showToast,
      isAuthorized,
      authSessionReady,
      authBootstrapping,
      productsReadyForNext,
      skuReadyForNext,
      workflowSku,
      workflowBinding,
      workflowLogistics,
      workflowProgressPercent,
      workflowStepSnapshots,
      logisticsStepSnapshot,
      publishLogisticsStepSnapshot,
      publishLogisticsPipelineActive,
      syncCompleted,
      shopStatusSummary,
      dashboardActivities,
      refreshWorkflowProgress,
    }),
    [
      steps,
      shop,
      authStatus,
      shopDomainInput,
      overview,
      productMatches,
      skuAlignments,
      logisticsForm,
      selectedLogisticsPlanId,
      logisticsCompleted,
      syncPhase,
      toastMessage,
      setShopDomainInput,
      connectShop,
      hydrateAuthorizedShop,
      updateProductStatus,
      batchConfirmHighMatches,
      updateSkuStatus,
      swapSkuPlaceholder,
      batchConfirmReadySkus,
      updateLogisticsForm,
      saveLogistics,
      startSync,
      completeSyncCeremony,
      clearToast,
      showToast,
      isAuthorized,
      authSessionReady,
      authBootstrapping,
      productsReadyForNext,
      skuReadyForNext,
      workflowSku,
      workflowBinding,
      workflowLogistics,
      workflowProgressPercent,
      workflowStepSnapshots,
      logisticsStepSnapshot,
      publishLogisticsStepSnapshot,
      publishLogisticsPipelineActive,
      syncCompleted,
      shopStatusSummary,
      dashboardActivities,
      refreshWorkflowProgress,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return ctx;
}
