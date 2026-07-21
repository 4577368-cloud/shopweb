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
  startSync: () => void;
  clearToast: () => void;
  showToast: (message: string) => void;
  isAuthorized: boolean;
  /** False until the cold-load auth restore pass finishes (localStorage + /status). */
  authSessionReady: boolean;
  productsReadyForNext: boolean;
  skuReadyForNext: boolean;
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

  const startSync = useCallback(() => {
    if (!logisticsCompleted) return;
    setSyncPhase("syncing");
    window.setTimeout(() => {
      setSyncPhase("completed");
      setToastMessage("同步完成");
    }, 1200);
  }, [logisticsCompleted]);

  const clearToast = useCallback(() => setToastMessage(null), []);
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const isAuthorized = authStatus === "authorized";

  const refreshWorkflowProgress = useCallback(async () => {
    if (!isAuthorized || !shop.name?.trim()) return;
    try {
      const [products, bindings, skuOverview] = await Promise.all([
        api.getShopProducts(shop.name),
        api.listImageBindings(shop.name).catch(() => []),
        api.getSkuOverview(shop.name).catch(() => []),
      ]);
      setWorkflowBinding(computeWorkflowBindingProgress(products, bindings));
      setWorkflowSku(computeWorkflowSkuProgress(skuOverview));
    } catch {
      // Keep the last known snapshot on transient API errors.
    }
  }, [isAuthorized, shop.name]);

  useEffect(() => {
    if (!isAuthorized || !authSessionReady) return;
    void refreshWorkflowProgress();
    const timer = window.setInterval(() => {
      void refreshWorkflowProgress();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [isAuthorized, authSessionReady, shop.name, refreshWorkflowProgress]);

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
    updateStepStatus(
      "logistics",
      deriveLogisticsStepStatus(isAuthorized, skuComplete, logisticsCompleted)
    );
  }, [
    isAuthorized,
    workflowBinding,
    workflowSku,
    logisticsCompleted,
    updateStepStatus,
  ]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  const syncCompleted = syncPhase === "completed";

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
      clearToast,
      showToast,
      isAuthorized,
      authSessionReady,
      productsReadyForNext,
      skuReadyForNext,
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
      clearToast,
      showToast,
      isAuthorized,
      authSessionReady,
      productsReadyForNext,
      skuReadyForNext,
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
