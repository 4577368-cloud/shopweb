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
  HIGH_MATCH_THRESHOLD,
  initialSteps,
  mockOverview,
  mockProductMatches,
  mockShop,
  mockSkuAlignments,
  SKU_READY_THRESHOLD,
} from "@/data/mock";
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
  productsReadyForNext: boolean;
  skuReadyForNext: boolean;
  syncCompleted: boolean;
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

  const updateProductStatus = useCallback((id: string, status: ProductMatchStatus) => {
    setProductMatches((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  }, []);

  const batchConfirmHighMatches = useCallback(() => {
    setProductMatches((prev) =>
      prev.map((item) =>
        item.matchScore >= HIGH_MATCH_THRESHOLD &&
        !isProductResolved(item.status)
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

  const productsReadyForNext = useMemo(() => {
    const high = productMatches.filter(
      (p) => p.matchScore >= HIGH_MATCH_THRESHOLD
    );
    if (high.length === 0) return false;
    const confirmedHigh = high.filter((p) => p.status === "confirmed");
    return confirmedHigh.length >= Math.ceil(high.length * 0.5);
  }, [productMatches]);

  const skuReadyForNext = useMemo(() => {
    const actionable = skuAlignments.filter((s) => s.judgment !== "blocked");
    if (actionable.length === 0) return false;
    const resolved = actionable.filter((s) => isSkuResolved(s));
    const openConflict = actionable.filter(
      (s) => s.judgment === "conflict" && s.handleStatus === "unhandled"
    );
    const openReview = actionable.filter(
      (s) => s.judgment === "needs_review" && s.handleStatus === "unhandled"
    );
    return (
      resolved.length / actionable.length >= SKU_READY_THRESHOLD &&
      openConflict.length === 0 &&
      openReview.length === 0
    );
  }, [skuAlignments]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (productsReadyForNext) {
      updateStepStatus("products", "completed");
      updateStepStatus("sku-align", "pending_confirm");
    }
  }, [isAuthorized, productsReadyForNext, updateStepStatus]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (skuReadyForNext) {
      updateStepStatus("sku-align", "completed");
      updateStepStatus("logistics", "in_progress");
    }
  }, [isAuthorized, skuReadyForNext, updateStepStatus]);

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
      productsReadyForNext,
      skuReadyForNext,
      syncCompleted,
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
      productsReadyForNext,
      skuReadyForNext,
      syncCompleted,
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
