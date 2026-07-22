"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLogisticsForm,
  initialSteps,
  mockOverview,
  mockProductMatches,
  mockShop,
  mockSkuAlignments,
} from "@/data/mock";
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
  resolveShopDomainToRestore,
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
  const [steps, setSteps] = useState(initialSteps);
  const [shop, setShop] = useState(mockShop);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("waiting_input");
  const [shopDomainInput, setShopDomainInput] = useState("");
  const [overview, setOverview] = useState(mockOverview);
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
  const authRestoreStartedRef = useRef(false);

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
      setOverview((prev) => ({ ...prev, authStatus: "authorized" }));
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
      setOverview((prev) => ({ ...prev, authStatus: "authorized" }));
      updateStepStatus("authorize", "completed");
      updateStepStatus("products", "pending_confirm");
    },
    [updateStepStatus]
  );

  // Cold load: restore authorized shop from localStorage / ?shop / backend list on every page.
  useEffect(() => {
    if (authRestoreStartedRef.current) return;
    if (typeof window === "undefined") return;
    authRestoreStartedRef.current = true;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setAuthSessionReady(true);
    }, 12000);

    void (async () => {
      try {
        const shopToRestore = await resolveShopDomainToRestore();
        if (cancelled) return;

        if (shopToRestore && !shopDomainInput.trim()) {
          setShopDomainInput(shopToRestore);
        }

        if (!shopToRestore) {
          return;
        }

        const restored = await fetchRestoredShopAuth(shopToRestore);
        if (cancelled || !restored) return;

        hydrateAuthorizedShop(restored);
      } catch {
        // Offline / CORS — fall through to unauthenticated UI.
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
    setToastMessage("已批量确认高匹配商品");
  }, []);

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
                title: `${item.sourceSku.title.replace(/（已换候选）$/, "")}（已换候选）`,
                sku: item.sourceSku.sku.endsWith("-ALT")
                  ? item.sourceSku.sku
                  : `${item.sourceSku.sku}-ALT`,
              },
              status: "needs_confirm" as const,
              handleStatus: "modified" as const,
              diffSummary: "已换候选，待再次确认",
              note: "已切换为备选货源 SKU，请再次确认",
            }
          : item
      )
    );
    setToastMessage("已更换为备选 SKU（演示）");
  }, []);

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
    setToastMessage("已批量接受「可直接接受」SKU");
  }, []);

  const updateLogisticsForm = useCallback((patch: Partial<LogisticsForm>) => {
    setLogisticsForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveLogistics = useCallback(() => {
    setLogisticsCompleted(true);
    setSyncPhase("ready");
    updateStepStatus("logistics", "completed");
    setToastMessage("物流配置已保存，可开始同步");
  }, [updateStepStatus]);

  const startSync = useCallback(
    (options?: { force?: boolean }) => {
      if (!logisticsCompleted && !options?.force) return;
      setSyncPhase("syncing");
      window.setTimeout(() => {
        setSyncPhase("completed");
        setToastMessage("同步完成");
      }, 1200);
    },
    [logisticsCompleted]
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

      setWorkflowBinding(computeWorkflowBindingProgress(products, bindings));
      setWorkflowSku(computeWorkflowSkuProgress(skuOverview));

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

      const templateMarketsConfigured =
        listTemplateCountryCodes(activeTemplate).length > 0;
      const gate = evaluateLogisticsCompletionGate({
        hasSavedTemplate: templateSaved,
        pipelineActive: false,
        analysis: mergedAnalysis,
        quoteResults,
        templateMarketsConfigured,
      });
      const gateSnapshot = deriveLogisticsStepSnapshot({
        skuReady: isSkuStepComplete(computeWorkflowSkuProgress(skuOverview)),
        pipelineActive: false,
        gate,
        logisticsCompleted:
          metrics.variantCount > 0 &&
          metrics.confirmedCount >= metrics.variantCount,
      });
      setLogisticsStepSnapshot(gateSnapshot);
    } catch {
      // Keep the last known snapshot on transient API errors.
    }
  }, [isAuthorized, shopApiName]);

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

  const syncCompleted = syncPhase === "completed";

  const productsComplete = isProductsStepComplete(workflowBinding);
  const logisticsReadyForSync =
    logisticsCompleted ||
    (workflowLogistics != null &&
      workflowLogistics.variantCount > 0 &&
      workflowLogistics.confirmedCount >= workflowLogistics.variantCount);

  const workflowStepSnapshots = useMemo(() => {
    const authorize = snapshotAuthorizeStep(isAuthorized, shopApiName || shop.domain);
    const products = snapshotProductsStep(isAuthorized, workflowBinding);
    const sku = snapshotSkuStep(isAuthorized, productsComplete, workflowSku);

    const logistics = snapshotLogisticsStep({
      authorized: isAuthorized,
      skuReady: skuReadyForNext || Boolean(workflowSku && workflowSku.productCount > 0),
      metrics: workflowLogistics,
      pipelineActive: logisticsPipelineActive,
      hasTemplate: hasLogisticsTemplate,
    });

    const sync = snapshotSyncStep({
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
