"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Search, X } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { AiCopilotScanStage } from "@/components/workbench/ai-copilot-scan-stage";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useProductsScan } from "@/hooks/use-products-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import { consumeScanHandoff, markScanHandoff } from "@/lib/scan/handoff";
import { scanBriefingLine } from "@/lib/scan/copilot-workflow";
import {
  aiFieldEditKey,
  applyListingEditsToProducts,
  applyTitleEditsToProducts,
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
import { formatNewArrivalAnalysisSummary } from "@/lib/new-arrival-analysis-result";
import { mergeProductBaseline } from "@/lib/shop-product-mirror-baseline";
import { formatBatchLinkSummary } from "@/lib/batch-link/types";
import type { BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import { buildNewArrivalResultFromBatch } from "@/lib/batch-link/build-new-arrival-result";
import { SmartSourcingSummaryBar } from "@/components/select/smart-sourcing-summary-bar";
import { PricingTemplateDrawer } from "@/components/select/pricing-template-drawer";
import { ProductsAgentPanel } from "@/components/select/products-agent-panel";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import { mergeListingPriceRow, writeShopListingPrice } from "@/lib/shop-product-write";
import {
  formatStatusTransition,
  LISTING_STATUS_LABELS,
  normalizeShopStatus,
  writeShopProductStatus,
  type ShopifyListingStatusTarget,
} from "@/lib/shop-product-status";
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
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

type Tab = "shop" | "catalog";

function resolveTitleCopyStyle(
  copyAction: "translate" | "rewrite" | "optimize",
  copyStyle?: "amazon" | "literal"
): "amazon" | "literal" {
  if (copyStyle === "amazon" || copyStyle === "literal") return copyStyle;
  return copyAction === "translate" ? "amazon" : "literal";
}

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
  const t = useT();
  const locale = useLocale();
  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("products.title") },
  ];

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
        router.replace(localePath(locale, `/products?tab=${t}`), { scroll: false });
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
      setNewArrivalStats(computeNewArrivalStats(products, bindings, baseline, shopName));
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
    void api.backfillPublishedBindings(shopName).catch(() => null);
    const [products, bindings, tpl] = await Promise.all([
      api.getShopProducts(shopName).catch(() => [] as ShopMirrorProduct[]),
      api.listImageBindings(shopName).catch(() => []),
      api.getPricingTemplate(shopName).catch(() => null),
    ]);
    const map = indexImageBindings(bindings);
    const stats = computeShopProductBindingStats(products, map);
    const merged = applyTitleEditsToProducts(
      applyListingEditsToProducts(products, aiFieldEditsRef.current),
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

  const [batchLinkProgress, setBatchLinkProgress] = useState<BatchLinkProgress | null>(
    null
  );
  const [batchLinkRequest, setBatchLinkRequest] = useState<BatchLinkRequest | null>(null);
  const [pageLinkableScope, setPageLinkableScope] = useState<{
    ids: string[];
    page: number;
    totalPages: number;
  }>({ ids: [], page: 1, totalPages: 1 });
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
  const pageLinkableCount = pageLinkableScope.ids.length;

  const enqueueBatchLink = useCallback(
    (source: BatchLinkRequest["source"]) => {
      if (batchLinkActive) return;
      if (pageLinkableScope.ids.length === 0) {
        showToast("当前页暂无可关联商品（需有主图）");
        return;
      }
      setTab("shop");
      setShopFilter("all");
      fireBatchLink(source, pageLinkableScope.ids);
    },
    [
      batchLinkActive,
      fireBatchLink,
      pageLinkableScope.ids,
      setTab,
      showToast,
    ]
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
    if (summary == null) return;

    const newIds = pageLinkableScope.ids.filter((id) =>
      newArrivalStats.pendingNewAnalysisIds.has(id)
    );
    if (newIds.length === 0) return;

    autoLinkVisitRef.current = true;
    setShopFilter("all");
    fireBatchLink("auto", newIds);
  }, [
    batchLinkActive,
    fireBatchLink,
    isAuthorized,
    newArrivalStats.pendingNewAnalysisIds,
    pageLinkableScope.ids,
    phase,
    summary,
    tab,
  ]);

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
    return buildProductFocusSnapshot(product, bindingsMap[focusProductId], template);
  }, [focusProductId, shopProducts, bindingsMap, template]);

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
      shopProducts.map((p) => {
        const binding = bindingsMap[p.thirdPlatformItemId];
        let bindState: string = "unbound";
        if (binding?.bound) {
          bindState = binding.bindStatus === "PENDING" ? "pending" : "confirmed";
        }
        return {
          productId: p.thirdPlatformItemId,
          title: (p.title ?? "").trim() || p.thirdPlatformItemId,
          bindState,
          shopStatus: p.status,
        };
      }),
    [shopProducts, bindingsMap]
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
      focusProduct: buildProductFocusSnapshot(product, bindingsMap[productId], template),
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
    template,
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

  const [highlightedArea, setHighlightedArea] = useState<string | null>(null);

  const highlight = useCallback((area: string) => {
    setHighlightedArea(area);
    setTimeout(() => setHighlightedArea(null), 2000);
  }, []);

  const applyAgentAction = useCallback(
    (res: AgentResponse) => {
      const action = res.suggestedAction;
      if (
        res.openDrawer === "pricing" ||
        action.kind === "open_pricing_drawer"
      ) {
        openPricingDrawer();
        highlight("pricing");
      }
      if (action.kind === "set_tab" && action.tab) {
        setTab(action.tab);
        highlight("tabs");
      }
      if (action.kind === "set_shop_filter") {
        if (action.tab) setTab(action.tab);
        if (action.shopFilter) setShopFilter(action.shopFilter);
        highlight("filters");
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

  const executeProductCopyUpdate = useCallback(
    async (req: {
      productId: string;
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      previewText: string;
    }) => {
      if (req.copyField === "title" || req.copyField === "all") {
        try {
          const detail = await api.getShopProductDetail(shopName, req.productId);
          const previousTitle = detail.title ?? "";
          const style = resolveTitleCopyStyle(req.copyAction, req.copyStyle);
          const translated =
            req.previewText?.trim() ||
            (
              await api.translateText(
                previousTitle,
                req.targetLang,
                undefined,
                style
              )
            ).translatedText ||
            "";
          if (!translated) {
            throw new Error("标题生成失败");
          }
          const result = await api.updateShopProduct(shopName, {
            itemId: req.productId,
            title: translated,
          });
          const nextTitle = result.title ?? translated;
          const editRecord: AiFieldEditRecord = {
            productId: req.productId,
            field: "title",
            previousDisplay: previousTitle || "—",
            nextDisplay: nextTitle,
            createdAt: Date.now(),
          };
          const editsWithCurrent = {
            ...aiFieldEditsRef.current,
            [aiFieldEditKey(req.productId, "title")]: editRecord,
          };
          aiFieldEditsRef.current = editsWithCurrent;
          setAiFieldEdits(editsWithCurrent);
          setShopProducts((prev) =>
            prev.map((p) =>
              p.thirdPlatformItemId === req.productId
                ? { ...p, title: nextTitle }
                : p
            )
          );
          bumpMirrorRefresh();
          await loadSummary();
          const actionLabel =
            req.copyAction === "translate"
              ? `翻译为 ${req.targetLang?.toUpperCase() ?? "EN"}`
              : req.copyAction === "rewrite"
                ? "改写"
                : "优化";
          showToast(`已将商品标题${actionLabel}并更新到 Shopify`);
        } catch (err) {
          showToast(readableError(err) || "更新商品标题失败");
          throw err;
        }
      }
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  const executeBatchProductCopyUpdate = useCallback(
    async (req: {
      productIds: string[];
      copyField: "title" | "description" | "all";
      copyAction: "translate" | "rewrite" | "optimize";
      targetLang?: string;
      copyStyle?: "amazon" | "literal";
      tone?: string;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, copyField, copyAction, targetLang, copyStyle, onProgress } = req;
      const style = resolveTitleCopyStyle(copyAction, copyStyle);
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          const originalTitle = detail.title ?? "";
          let newText = "";

          if (copyAction === "translate") {
            const result = await api.translateText(
              originalTitle,
              targetLang,
              undefined,
              style
            );
            if (result.success && result.translatedText) {
              newText = result.translatedText;
            } else {
              throw new Error(result.error ?? "标题本土化失败");
            }
          } else {
            throw new Error("该文案操作暂未实现");
          }

          if (copyField === "title" || copyField === "all") {
            const updateResult = await api.updateShopProduct(shopName, {
              itemId: productId,
              title: newText,
            });
            const nextTitle = updateResult.title ?? newText;
            const editRecord: AiFieldEditRecord = {
              productId,
              field: "title",
              previousDisplay: originalTitle || "—",
              nextDisplay: nextTitle,
              createdAt: Date.now(),
            };
            const editsWithCurrent = {
              ...aiFieldEditsRef.current,
              [aiFieldEditKey(productId, "title")]: editRecord,
            };
            aiFieldEditsRef.current = editsWithCurrent;
            setAiFieldEdits(editsWithCurrent);
            setShopProducts((prev) =>
              prev.map((p) =>
                p.thirdPlatformItemId === productId
                  ? { ...p, title: nextTitle }
                  : p
              )
            );
          }

          success++;
        } catch {
          failed++;
        }

        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();

      const actionLabel =
        copyAction === "translate"
          ? `翻译为 ${targetLang?.toUpperCase() ?? "EN"}`
          : copyAction === "rewrite"
            ? "改写"
            : "优化";
      showToast(`批量${actionLabel}完成：成功 ${success} 个，失败 ${failed} 个`);
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  const executeBatchListingPriceUpdate = useCallback(
    async (req: {
      productIds: string[];
      batchPriceMultiplier?: number;
      batchPriceFixed?: number;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, batchPriceMultiplier, batchPriceFixed, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i];
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          let targetPrice = 0;

          if (batchPriceFixed) {
            targetPrice = batchPriceFixed;
          } else if (batchPriceMultiplier && detail.minPrice != null) {
            targetPrice = detail.minPrice * batchPriceMultiplier;
          } else {
            throw new Error("无法计算目标价格");
          }

          const target = { scope: "all" } as const;
          await writeShopListingPrice(shopName, productId, targetPrice, target);
          success++;
        } catch {
          failed++;
        }

        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();

      const modeLabel = batchPriceFixed ? `固定价格 ${batchPriceFixed}` : `当前价格 × ${batchPriceMultiplier}`;
      showToast(`批量改价完成（${modeLabel}）：成功 ${success} 个，失败 ${failed} 个`);
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  const applyLocalProductStatus = useCallback(
    (productId: string, status: ShopifyListingStatusTarget) => {
      setShopProducts((prev) =>
        prev.map((p) =>
          p.thirdPlatformItemId === productId ? { ...p, status } : p
        )
      );
    },
    []
  );

  const executeProductStatusUpdate = useCallback(
    async (req: {
      productId: string;
      productTitle: string;
      targetStatus: ShopifyListingStatusTarget;
    }) => {
      const detail = await writeShopProductStatus(
        shopName,
        req.productId,
        req.targetStatus
      );
      applyLocalProductStatus(req.productId, req.targetStatus);
      bumpMirrorRefresh();
      await loadSummary();
      showToast(
        `已将「${detail.title ?? req.productTitle}」设为 ${LISTING_STATUS_LABELS[req.targetStatus]}`
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  const executeBatchProductStatusUpdate = useCallback(
    async (req: {
      productIds: string[];
      targetStatus: ShopifyListingStatusTarget;
      onProgress?: (current: number, total: number, success: number, failed: number) => void;
    }) => {
      const { productIds, targetStatus, onProgress } = req;
      const total = productIds.length;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < total; i++) {
        const productId = productIds[i]!;
        try {
          const detail = await api.getShopProductDetail(shopName, productId);
          if (normalizeShopStatus(detail.status) === targetStatus) {
            success++;
            onProgress?.(i + 1, total, success, failed);
            continue;
          }
          await writeShopProductStatus(shopName, productId, targetStatus);
          applyLocalProductStatus(productId, targetStatus);
          success++;
        } catch {
          failed++;
        }
        onProgress?.(i + 1, total, success, failed);
      }

      bumpMirrorRefresh();
      await loadSummary();
      showToast(
        `批量${LISTING_STATUS_LABELS[targetStatus]}完成：成功 ${success} 个，失败 ${failed} 个`
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast]
  );

  const previewGenerators = useMemo(
    () => ({
      update_product_copy: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const copyField = plan.draft.params.copyField ?? "title";
        const copyAction = plan.draft.params.copyAction ?? "translate";
        const targetLang = plan.draft.params.copyTargetLang ?? "en";
        const copyStyle = plan.draft.params.copyStyle;

        const detail = await api.getShopProductDetail(shopName, productId);
        const originalTitle = detail.title ?? "";
        let translatedText = "";
        const style = resolveTitleCopyStyle(copyAction, copyStyle);

        if (copyAction === "translate") {
          const result = await api.translateText(
            originalTitle,
            targetLang,
            undefined,
            style
          );
          if (!result.success || !result.translatedText) {
            throw new Error(result.error ?? "标题生成失败");
          }
          translatedText = result.translatedText;
        } else {
          throw new Error("该文案操作暂未实现");
        }

        const fieldLabel =
          copyField === "title" ? "标题" : copyField === "description" ? "描述" : "全部文案";
        const modeNote =
          style === "literal"
            ? "直译模式"
            : "去噪 + Amazon 结构重组";

        return {
          sections: [
            {
              rows: [
                {
                  label: fieldLabel,
                  before: originalTitle,
                  after: translatedText,
                },
              ],
            },
          ],
          extraNote: `${modeNote} · ${copyField === "all" ? "将更新标题与描述" : ""}`.trim(),
          impact: {
            scope: `修改 1 个商品（${fieldLabel}）`,
            durationHint: "约 2 秒",
            reversible: true,
            riskNote: undefined,
          },
          payload: {
            productId,
            copyField,
            copyAction,
            targetLang,
            copyStyle: style,
            previewText: translatedText,
          },
        };
      },
      batch_update_product_copy: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const copyField = plan.draft.params.copyField ?? "title";
        const copyAction = plan.draft.params.copyAction ?? "translate";
        const targetLang = plan.draft.params.copyTargetLang ?? "en";
        const copyStyle = plan.draft.params.copyStyle;
        const style = resolveTitleCopyStyle(copyAction, copyStyle);
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error("没有可处理的商品");
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            const originalTitle = detail.title ?? "";
            let translatedText = "";

            if (copyAction === "translate") {
              const result = await api.translateText(
                originalTitle,
                targetLang,
                undefined,
                style
              );
              if (result.success && result.translatedText) {
                translatedText = result.translatedText;
              } else {
                translatedText = result.error ?? "（生成失败）";
              }
            } else {
              translatedText = "（该操作暂未实现）";
            }

            sampleRows.push({
              label: `商品 ${i + 1}`,
              before: originalTitle,
              after: translatedText,
            });
          } catch {
            sampleRows.push({
              label: `商品 ${i + 1}`,
              before: "（读取失败）",
              after: "（读取失败）",
            });
          }
        }

        const fieldLabel =
          copyField === "title" ? "标题" : copyField === "description" ? "描述" : "全部文案";
        const actionLabel =
          copyAction === "translate"
            ? `本土化为 ${targetLang.toUpperCase()}`
            : copyAction === "rewrite"
              ? "改写"
              : "优化";
        const modeNote =
          style === "literal" ? "直译" : "去噪 + Amazon 结构重组";

        const extraNote =
          (sampleCount < totalCount
            ? `以上为前 ${sampleCount} 个商品预览，剩余 ${totalCount - sampleCount} 个将按相同规则处理`
            : `以上为全部 ${totalCount} 个商品`) + ` · ${modeNote}`;

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint =
          estimatedSeconds < 60
            ? `约 ${estimatedSeconds} 秒`
            : `约 ${Math.ceil(estimatedSeconds / 60)} 分钟`;

        return {
          sections: [
            {
              title: `批量${actionLabel} · 共 ${totalCount} 个商品`,
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: `修改 ${totalCount} 个商品（${fieldLabel}）`,
            durationHint,
            reversible: true,
            riskNote: totalCount > 10 ? "批量修改较多，建议先确认翻译质量" : undefined,
          },
          payload: {
            productIds,
            copyField,
            copyAction,
            targetLang,
            copyStyle: style,
            totalCount,
          },
        };
      },
      batch_update_listing_price: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const multiplier = plan.draft.params.batchPriceMultiplier;
        const fixedPrice = plan.draft.params.batchPriceFixed;
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error("没有可处理的商品");
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            const title = detail.title ?? "未知商品";
            const currentPrice = detail.minPrice ?? 0;
            let newPrice = 0;

            if (fixedPrice) {
              newPrice = fixedPrice;
            } else if (multiplier && detail.minPrice != null) {
              newPrice = detail.minPrice * multiplier;
            } else {
              newPrice = 0;
            }

            sampleRows.push({
              label: title,
              before: currentPrice > 0 ? `${currentPrice.toFixed(2)}` : "（暂无售价）",
              after: newPrice > 0 ? `${newPrice.toFixed(2)}` : "（无法计算）",
            });
          } catch {
            sampleRows.push({
              label: `商品 ${i + 1}`,
              before: "（读取失败）",
              after: "（读取失败）",
            });
          }
        }

        const modeLabel = fixedPrice ? `固定价格 ${fixedPrice}` : `采购价 × ${multiplier}`;

        const extraNote =
          sampleCount < totalCount
            ? `以上为前 ${sampleCount} 个商品预览，剩余 ${totalCount - sampleCount} 个商品将按相同规则处理`
            : `以上为全部 ${totalCount} 个商品`;

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint =
          estimatedSeconds < 60
            ? `约 ${estimatedSeconds} 秒`
            : `约 ${Math.ceil(estimatedSeconds / 60)} 分钟`;

        return {
          sections: [
            {
              title: `批量改价 · ${modeLabel} · 共 ${totalCount} 个商品`,
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: `修改 ${totalCount} 个商品售价`,
            durationHint,
            reversible: true,
            riskNote: totalCount > 10 ? "批量修改较多，建议先确认预览价格" : undefined,
          },
          payload: {
            productIds,
            batchPriceMultiplier: multiplier,
            batchPriceFixed: fixedPrice,
            totalCount,
          },
        };
      },
      draft_product: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const detail = await api.getShopProductDetail(shopName, productId);
        const title = detail.title ?? plan.targetLabel ?? "商品";
        const targetStatus: ShopifyListingStatusTarget = "DRAFT";
        return {
          sections: [
            {
              rows: [
                {
                  label: title,
                  before: normalizeShopStatus(detail.status),
                  after: targetStatus,
                },
              ],
            },
          ],
          extraNote: formatStatusTransition(detail.status, targetStatus),
          impact: {
            scope: `修改 1 个商品状态`,
            durationHint: "约 2 秒",
            reversible: true,
            riskNote: "草稿商品前台不可见，可在 Shopify 后台或本系统改回 ACTIVE",
          },
          payload: {
            productId,
            productTitle: title,
            targetStatus,
          },
        };
      },
      archive_product: async (plan: any, shopName: string) => {
        const productId = plan.draft.productId ?? plan.draft.params.productId;
        const detail = await api.getShopProductDetail(shopName, productId);
        const title = detail.title ?? plan.targetLabel ?? "商品";
        const targetStatus: ShopifyListingStatusTarget = "ARCHIVED";
        return {
          sections: [
            {
              rows: [
                {
                  label: title,
                  before: normalizeShopStatus(detail.status),
                  after: targetStatus,
                },
              ],
            },
          ],
          extraNote: formatStatusTransition(detail.status, targetStatus),
          impact: {
            scope: `修改 1 个商品状态`,
            durationHint: "约 2 秒",
            reversible: true,
            riskNote: "归档后商品将从在售列表移除，需到 Shopify 后台恢复",
          },
          payload: {
            productId,
            productTitle: title,
            targetStatus,
          },
        };
      },
      batch_draft_products: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const targetStatus: ShopifyListingStatusTarget = "DRAFT";
        const totalCount = productIds.length;
        if (totalCount === 0) throw new Error("没有可处理的商品");

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label: detail.title ?? `商品 ${i + 1}`,
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: `商品 ${i + 1}`,
              before: "（读取失败）",
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: `批量放到草稿 · 共 ${totalCount} 个商品`,
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? `以上为前 ${sampleCount} 个商品预览，剩余 ${totalCount - sampleCount} 个将改为 DRAFT`
              : `将全部 ${totalCount} 个 ACTIVE 商品改为 DRAFT`,
          impact: {
            scope: `修改 ${totalCount} 个商品状态`,
            durationHint:
              totalCount < 60
                ? `约 ${Math.max(3, totalCount * 2)} 秒`
                : `约 ${Math.ceil((totalCount * 2) / 60)} 分钟`,
            reversible: true,
            riskNote: totalCount > 10 ? "批量下架较多，请确认范围无误" : undefined,
          },
          payload: {
            productIds,
            targetStatus,
            totalCount,
          },
        };
      },
      batch_archive_products: async (plan: any, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const targetStatus: ShopifyListingStatusTarget = "ARCHIVED";
        const totalCount = productIds.length;
        if (totalCount === 0) throw new Error("没有可处理的商品");

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label: detail.title ?? `商品 ${i + 1}`,
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: `商品 ${i + 1}`,
              before: "（读取失败）",
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: `批量下架归档 · 共 ${totalCount} 个商品`,
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? `以上为前 ${sampleCount} 个商品预览，剩余 ${totalCount - sampleCount} 个将归档下架`
              : `将全部 ${totalCount} 个 ACTIVE 商品归档下架`,
          impact: {
            scope: `修改 ${totalCount} 个商品状态`,
            durationHint:
              totalCount < 60
                ? `约 ${Math.max(3, totalCount * 2)} 秒`
                : `约 ${Math.ceil((totalCount * 2) / 60)} 分钟`,
            reversible: true,
            riskNote: totalCount > 10 ? "批量下架较多，请确认范围无误" : undefined,
          },
          payload: {
            productIds,
            targetStatus,
            totalCount,
          },
        };
      },
    }),
    []
  );

  const commandExecutors = useMemo(
    () => ({
      update_listing_price: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          price: number;
          currency: string;
          variantScope: "all" | "one";
          variantSkuId?: string;
        };
        await executeListingPriceUpdate({
          productId: p.productId,
          price: p.price,
          currency: p.currency,
          variantScope: p.variantScope,
          variantSkuId: p.variantSkuId,
        });
      },
      update_product_copy: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          copyField: "title" | "description" | "all";
          copyAction: "translate" | "rewrite" | "optimize";
          targetLang?: string;
          copyStyle?: "amazon" | "literal";
          tone?: string;
          previewText: string;
        };
        await executeProductCopyUpdate({
          productId: p.productId,
          copyField: p.copyField,
          copyAction: p.copyAction,
          targetLang: p.targetLang,
          copyStyle: p.copyStyle,
          tone: p.tone,
          previewText: p.previewText,
        });
      },
      batch_update_product_copy: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          copyField: "title" | "description" | "all";
          copyAction: "translate" | "rewrite" | "optimize";
          targetLang?: string;
          copyStyle?: "amazon" | "literal";
          tone?: string;
          totalCount: number;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductCopyUpdate({
          productIds: p.productIds,
          copyField: p.copyField,
          copyAction: p.copyAction,
          targetLang: p.targetLang,
          copyStyle: p.copyStyle,
          tone: p.tone,
          onProgress: p.onProgress,
        });
      },
      batch_update_listing_price: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          batchPriceMultiplier?: number;
          batchPriceFixed?: number;
          totalCount: number;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchListingPriceUpdate({
          productIds: p.productIds,
          batchPriceMultiplier: p.batchPriceMultiplier,
          batchPriceFixed: p.batchPriceFixed,
          onProgress: p.onProgress,
        });
      },
      draft_product: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          productTitle: string;
          targetStatus: ShopifyListingStatusTarget;
        };
        await executeProductStatusUpdate(p);
      },
      archive_product: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productId: string;
          productTitle: string;
          targetStatus: ShopifyListingStatusTarget;
        };
        await executeProductStatusUpdate(p);
      },
      batch_draft_products: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          targetStatus: ShopifyListingStatusTarget;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductStatusUpdate({
          productIds: p.productIds,
          targetStatus: p.targetStatus,
          onProgress: p.onProgress,
        });
      },
      batch_archive_products: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          targetStatus: ShopifyListingStatusTarget;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        await executeBatchProductStatusUpdate({
          productIds: p.productIds,
          targetStatus: p.targetStatus,
          onProgress: p.onProgress,
        });
      },
    }),
    [
      executeListingPriceUpdate,
      executeProductCopyUpdate,
      executeBatchProductCopyUpdate,
      executeBatchListingPriceUpdate,
      executeProductStatusUpdate,
      executeBatchProductStatusUpdate,
    ]
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
      highlighted={highlightedArea === "pricing"}
    />
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
      : pageLinkableCount > 0
        ? {
            label: "一键关联",
            onClick: () => void enqueueUnboundMatch(),
            queueAction: true,
          }
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

  const rail = (
    <AssistantRail
      assistantContent={
        <ProductsAgentPanel
          context={agentPanelContext}
          pendingMinis={pendingMinis}
          unboundMinis={unboundMinis}
          batchLinkProgress={batchLinkProgress}
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
          previewGenerators={previewGenerators}
          commandExecutors={commandExecutors}
        />
      }
      strategyCards={null}
    />
  );

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} rail={rail} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("products.title")}
          breadcrumbs={[{ label: t("nav.authorize"), href: localePath(locale, "/authorize") }, { label: t("products.title") }]}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            {t("products.restoringAuth")}
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
          title={t("products.title")}
          breadcrumbs={[{ label: t("nav.authorize"), href: localePath(locale, "/authorize") }, { label: t("products.title") }]}
          {...wb.panelProps}
        >
          <EmptyState
            title={t("products.notConnectedTitle")}
            description={t("products.notConnectedDesc")}
            action={
              <Link href={localePath(locale, "/authorize")}>
                <Button size="sm" className="mt-1">
                  {t("products.goAuthorize")}
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
          title={scanDone ? t("products.scanDoneTitle") : t("products.scanningTitle")}
          breadcrumbs={breadcrumbs}
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
    { id: "shop", label: t("products.tabShop"), count: summary?.shopProducts },
    { id: "catalog", label: t("products.tabDiscover") },
  ];

  return (
    <WorkbenchShell
      sidebar={<StepSidebar />}
      rail={rail}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title="智能选品"
        breadcrumbs={breadcrumbs}
        {...wb.panelProps}
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("products.searchPlaceholder")}
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
                onPageLinkableScopeChange={setPageLinkableScope}
                onBatchLinkFinished={(progress) => {
                  void loadSummary().then(({ bindings }) => {
                    bumpMirrorRefresh();
                    if (progress.sessionOrder.length > 0) {
                      mergeProductBaseline(shopName, progress.sessionOrder);
                    }
                    if (progress.processed > 0) {
                      const result = buildNewArrivalResultFromBatch(progress, bindings);
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
                highlighted={highlightedArea === "filters"}
                pricingTemplate={template}
              />
            </div>
          ) : null}
          {tab === "catalog" ? (
            <CatalogPublishPanel
              onActivity={loadSummary}
              onBindingLinked={() => bumpMirrorRefresh()}
              onPublished={() => bumpMirrorRefresh()}
              recommendedCategories={recommendedCategories}
              filtersMountEl={filtersMountEl}
              sharedTemplate={template}
              onAppliedFilterSummaryChange={setFilterSummary}
              filterPresetRequest={filterPresetRequest}
              onFilterPresetConsumed={() => setFilterPresetRequest(null)}
            />
          ) : null}
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
