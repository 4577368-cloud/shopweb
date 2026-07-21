"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { AiCopilotScanStage } from "@/components/workbench/ai-copilot-scan-stage";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useProductsScan } from "@/hooks/use-products-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import { consumeScanHandoff, markScanHandoff } from "@/lib/scan/handoff";
import { scanBriefingLine } from "@/lib/scan/copilot-workflow";
import {
  aiFieldEditKey,
  applyListingEditsToProducts,
  formatListingMoney,
  type AiFieldEditRecord,
  type AiFieldId,
} from "@/lib/ai-field-edit-feedback";
import {
  computeShopProductBindingStats,
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import {
  computeNewArrivalStats,
  readProductBaseline,
  seedProductBaselineIfEmpty,
  writeProductBaseline,
  type NewArrivalStats,
} from "@/lib/shop-product-mirror-baseline";
import {
  formatNewArrivalAnalysisSummary,
  type NewArrivalAnalysisResult,
} from "@/lib/new-arrival-analysis-result";
import { mergeProductBaseline } from "@/lib/shop-product-mirror-baseline";
import { formatBatchLinkSummary } from "@/lib/batch-link/types";
import type { BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import { buildNewArrivalResultFromBatch } from "@/lib/batch-link/build-new-arrival-result";
import {
  batchLinkScopeIds,
  buildBatchLinkScope,
} from "@/lib/batch-link/scope";
import { SmartSourcingSummaryBar } from "@/components/select/smart-sourcing-summary-bar";
import { PricingStrategyRailCard } from "@/components/select/pricing-strategy-rail-card";
import { PricingTemplateDrawer } from "@/components/select/pricing-template-drawer";
import { ProductsAgentPanel } from "@/components/select/products-agent-panel";
import { PageAgentPanel } from "@/components/workbench/page-agent-panel";
import { productsAgentConfig } from "@/lib/agents/page-agent/products-config";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import { mergeListingPriceRow, writeShopListingPrice } from "@/lib/shop-product-write";
import {
  ShopProductsPanel,
  type ShopFilter,
  type AgentIntentRequest,
} from "@/components/select/shop-products-panel";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";
import { buildProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildProductFocusSnapshot,
  type CandidateSummary,
} from "@/lib/agents/products/product-focus-snapshot";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { AgentResponse } from "@/lib/agents/types";
import { deriveRecommendedCategories } from "@/lib/recommended-categories";
import type {
  AiPanelContent,
  ImageBindingView,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import type { ScanHandoffPayload } from "@/lib/scan/handoff";

type Tab = "shop" | "catalog";

const BREADCRUMBS = [{ label: "工作台", href: "/" }, { label: "智能选品" }];

interface ProductsSummary {
  shopProducts: number;
  confirmedProducts: number;
  pendingProducts: number;
}

function SelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, isAuthorized, authSessionReady, showToast, refreshWorkflowProgress } =
    useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("products");

  const urlTab: Tab = searchParams.get("tab") === "catalog" ? "catalog" : "shop";
  const [tab, setTabLocal] = useState<Tab>(urlTab);
  useEffect(() => {
    setTabLocal(urlTab);
  }, [urlTab]);

  const setTab = useCallback(
    (t: Tab) => {
      setTabLocal(t);
      const current = searchParams.get("tab");
      const already =
        current === t || (t === "shop" && (current == null || current === ""));
      if (already) return;
      startTransition(() => {
        router.replace(`/products?tab=${t}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const emptyNewArrivals = useMemo<NewArrivalStats>(
    () => ({
      newArrivalCount: 0,
      pendingNewAnalysisCount: 0,
      newArrivalIds: new Set(),
      pendingNewAnalysisIds: new Set(),
    }),
    []
  );
  const [newArrivalStats, setNewArrivalStats] =
    useState<NewArrivalStats>(emptyNewArrivals);
  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  const [template, setTemplate] = useState<PricingTemplate | null>(null);
  const [shopProducts, setShopProducts] = useState<ShopMirrorProduct[]>([]);
  const [phase, setPhase] = useState<"scan" | "result">("result");
  const [filtersMountEl, setFiltersMountEl] = useState<HTMLDivElement | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [clearingTemplate, setClearingTemplate] = useState(false);
  const [filterSummary, setFilterSummary] = useState<string[]>([]);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [scrollToProductId, setScrollToProductId] = useState<string | null>(null);
  const [focusCandidateId, setFocusCandidateId] = useState<string | null>(null);
  const [focusCandidates, setFocusCandidates] = useState<CandidateSummary[]>([]);
  const [bindingsMap, setBindingsMap] = useState<Record<string, ImageBindingView>>(
    {}
  );
  const [scanHandoff, setScanHandoff] = useState<ScanHandoffPayload | null>(null);
  const [agentIntentRequest, setAgentIntentRequest] =
    useState<AgentIntentRequest | null>(null);
  const [searchModeProductId, setSearchModeProductId] = useState<string | null>(
    null
  );
  const [rematchUnboundSignal, setRematchUnboundSignal] = useState(0);
  const [mirrorRefreshSignal, setMirrorRefreshSignal] = useState(0);
  const [aiFieldEdits, setAiFieldEdits] = useState<
    Record<string, AiFieldEditRecord>
  >({});
  const aiFieldEditsRef = useRef(aiFieldEdits);
  useEffect(() => {
    aiFieldEditsRef.current = aiFieldEdits;
  }, [aiFieldEdits]);
  const bumpMirrorRefresh = useCallback(() => {
    setMirrorRefreshSignal((n) => n + 1);
  }, []);
  const [pendingMinis, setPendingMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);
  const [unboundMinis, setUnboundMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);
  const [filterPresetRequest, setFilterPresetRequest] = useState<{
    categoryName?: string;
    keywords?: string;
  } | null>(null);

  const {
    tasks: scanTasks,
    stats: scanStats,
    progressPercent: scanProgressPercent,
    done: scanDone,
    start: startScan,
    resumeActiveJob,
    cancel: cancelScan,
  } = useProductsScan(shopName);

  const recommendedCategories = useMemo(
    () => deriveRecommendedCategories(shopProducts, 3),
    [shopProducts]
  );

  const refreshNewArrivalAwareness = useCallback(
    (
      products: ShopMirrorProduct[],
      bindings: Record<string, ImageBindingView>
    ) => {
      if (!hasScanned("products", shopName)) {
        setNewArrivalStats(emptyNewArrivals);
        return;
      }
      if (seedProductBaselineIfEmpty(shopName, products)) {
        setNewArrivalStats(emptyNewArrivals);
        return;
      }
      const baseline = readProductBaseline(shopName);
      setNewArrivalStats(computeNewArrivalStats(products, bindings, baseline));
    },
    [shopName, emptyNewArrivals]
  );

  const commitAnalysisBaseline = useCallback(
    (products: ShopMirrorProduct[]) => {
      writeProductBaseline(
        shopName,
        products.map((p) => p.thirdPlatformItemId)
      );
      setNewArrivalStats(emptyNewArrivals);
    },
    [shopName, emptyNewArrivals]
  );

  const loadSummary = useCallback(async () => {
    const [products, bindings, tpl] = await Promise.all([
      api.getShopProducts(shopName).catch(() => [] as ShopMirrorProduct[]),
      api.listImageBindings(shopName).catch(() => []),
      api.getPricingTemplate(shopName).catch(() => null),
    ]);
    const map = indexImageBindings(bindings);
    const stats = computeShopProductBindingStats(products, map);
    const merged = applyListingEditsToProducts(
      products,
      aiFieldEditsRef.current
    );
    setBindingsMap(map);
    setShopProducts(merged);
    setTemplate(tpl);
    setSummary({
      shopProducts: stats.analyzed,
      confirmedProducts: stats.confirmed,
      pendingProducts: stats.pending,
    });
    refreshNewArrivalAwareness(merged, map);
    void refreshWorkflowProgress();
    return { products: merged, bindings: map };
  }, [shopName, refreshNewArrivalAwareness, refreshWorkflowProgress]);

  const finishedRef = useRef(false);
  const finishToResult = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelScan();
    markScanned("products", shopName);
    markScanHandoff(shopName, scanStats);
    const { products } = await loadSummary();
    if (products) commitAnalysisBaseline(products);
    setPhase("result");
  }, [cancelScan, shopName, loadSummary, scanStats, commitAnalysisBaseline]);

  const startedForShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;
    finishedRef.current = false;
    void (async () => {
      const resumed = await resumeActiveJob();
      if (resumed) {
        setPhase("scan");
        return;
      }
      if (hasScanned("products", shopName)) {
        setPhase("result");
        void loadSummary();
        return;
      }
      setPhase("scan");
      await startScan();
    })();
  }, [isAuthorized, shopName, loadSummary, startScan, resumeActiveJob, finishToResult]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    setScanHandoff(consumeScanHandoff(shopName));
  }, [phase, isAuthorized, shopName]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSummary();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, isAuthorized, loadSummary]);

  useEffect(() => {
    setFocusCandidateId(null);
    setFocusCandidates([]);
  }, [focusProductId]);

  const [newArrivalAnalysisResult, setNewArrivalAnalysisResult] =
    useState<NewArrivalAnalysisResult | null>(null);
  const [batchLinkProgress, setBatchLinkProgress] = useState<BatchLinkProgress | null>(
    null
  );
  const [batchLinkRequest, setBatchLinkRequest] = useState<BatchLinkRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const batchLinkRequestSeq = useRef(0);
  const autoLinkVisitRef = useRef(false);

  const fireBatchLink = useCallback((source: BatchLinkRequest["source"], productIds?: string[]) => {
    batchLinkRequestSeq.current += 1;
    setBatchLinkRequest({
      signal: batchLinkRequestSeq.current,
      source,
      productIds,
    });
  }, []);

  const batchLinkActive = batchLinkProgress?.active ?? false;

  const linkableScope = useMemo(
    () =>
      buildBatchLinkScope(
        shopProducts,
        bindingsMap,
        newArrivalStats.pendingNewAnalysisIds
      ),
    [shopProducts, bindingsMap, newArrivalStats.pendingNewAnalysisIds]
  );
  const linkableCount = linkableScope.length;

  const enqueueBatchLink = useCallback(
    (source: BatchLinkRequest["source"]) => {
      if (batchLinkActive) return;
      const ids = batchLinkScopeIds(linkableScope);
      if (ids.length === 0) {
        showToast("暂无可关联商品（需有主图）");
        return;
      }
      setTab("shop");
      setShopFilter("all");
      setNewArrivalAnalysisResult(null);
      fireBatchLink(source, ids);
    },
    [batchLinkActive, fireBatchLink, linkableScope, setTab, showToast]
  );

  const batchLinkActiveRef = useRef(false);
  useEffect(() => {
    batchLinkActiveRef.current = batchLinkActive;
  }, [batchLinkActive]);

  // Enter page → auto-run one batch for all linkable unbound products (once per visit).
  useEffect(() => {
    autoLinkVisitRef.current = false;
  }, [shopName]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized || tab !== "shop" || batchLinkActive) return;
    if (autoLinkVisitRef.current) return;
    if (summary == null || linkableCount === 0) return;

    autoLinkVisitRef.current = true;
    setShopFilter("all");
    fireBatchLink("auto", batchLinkScopeIds(linkableScope));
  }, [
    batchLinkActive,
    fireBatchLink,
    isAuthorized,
    linkableCount,
    linkableScope,
    phase,
    summary,
    tab,
  ]);

  const viewNewArrivalResult = useCallback(
    (target: "pending" | "unbound") => {
      if (!newArrivalAnalysisResult) return;
      const itemIds =
        target === "pending"
          ? newArrivalAnalysisResult.pendingItemIds
          : newArrivalAnalysisResult.unmatchedItemIds;
      setTab("shop");
      setShopFilter(target === "pending" ? "pending" : "unbound");
      if (itemIds[0]) {
        setFocusProductId(itemIds[0]);
        setScrollToProductId(itemIds[0]);
      }
    },
    [newArrivalAnalysisResult, setTab]
  );

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    clearScanned("products", shopName);
    setPhase("scan");
    void startScan();
  }, [shopName, startScan]);

  const pendingCount = summary?.pendingProducts ?? 0;
  const analyzed = summary?.shopProducts ?? 0;
  const matched = summary != null ? summary.confirmedProducts + summary.pendingProducts : 0;
  const unbound = summary != null ? Math.max(analyzed - matched, 0) : 0;

  const analysisReady = phase === "result" && summary != null;
  const previewPricingGuide = searchParams.get("previewPricingGuide") === "1";

  const shopCurrencyHint = shopProducts[0]?.currency ?? null;

  const focusProductSnapshot = useMemo(() => {
    if (!focusProductId) return null;
    const product = shopProducts.find(
      (p) => p.thirdPlatformItemId === focusProductId
    );
    if (!product) return null;
    return buildProductFocusSnapshot(product, bindingsMap[focusProductId]);
  }, [focusProductId, shopProducts, bindingsMap]);

  const openPricingDrawer = useCallback(() => {
    if (!isAuthorized) {
      showToast("请先授权店铺，授权后即可配置并保存定价策略");
      return;
    }
    setTemplateError(null);
    setPricingOpen(true);
  }, [isAuthorized, showToast]);

  const productCatalog = useMemo(
    () =>
      shopProducts.map((p) => ({
        productId: p.thirdPlatformItemId,
        title: (p.title ?? "").trim() || p.thirdPlatformItemId,
      })),
    [shopProducts]
  );

  const pageContext = useMemo(
    () =>
      buildProductsPageContext({
        phase,
        tab,
        shopFilter,
        authorized: isAuthorized,
        shopName,
        analyzedCount: summary?.shopProducts ?? 0,
        matchedCount: matched,
        pendingCount,
        unboundCount: unbound,
        analysisReady,
        recommendedCategoryNames: recommendedCategories.map((c) => c.name),
        filterSummary,
        template,
        focusProductId,
        focusCandidateId,
        focusProduct: focusProductSnapshot,
        focusCandidates,
        productCatalog,
        scanHandoff,
        shopCurrencyHint,
      }),
    [
      phase,
      tab,
      shopFilter,
      isAuthorized,
      shopName,
      summary?.shopProducts,
      matched,
      pendingCount,
      unbound,
      analysisReady,
      recommendedCategories,
      filterSummary,
      template,
      focusProductId,
      focusCandidateId,
      focusProductSnapshot,
      focusCandidates,
      productCatalog,
      scanHandoff,
      shopCurrencyHint,
    ]
  );

  const syncSummaryFromShopData = useCallback(
    (
      products: ShopMirrorProduct[],
      bindings: Record<string, ImageBindingView>
    ) => {
      const stats = computeShopProductBindingStats(products, bindings);
      setShopProducts(products);
      setBindingsMap(bindings);
      setSummary({
        shopProducts: stats.analyzed,
        confirmedProducts: stats.confirmed,
        pendingProducts: stats.pending,
      });
      refreshNewArrivalAwareness(products, bindings);
    },
    [refreshNewArrivalAwareness]
  );

  const agentPanelContext = useMemo(() => {
    if (!agentIntentRequest) return pageContext;
    const {
      productId,
      focusCandidateId: reqCandidateId,
      focusCandidates: reqCandidates,
    } = agentIntentRequest;
    const product = shopProducts.find(
      (p) => p.thirdPlatformItemId === productId
    );
    if (!product) return pageContext;
    return {
      ...pageContext,
      focusProductId: productId,
      focusProduct: buildProductFocusSnapshot(product, bindingsMap[productId]),
      focusCandidateId:
        reqCandidateId ??
        (productId === focusProductId ? focusCandidateId : null),
      focusCandidates:
        reqCandidates ??
        (productId === focusProductId ? focusCandidates : []),
    };
  }, [
    agentIntentRequest,
    pageContext,
    shopProducts,
    bindingsMap,
    focusProductId,
    focusCandidateId,
    focusCandidates,
  ]);

  const requestAgentIntent = useCallback(
    (
      intent: ProductsIntentId,
      productId: string,
      opts?: {
        focusCandidateId?: string | null;
        focusCandidates?: CandidateSummary[];
      }
    ) => {
      setFocusProductId(productId);
      setScrollToProductId(productId);
      if (opts?.focusCandidates) {
        setFocusCandidates(opts.focusCandidates);
        setFocusCandidateId(opts.focusCandidateId ?? null);
      }
      setAgentIntentRequest({
        intent,
        productId,
        focusCandidateId: opts?.focusCandidateId,
        focusCandidates: opts?.focusCandidates,
      });
    },
    []
  );

  const focusProduct = useCallback(
    (productId: string, opts?: { openSearch?: boolean }) => {
      setTab("shop");
      if (pendingMinis.some((m) => m.productId === productId)) {
        setShopFilter("pending");
      } else if (unboundMinis.some((m) => m.productId === productId)) {
        setShopFilter("unbound");
      }
      setFocusProductId(productId);
      setScrollToProductId(productId);
      if (opts?.openSearch) {
        setSearchModeProductId(productId);
      }
    },
    [setTab, pendingMinis, unboundMinis]
  );

  const applyAgentAction = useCallback(
    (res: AgentResponse) => {
      const action = res.suggestedAction;
      if (
        res.openDrawer === "pricing" ||
        action.kind === "open_pricing_drawer"
      ) {
        openPricingDrawer();
      }
      if (action.kind === "set_tab" && action.tab) {
        setTab(action.tab);
      }
      if (action.kind === "set_shop_filter") {
        if (action.tab) setTab(action.tab);
        if (action.shopFilter) setShopFilter(action.shopFilter);
        if (action.shopFilter === "pending" && pendingMinis[0]) {
          setFocusProductId(pendingMinis[0].productId);
          setScrollToProductId(pendingMinis[0].productId);
        }
        if (action.shopFilter === "unbound" && unboundMinis[0]) {
          setFocusProductId(unboundMinis[0].productId);
          setScrollToProductId(unboundMinis[0].productId);
        }
      }
      if (action.kind === "focus_product" && action.productId) {
        focusProduct(action.productId);
      }
      if (action.kind === "open_candidate_search" && action.productId) {
        focusProduct(action.productId, { openSearch: true });
      }
      if (action.kind === "rematch_unbound") {
        setTab("shop");
        setRematchUnboundSignal((n) => n + 1);
      }
      if (action.kind === "apply_filter_preset") {
        setTab("catalog");
        setFilterPresetRequest({
          categoryName: action.filterPreset?.categoryName,
          keywords: action.filterPreset?.keywords,
        });
      }
    },
    [openPricingDrawer, setTab, focusProduct, pendingMinis, unboundMinis]
  );

  const clearAiFieldEdit = useCallback((productId: string, field: AiFieldId) => {
    setAiFieldEdits((prev) => {
      const key = aiFieldEditKey(productId, field);
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const markAiFieldEdit = useCallback(
    (record: Omit<AiFieldEditRecord, "createdAt">) => {
      const key = aiFieldEditKey(record.productId, record.field);
      setAiFieldEdits((prev) => ({
        ...prev,
        [key]: { ...record, createdAt: Date.now() },
      }));
    },
    []
  );

  const executeListingPriceUpdate = useCallback(
    async (req: {
      productId: string;
      price: number;
      currency: string;
      variantScope: "all" | "one";
      variantSkuId?: string;
    }) => {
      const target =
        req.variantScope === "all"
          ? ({ scope: "all" } as const)
          : ({
              scope: "one",
              thirdPlatformSkuId: req.variantSkuId!,
            } as const);
      const { detail, previousPrice, variantScope } = await writeShopListingPrice(
        shopName,
        req.productId,
        req.price,
        target
      );
      const currency = req.currency || detail.currency || "USD";
      const editRecord: AiFieldEditRecord = {
        productId: req.productId,
        field: "listingPrice",
        previousValue: previousPrice,
        nextValue: req.price,
        previousDisplay: formatListingMoney(previousPrice, currency),
        nextDisplay: formatListingMoney(req.price, currency),
        currency,
        createdAt: Date.now(),
      };
      const editsWithCurrent = {
        ...aiFieldEditsRef.current,
        [aiFieldEditKey(req.productId, "listingPrice")]: editRecord,
      };
      aiFieldEditsRef.current = editsWithCurrent;
      setAiFieldEdits(editsWithCurrent);

      await loadSummary();
      setShopProducts((prev) =>
        applyListingEditsToProducts(
          prev.map((p) =>
            p.thirdPlatformItemId === req.productId
              ? mergeListingPriceRow(
                  p,
                  detail,
                  req.price,
                  previousPrice,
                  variantScope
                )
              : p
          ),
          editsWithCurrent
        )
      );
      bumpMirrorRefresh();
      showToast(
        `已将「${detail.title ?? "商品"}」售价更新为 ${currency} ${req.price.toFixed(2)}`
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  // Real reset: soft-delete stored template so isDefault becomes true again.
  const resetPricingGuideRequested =
    searchParams.get("resetPricingGuide") === "1";
  const resetStartedRef = useRef(false);
  useEffect(() => {
    if (!resetPricingGuideRequested || !isAuthorized || !shopName) return;
    if (resetStartedRef.current) return;
    resetStartedRef.current = true;
    void (async () => {
      try {
        const tpl = await api.clearPricingTemplate(shopName);
        setTemplate(tpl);
        showToast("已恢复未配置状态，可体验首次定价引导");
      } catch (err) {
        showToast(readableError(err));
      } finally {
        startTransition(() => {
          router.replace("/products", { scroll: false });
        });
      }
    })();
  }, [
    resetPricingGuideRequested,
    isAuthorized,
    shopName,
    showToast,
    router,
  ]);

  const handleSaveTemplate = useCallback(
    async (payload: {
      exchangeRate: number;
      multiplier: number;
      addend: number;
      roundingStrategy: string;
      decimals: number;
      sourceCurrency: string;
      targetCurrency: string;
    }) => {
      setSavingTemplate(true);
      setTemplateError(null);
      try {
        const saved = await api.upsertPricingTemplate({ shopName, ...payload });
        setTemplate(saved);
        setPricingOpen(false);
        showToast("定价策略已保存");
        if (previewPricingGuide) {
          startTransition(() => {
            router.replace("/products", { scroll: false });
          });
        }
      } catch (err) {
        setTemplateError(readableError(err));
        showToast("定价策略保存失败");
      } finally {
        setSavingTemplate(false);
      }
    },
    [shopName, showToast, previewPricingGuide, router]
  );

  const handleClearTemplate = useCallback(async () => {
    if (clearingTemplate) return;
    if (!window.confirm("恢复系统默认后，右侧将重新出现首次定价引导。确定？")) {
      return;
    }
    setClearingTemplate(true);
    setTemplateError(null);
    try {
      const tpl = await api.clearPricingTemplate(shopName);
      setTemplate(tpl);
      setPricingOpen(false);
      showToast("已恢复系统默认，可重新体验首次配置");
    } catch (err) {
      setTemplateError(readableError(err));
      showToast(readableError(err));
    } finally {
      setClearingTemplate(false);
    }
  }, [clearingTemplate, shopName, showToast]);

  const pricingDrawer = (
    <PricingTemplateDrawer
      open={pricingOpen}
      template={template}
      saving={savingTemplate}
      error={templateError}
      onClose={() => setPricingOpen(false)}
      onSave={(payload) => void handleSaveTemplate(payload)}
      onClear={() => void handleClearTemplate()}
      clearing={clearingTemplate}
    />
  );

  const jumpToShopFilter = useCallback(
    (f: ShopFilter) => {
      setShopFilter(f);
      setTab("shop");
    },
    [setTab]
  );
  const enqueueUnboundMatch = useCallback(() => {
    enqueueBatchLink("manual");
  }, [enqueueBatchLink]);

  const statusCta: {
    label: string;
    href?: string;
    onClick?: () => void;
    loading?: boolean;
    disabled?: boolean;
    queueAction?: boolean;
  } =
    batchLinkActive
      ? {
          label: "一键关联中…",
          loading: true,
          disabled: true,
          queueAction: true,
        }
      : linkableCount > 0
        ? {
            label: "一键关联",
            onClick: () => void enqueueUnboundMatch(),
            queueAction: true,
          }
        : pendingCount > 0
          ? { label: `确认 ${pendingCount} 个`, onClick: () => jumpToShopFilter("pending") }
          : { label: "SKU 绑定", href: "/sku-align" };

  const scanCopilot: AiPanelContent = {
    title: scanDone ? "首轮分析已完成" : "AI 正在分析",
    summary: scanDone
      ? scanBriefingLine(scanStats)
      : "同步商品、匹配货源并读取订单",
    bullets: [],
    nextAction: scanDone
      ? { label: "查看 AI 推荐结果", action: "view" }
      : undefined,
  };

  const pageAgentHelpers = useMemo(
    () => ({
      showToast,
      refreshData: async () => {
        await loadSummary();
      },
      focusProduct: (productId: string, opts?: { openSearch?: boolean }) => {
        focusProduct(productId, opts);
      },
      applyFilter: (filter: Record<string, unknown>) => {
        if (filter.shopFilter && typeof filter.shopFilter === "string") {
          setShopFilter(filter.shopFilter as ShopFilter);
          setTab("shop");
        }
        // 价格/利润筛选暂存，后续可接入
        if (filter.priceBelow != null || filter.profitBelow != null) {
          showToast("筛选条件已应用到当前列表");
        }
      },
      openDrawer: (drawer: string) => {
        if (drawer === "pricing") openPricingDrawer();
      },
    }),
    [showToast, focusProduct, openPricingDrawer, loadSummary]
  );

  const rail = (
    <AssistantRail
      assistantContent={
        <ProductsAgentPanel
          context={agentPanelContext}
          pendingMinis={pendingMinis}
          unboundMinis={unboundMinis}
          intentRequest={agentIntentRequest}
          onIntentRequestConsumed={() => setAgentIntentRequest(null)}
          onApplySuggestedAction={(action) =>
            applyAgentAction({
              agentId: "orchestrator",
              intent: "rail_action",
              summary: "",
              explanation: [],
              nextSteps: [],
              suggestedAction: action,
            })
          }
          onFocusProduct={focusProduct}
          onRequestAgentIntent={(intent, productId) =>
            requestAgentIntent(intent, productId)
          }
          onExecuteListingPriceUpdate={executeListingPriceUpdate}
        />
      }
      strategyCards={
        isAuthorized ? (
          // First-time guide only; after pricing is saved, use the「定价策略」chip.
          template == null || template.isDefault || previewPricingGuide ? (
            <PricingStrategyRailCard
              template={template}
              analysisReady={analysisReady}
              forceGuide={previewPricingGuide}
              onConfigure={openPricingDrawer}
            />
          ) : null
        ) : (
          <InfoCard title="定价策略">
            授权店铺后，可在此配置目标币种、汇率与倍率，并生成建议售价。
          </InfoCard>
        )
      }
    />
  );

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} rail={rail} {...wb.shellProps}>
        <WorkbenchPanel
          title="智能选品"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "智能选品" }]}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            正在恢复店铺授权…
          </div>
          <TableSkeleton rows={4} />
        </WorkbenchPanel>
        {pricingDrawer}
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={rail}
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title="智能选品"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "智能选品" }]}
          {...wb.panelProps}
        >
          <EmptyState
            title="尚未连接店铺"
            description="完成 Shopify 授权后，此处将加载在售商品与可上架的货源商品。"
            action={
              <Link href="/authorize">
                <Button size="sm" className="mt-1">
                  去授权店铺
                </Button>
              </Link>
            }
          />
        </WorkbenchPanel>
        {pricingDrawer}
      </WorkbenchShell>
    );
  }

  if (phase === "scan") {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <>
                <CopilotCard
                  content={scanCopilot}
                  onNextAction={(a) => {
                    if (a === "view" && scanDone) void finishToResult();
                  }}
                />
              </>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title={scanDone ? "AI 已完成首轮选品分析" : "AI 正在分析你的店铺"}
          breadcrumbs={BREADCRUMBS}
          {...wb.panelProps}
        >
          <AiCopilotScanStage
            tasks={scanTasks}
            stats={scanStats}
            progressPercent={scanProgressPercent}
            done={scanDone}
            onViewResult={() => void finishToResult()}
          />
        </WorkbenchPanel>
        {pricingDrawer}
      </WorkbenchShell>
    );
  }

  const tabs = [
    { id: "shop", label: "我的shopify", count: summary?.shopProducts },
    { id: "catalog", label: "发现新品" },
  ];

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={rail}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title="智能选品"
        breadcrumbs={BREADCRUMBS}
        {...wb.panelProps}
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索商品标题/SKU…"
                className="h-7 w-48 rounded-[var(--radius-control)] border border-hairline bg-surface pl-7 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {statusCta.href ? (
              <Link href={statusCta.href}>
                <Button>
                  {statusCta.label}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                onClick={statusCta.onClick}
                disabled={statusCta.disabled || statusCta.loading}
              >
                {statusCta.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {statusCta.label}
              </Button>
            )}
          </div>
        }
      >
        <div className="space-y-3">
          {/* 1) Tabs — above all tab-specific context */}
          <SegmentedTabs
            variant="solid"
            tabs={tabs}
            value={tab}
            onValueChange={(id) => setTab(id as Tab)}
          />

          {/* 2) Tab context: Shopify summary vs Discover filters */}
          <div className="min-h-0">
            {tab === "shop" ? (
              <SmartSourcingSummaryBar
                ready={summary != null}
                analyzed={summary?.shopProducts ?? 0}
                matched={matched}
                pending={pendingCount}
                unbound={unbound}
                pendingNewAnalysis={newArrivalStats.pendingNewAnalysisCount}
                recommendedCategories={recommendedCategories}
                onRefresh={restartScan}
                onViewNewArrivals={() => setShopFilter("new_arrivals")}
                newArrivalAnalysisResult={newArrivalAnalysisResult}
                onDismissNewArrivalResult={() => setNewArrivalAnalysisResult(null)}
                onViewNewArrivalPending={() => viewNewArrivalResult("pending")}
                onViewNewArrivalUnmatched={() => viewNewArrivalResult("unbound")}
                batchLinkProgress={batchLinkProgress}
                batchLinkBusy={batchLinkActive}
              />
            ) : (
              <div ref={setFiltersMountEl} />
            )}
          </div>

          {/* 3) Results — product pool / list */}
          {tab === "shop" ? (
            <div>
              <ShopProductsPanel
                onActivity={loadSummary}
                filter={shopFilter}
                onFilterChange={setShopFilter}
                pendingNewAnalysisIds={newArrivalStats.pendingNewAnalysisIds}
                onMirrorAnalysisCommitted={commitAnalysisBaseline}
                focusProductId={focusProductId}
                scrollToProductId={scrollToProductId}
                onScrollToConsumed={() => setScrollToProductId(null)}
                searchModeProductId={searchModeProductId}
                rematchUnboundSignal={rematchUnboundSignal}
                batchLinkRequest={batchLinkRequest}
                mirrorRefreshSignal={mirrorRefreshSignal}
                linkingLocked={batchLinkActive}
                onBatchLinkProgressChange={setBatchLinkProgress}
                onBatchLinkFinished={(progress) => {
                  void loadSummary().then(({ bindings }) => {
                    bumpMirrorRefresh();
                    if (progress.sessionOrder.length > 0) {
                      mergeProductBaseline(shopName, progress.sessionOrder);
                    }
                    if (progress.processed > 0) {
                      const result = buildNewArrivalResultFromBatch(progress, bindings);
                      setNewArrivalAnalysisResult(result);
                      showToast(
                        progress.source === "auto"
                          ? formatNewArrivalAnalysisSummary(result)
                          : formatBatchLinkSummary(progress)
                      );
                    }
                  });
                  window.setTimeout(() => setBatchLinkProgress(null), 2000);
                }}
                onSearchModeConsumed={() => setSearchModeProductId(null)}
                onProductFocus={(id) => setFocusProductId(id)}
                onBindingsChange={setBindingsMap}
                onShopProductsChange={syncSummaryFromShopData}
                onCandidateContextChange={(productId, ctx) => {
                  if (productId !== focusProductId) return;
                  setFocusCandidateId(ctx.candidateId);
                  setFocusCandidates(ctx.candidates);
                }}
                onMinisChange={({ pending, unbound }) => {
                  setPendingMinis(pending);
                  setUnboundMinis(unbound);
                }}
                aiFieldEdits={aiFieldEdits}
                onAiFieldEditConsumed={clearAiFieldEdit}
                searchQuery={searchQuery}
              />
            </div>
          ) : null}
          <div className={tab === "catalog" ? undefined : "hidden"}>
            <CatalogPublishPanel
              onActivity={loadSummary}
              onBindingLinked={() => bumpMirrorRefresh()}
              recommendedCategories={recommendedCategories}
              filtersMountEl={tab === "catalog" ? filtersMountEl : null}
              sharedTemplate={template}
              onAppliedFilterSummaryChange={setFilterSummary}
              filterPresetRequest={filterPresetRequest}
              onFilterPresetConsumed={() => setFilterPresetRequest(null)}
            />
          </div>
        </div>
      </WorkbenchPanel>

      {pricingDrawer}
    </WorkbenchShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <WorkbenchShell sidebar={<StepSidebar />}>
          <WorkbenchPanel title="智能选品">{null}</WorkbenchPanel>
        </WorkbenchShell>
      }
    >
      <SelectContent />
    </Suspense>
  );
}
