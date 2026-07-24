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
  mockShop,
  mockSkuAlignments,
} from "@/data/mock";
import { buildDashboardActivities } from "@/lib/dashboard/activities";
import {
  buildOverviewMetrics,
  EMPTY_OVERVIEW,
} from "@/lib/dashboard/overview";
import {
  computeShopProductStatusSummary,
  type ShopStatusSummary,
} from "@/lib/dashboard/shop-status";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import {
  evaluateLogisticsCompletionGate,
  deriveLogisticsStepSnapshot,
} from "@/lib/logistics/completion-gate";
import { hasSavedLogisticsTemplate } from "@/lib/logistics/incremental-pipeline";
import { computeLogisticsPlanMetrics } from "@/lib/logistics/display";
import {
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
} from "@/lib/logistics/quote-cache";
import { buildLogisticsTemplateScopeKey } from "@/lib/logistics/template-scope-key";
import { listTemplateCountryCodes } from "@/lib/logistics/template-params";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import type { LogisticsStepSnapshot } from "@/lib/logistics/completion-gate";
import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
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
import {
  fetchRestoredShopAuth,
  readStoredShopDomain,
  resolveShopDomainToRestore,
  shopDisplayNameFromDomain,
} from "@/lib/restore-shop-auth";

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
  /** Mark sync step completed after launch ceremony finishes. */
  completeSyncCeremony: () => void;
  clearToast: () => void;
  showToast: (message: string) => void;
  isAuthorized: boolean;
  /** False until the cold-load auth restore pass finishes (localStorage + /status). */
  authSessionReady: boolean;
  /** True while restore is in flight — show loading, not「未连接」empty state. */
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
  const [shop, setShop] = useState(() => {
    const domain = readStoredShopDomain();
    if (!domain) return mockShop;
    return {
      ...mockShop,
      domain,
      name: shopDisplayNameFromDomain(domain),
    };
  });
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() =>
    readStoredShopDomain() ? "authorizing" : "waiting_input"
  );
  const [shopDomainInput, setShopDomainInput] = useState(
    () => readStoredShopDomain() ?? ""
  );
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [productMatches, setProductMatches] = useState(mockProductMatches);
  const [skuAlignments, setSkuAlignments] = useState(mockSkuAlignments);
  const [logisticsForm, setLogisticsForm] = useState(defaultLogisticsForm);
  const [selectedLogisticsPlanId, setSelectedLogisticsPlanId] = useState("lp1");
  const [logisticsCompleted, setLogisticsCompleted] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("blocked");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [authSessionReady, setAuthSessionReady] = useState(false);
  const [workflowBinding, setWorkflowBinding] =
    useState<WorkflowBindingProgress | null>(null);
  const [workflowSku, setWorkflowSku] = useState<WorkflowSkuProgress | null>(
    null
  );
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
  const updateStepStatus = useCallback(
    (id: StepId, status: OnboardingStep["status"]) => {
      setSteps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status } : s))
      );
    },
    []
  );

  const handleSetDomain = useCallback(
    (v: string) => {
      setShopDomainInput(v);
      setAuthStatus((prev) => {
        if (prev === "authorized" || prev === "authorizing") return prev;
        return v.trim() ? "ready_to_authorize" : "waiting_input";
      });
    },
    []
  );

  const connectShop = useCallback(() => {
    if (!shopDomainInput.trim()) {
      setAuthStatus("waiting_input");
      return;
    }
    setAuthStatus("authorizing");
    window.setTimeout(() => {
      const domain = shopDomainInput.trim().replace(/^https?:\/\//, "");
      setAuthStatus("authorized");
      setShop((prev) => ({
        ...prev,
        domain,
        name:
          domain
            .split(".")[0]
            ?.split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ") || prev.name,
        authorizedAt: new Date()
          .toLocaleString("zh-CN", { hour12: false })
          .replace(/\//g, "-"),
      }));
      setOverview(buildOverviewMetrics("authorized", null, null));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
    }, 900);
  }, [shopDomainInput, updateStepStatus]);

  // Restore authorized state from the real backend after the OAuth redirect (Step M0-4).
  // Only fills auth-related fields; other onboarding data stays as-is.
  const hydrateAuthorizedShop = useCallback(
    (info: {
      name: string;
      domain: string;
      authorizedAt: string;
      productCount: number;
    }) => {
      setAuthStatus("authorized");
      setShop((prev) => ({
        ...prev,
        name: info.name,
        domain: info.domain,
        authorizedAt: info.authorizedAt,
        productCount: info.productCount,
      }));
      setOverview(buildOverviewMetrics("authorized", null, null));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
    },
    [updateStepStatus]
  );

  // Cold load: restore authorized shop from localStorage / ?shop / backend list on every page.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setAuthSessionReady(true);
    }, 12000);

    void (async () => {
      try {
        const shopToRestore = await resolveShopDomainToRestore();
        if (cancelled) return;

        if (shopToRestore) {
          setShopDomainInput(shopToRestore);
          setShop((prev) => ({
            ...prev,
            domain: shopToRestore,
            name: shopDisplayNameFromDomain(shopToRestore),
          }));
          setAuthStatus((prev) =>
            prev === "authorized" ? prev : "authorizing"
          );
        }

        if (!shopToRestore) {
          return;
        }

        const restored = await fetchRestoredShopAuth(shopToRestore);
        if (cancelled) return;

        if (restored) {
          hydrateAuthorizedShop(restored);
          return;
        }

        setAuthStatus("ready_to_authorize");
      } catch {
        if (!cancelled) {
          setAuthStatus((prev) =>
            prev === "authorized" ? prev : "ready_to_authorize"
          );
        }
      } finally {
        if (!cancelled) {
          window.clearTimeout(timer);
          setAuthSessionReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only restore
  }, []);

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

  const publishLogisticsStepSnapshot = useCallback(
    (snapshot: LogisticsStepSnapshot | null) => {
      setLogisticsStepSnapshot(snapshot);
    },
    []
  );

  const publishLogisticsPipelineActive = useCallback((active: boolean) => {
    setLogisticsPipelineActive(active);
  }, []);

  const isAuthorized = authStatus === "authorized";
  const authBootstrapping = !authSessionReady || authStatus === "authorizing";

  const shopApiName = resolveShopApiName(shop);

  const refreshWorkflowProgress = useCallback(async () => {
    if (!isAuthorized || !shopApiName) return;
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
  }, [authStatus, isAuthorized, shopApiName, t]);

  useEffect(() => {
    if (!isAuthorized || !authSessionReady) return;
    void refreshWorkflowProgress();
    const timer = window.setInterval(() => {
      void refreshWorkflowProgress();
    }, 45_000);
    return () => window.clearInterval(timer);
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
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  // 根据后端 workflowLogistics 数据恢复物流完成状态
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
  }, [workflowLogistics, logisticsCompleted, syncPhase]);

  const syncCompleted = syncPhase === "completed";

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
      setShopDomainInput: handleSetDomain,
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
      handleSetDomain,
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
