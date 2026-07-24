"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowRight, Loader2, Search, X } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { ProductsScanView } from "@/components/select/products-page/products-scan-view";
import { useProductsPageTab } from "@/hooks/use-products-page-tab";
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
  applyBatchAckToBindings,
  batchAckPendingBindings,
  listPendingAckProductIds,
} from "@/lib/batch-link/batch-ack-pending";
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
import { clearMirrorCache, isMirrorCacheFresh, peekMirrorCache, productsMirrorShopKey, setMirrorCache } from "@/lib/products/mirror-cache";
import {
  productsEntryShouldSkipCeremony,
  SCAN_FINISH_DELAY_MS,
  type ProductsPageTab,
  type ProductsSummary,
} from "@/lib/products/page-constants";
import { assembleLaunchSummaryFastFromMirror } from "@/lib/sync/assemble-launch-summary";
import { setLaunchSummaryCacheIfNotFull } from "@/lib/sync/launch-summary-cache";
import { warmLaunchSummaryPartial } from "@/lib/sync/warm-launch-summary-partial";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import { formatBatchLinkSummary } from "@/lib/batch-link/types";
import type { BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import { buildNewArrivalResultFromBatch } from "@/lib/batch-link/build-new-arrival-result";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import { mergeListingPriceRow, writeShopListingPrice } from "@/lib/shop-product-write";
import {
  formatStatusTransition,
  listingStatusLabel,
  normalizeShopStatus,
  writeShopProductStatus,
  type ShopifyListingStatusTarget,
} from "@/lib/shop-product-status";
import {
  ShopProductsPanel,
  type ShopFilter,
  type AgentIntentRequest,
} from "@/components/select/shop-products-panel";
import { buildProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildProductFocusSnapshot,
  type CandidateSummary,
} from "@/lib/agents/products/product-focus-snapshot";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { AgentResponse } from "@/lib/agents/types";
import {
  deriveRecommendedCategories,
  localizeRecommendedCategoryName,
} from "@/lib/recommended-categories";
import type {
  AiPanelContent,
  ImageBindingView,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import type { ScanHandoffPayload } from "@/lib/scan/handoff";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { publishSourcingHit } from "@/lib/sourcing/publish-sourcing-hit";
import {
  getSourcingSession,
  resolveHitByListIndex,
} from "@/lib/sourcing/session";
import { markCatalogPublished } from "@/lib/batch-link/publish-source";
import { queuePublishReveal } from "@/lib/batch-link/publish-reveal";
import { prefetchSkuAlignListCache } from "@/lib/sku-align/prefetch-list-cache";

const SmartSourcingSummaryBar = dynamic(() => import("@/components/select/smart-sourcing-summary-bar").then((m) => ({ default: m.SmartSourcingSummaryBar })), { ssr: false });
const PricingTemplateDrawer = dynamic(() => import("@/components/select/pricing-template-drawer").then((m) => ({ default: m.PricingTemplateDrawer })), { ssr: false });
const ProductsAgentPanel = dynamic(() => import("@/components/select/products-agent-panel").then((m) => ({ default: m.ProductsAgentPanel })), { ssr: false });
const CatalogPublishPanel = dynamic(() => import("@/components/select/catalog-publish-panel").then((m) => ({ default: m.CatalogPublishPanel })), { ssr: false });

function resolveTitleCopyStyle(
  copyAction: "translate" | "rewrite" | "optimize",
  copyStyle?: "amazon" | "literal"
): "amazon" | "literal" {
  if (copyStyle === "amazon" || copyStyle === "literal") return copyStyle;
  return copyAction === "translate" ? "amazon" : "literal";
}

function SelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, isAuthorized, authBootstrapping, showToast } =
    useOnboarding();
  const shopName = resolveShopApiName(shop);
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);
  const wb = useWorkbenchPage("products");
  const t = useT();
  const locale = useLocale();
  const { tab, setTab } = useProductsPageTab(locale);
  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("products.title") },
  ];

  const copyActionLabel = useCallback(
    (action: "translate" | "rewrite" | "optimize", targetLang?: string) => {
      if (action === "translate") {
        return t("productsPage.copyTranslate", {
          lang: targetLang?.toUpperCase() ?? "EN",
        });
      }
      if (action === "rewrite") return t("productsPage.copyRewrite");
      return t("productsPage.copyOptimize");
    },
    [t]
  );

  const previewFieldLabel = useCallback(
    (copyField: "title" | "description" | "all") => {
      if (copyField === "title") return t("productsPreview.fieldTitle");
      if (copyField === "description") return t("productsPreview.fieldDescription");
      return t("productsPreview.fieldAll");
    },
    [t]
  );

  const previewModeNote = useCallback(
    (style: "literal" | "amazon", short = false) =>
      style === "literal"
        ? short
          ? t("productsPreview.modeLiteralShort")
          : t("productsPreview.modeLiteral")
        : t("productsPreview.modeAmazon"),
    [t]
  );

  const previewDurationHint = useCallback(
    (estimatedSeconds: number) =>
      estimatedSeconds < 60
        ? t("productsPreview.durationSeconds", { seconds: estimatedSeconds })
        : t("productsPreview.durationMinutes", {
            minutes: Math.ceil(estimatedSeconds / 60),
          }),
    [t]
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
  const batchLinkBusyRef = useRef(false);
  const [pendingMinis, setPendingMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);
  const [unboundMinis, setUnboundMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);
  const [filterPresetRequest, setFilterPresetRequest] = useState<{
    categoryName?: string;
    keywords?: string;
    sourceFilter?: "all" | "tangbuy" | "1688";
    priceMaxUsd?: number;
  } | null>(null);

  const {
    tasks: scanTasks,
    stats: scanStats,
    progressPercent: scanProgressPercent,
    done: scanDone,
    start: startScan,
    resumeActiveJob,
    pollActiveMatchJobInBackground,
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
      if (!hasScanned("products", shopMirrorKey)) {
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

  const loadSummary = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const silent = opts?.silent ?? false;
      const force = opts?.force ?? false;

      if (silent && !force && batchLinkBusyRef.current) {
        const cached = peekMirrorCache(shopMirrorKey);
        if (cached) {
          return { products: cached.items, bindings: cached.bindings };
        }
      }

      if (!silent) {
        const cached = peekMirrorCache(shopMirrorKey);
        if (cached) {
          const merged = applyTitleEditsToProducts(
            applyListingEditsToProducts(cached.items, aiFieldEditsRef.current),
            aiFieldEditsRef.current
          );
          const stats = computeShopProductBindingStats(cached.items, cached.bindings);
          setBindingsMap(cached.bindings);
          setShopProducts(merged);
          setSummary({
            shopProducts: stats.analyzed,
            confirmedProducts: stats.confirmed,
            pendingProducts: stats.pending,
          });
          refreshNewArrivalAwareness(merged, cached.bindings);
          void loadSummary({ silent: true });
          return { products: merged, bindings: cached.bindings };
        }
      }

      if (silent && !force && isMirrorCacheFresh(shopMirrorKey)) {
        try {
          const bindings = await api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]);
          const map = indexImageBindings(bindings);
          const cached = peekMirrorCache(shopMirrorKey);
          const products = cached?.items ?? [];
          const merged = applyTitleEditsToProducts(
            applyListingEditsToProducts(products, aiFieldEditsRef.current),
            aiFieldEditsRef.current
          );
          const stats = computeShopProductBindingStats(products, map);
          setBindingsMap(map);
          setShopProducts(merged);
          setSummary({
            shopProducts: stats.analyzed,
            confirmedProducts: stats.confirmed,
            pendingProducts: stats.pending,
          });
          setMirrorCache(shopMirrorKey, { items: products, bindings: map });
          refreshNewArrivalAwareness(merged, map);
          return { products: merged, bindings: map };
        } catch {
          return null;
        }
      }

      if (!batchLinkBusyRef.current) {
        void api.backfillPublishedBindings(shopName).catch(() => null);
      }
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
      setMirrorCache(shopMirrorKey, { items: products, bindings: map });
      refreshNewArrivalAwareness(merged, map);
      const partial = assembleLaunchSummaryFastFromMirror(
        shopMirrorKey,
        shopName,
        shop.domain,
        t
      );
      if (partial) setLaunchSummaryCacheIfNotFull(shopMirrorKey, partial);
      warmLaunchSummaryPartial(shopMirrorKey, shopName, shop.domain, t, {
        shopProducts: products,
        bindings: map,
        pricingTemplate: tpl ?? undefined,
      });
      return { products: merged, bindings: map };
    },
    [shopName, shopMirrorKey, shop.domain, refreshNewArrivalAwareness, t]
  );

  const finishedRef = useRef(false);
  const scanFinishScheduledRef = useRef(false);
  const finishToResult = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelScan();
    markScanned("products", shopMirrorKey);
    markScanHandoff(shopName, scanStats);
    const result = await loadSummary();
    if (result?.products) commitAnalysisBaseline(result.products);
    setPhase("result");
  }, [cancelScan, shopName, shopMirrorKey, loadSummary, scanStats, commitAnalysisBaseline]);

  const exitScanToProducts = useCallback(() => {
    cancelScan();
    markScanned("products", shopMirrorKey);
    finishedRef.current = true;
    scanFinishScheduledRef.current = true;
    setPhase("result");
    void loadSummary();
    void pollActiveMatchJobInBackground();
  }, [
    cancelScan,
    shopMirrorKey,
    loadSummary,
    pollActiveMatchJobInBackground,
  ]);

  const startedForShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;
    finishedRef.current = false;
    scanFinishScheduledRef.current = false;
    void (async () => {
      if (productsEntryShouldSkipCeremony(shopMirrorKey, shopName)) {
        markScanned("products", shopMirrorKey);
        setPhase("result");
        void loadSummary();
        void pollActiveMatchJobInBackground();
        return;
      }
      const resumed = await resumeActiveJob();
      if (resumed) {
        setPhase("scan");
        return;
      }
      setPhase("scan");
      await startScan();
    })();
  }, [
    isAuthorized,
    shopName,
    shopMirrorKey,
    loadSummary,
    startScan,
    resumeActiveJob,
    pollActiveMatchJobInBackground,
  ]);

  useEffect(() => {
    if (phase !== "scan" || !scanDone || scanFinishScheduledRef.current) return;
    scanFinishScheduledRef.current = true;
    const timer = window.setTimeout(() => {
      void finishToResult();
    }, SCAN_FINISH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, scanDone, finishToResult]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    setScanHandoff(consumeScanHandoff(shopName));
  }, [phase, isAuthorized, shopName]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSummary({ silent: true });
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

  useEffect(() => {
    batchLinkBusyRef.current = batchLinkActive;
  }, [batchLinkActive]);

  const handleBatchLinkProgressChange = useCallback((progress: BatchLinkProgress) => {
    batchLinkBusyRef.current = progress.active;
    setBatchLinkProgress(progress);
  }, []);

  const refreshProductsQuietly = useCallback(() => {
    if (batchLinkBusyRef.current) return;
    void loadSummary({ silent: true });
  }, [loadSummary]);

  const enqueueBatchLink = useCallback(
    (source: BatchLinkRequest["source"]) => {
      if (batchLinkActive) return;
      if (pageLinkableScope.ids.length === 0) {
        showToast(t("productsPage.toastNoLinkable"));
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
      t,
    ]
  );

  const newLinkableIds = useMemo(
    () =>
      pageLinkableScope.ids.filter((id) =>
        newArrivalStats.pendingNewAnalysisIds.has(id)
      ),
    [pageLinkableScope.ids, newArrivalStats.pendingNewAnalysisIds]
  );
  const hasNewProductsToLink = newLinkableIds.length > 0;

  const enqueueNewArrivalsBatchLink = useCallback(() => {
    if (batchLinkActive) return;
    if (newLinkableIds.length === 0) {
      showToast(t("productsPage.toastNoNewToLink"));
      return;
    }
    setTab("shop");
    setShopFilter("all");
    fireBatchLink("manual", newLinkableIds);
  }, [
    batchLinkActive,
    fireBatchLink,
    newLinkableIds,
    setTab,
    showToast,
    t,
  ]);

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    scanFinishScheduledRef.current = false;
    clearScanned("products", shopMirrorKey);
    clearMirrorCache(shopMirrorKey);
    setPhase("scan");
    void startScan();
  }, [shopName, startScan]);

  const mirrorSnapshot = useMemo(
    () => peekMirrorCache(shopMirrorKey),
    [shopMirrorKey]
  );

  const displaySummary = useMemo((): ProductsSummary | null => {
    if (summary) return summary;
    if (!mirrorSnapshot) return null;
    const stats = computeShopProductBindingStats(
      mirrorSnapshot.items,
      mirrorSnapshot.bindings
    );
    return {
      shopProducts: stats.analyzed,
      confirmedProducts: stats.confirmed,
      pendingProducts: stats.pending,
    };
  }, [summary, mirrorSnapshot]);

  const pendingCount = displaySummary?.pendingProducts ?? 0;
  const analyzed = displaySummary?.shopProducts ?? 0;
  const matched =
    displaySummary != null
      ? displaySummary.confirmedProducts + displaySummary.pendingProducts
      : 0;
  const unbound = displaySummary != null ? Math.max(analyzed - matched, 0) : 0;

  const analysisReady = phase === "result" && displaySummary != null;
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
      showToast(t("productsPage.toastPricingAuth"));
      return;
    }
    setTemplateError(null);
    setPricingOpen(true);
  }, [isAuthorized, showToast, t]);

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
        analyzedCount: displaySummary?.shopProducts ?? 0,
        matchedCount: matched,
        pendingCount,
        unboundCount: unbound,
        analysisReady,
        recommendedCategoryNames: recommendedCategories.map((c) =>
          localizeRecommendedCategoryName(t, c.id, c.name)
        ),
        filterSummary,
        template,
        focusProductId,
        focusCandidateId,
        focusProduct: focusProductSnapshot,
        focusCandidates,
        productCatalog,
        scanHandoff,
        shopCurrencyHint,
        t,
      }),
    [
      phase,
      tab,
      shopFilter,
      isAuthorized,
      shopName,
      displaySummary?.shopProducts,
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
      t,
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
      if (action.kind === "batch_ack_pending") {
        if (action.tab) setTab(action.tab);
        if (action.shopFilter) {
          setShopFilter(action.shopFilter);
          highlight("filters");
        }
        void (async () => {
          const ids = listPendingAckProductIds(shopProducts, bindingsMap);
          if (ids.length === 0) {
            showToast(t("shopProducts.toastNoPending"));
            return;
          }
          try {
            const result = await batchAckPendingBindings(shopName, ids);
            const nextBindings = applyBatchAckToBindings(
              bindingsMap,
              ids,
              result.failed
            );
            syncSummaryFromShopData(shopProducts, nextBindings);
            bumpMirrorRefresh();
            await loadSummary();
            showToast(
              result.failed.length > 0
                ? t("shopProducts.toastBatchAckPartial", {
                    ok: result.ok,
                    failed: result.failed.length,
                  })
                : t("shopProducts.toastBatchAckDone", { ok: result.ok })
            );
          } catch (err) {
            showToast(readableError(err));
          }
        })();
        return;
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
          sourceFilter: action.filterPreset?.sourceFilter,
          priceMaxUsd: action.filterPreset?.priceMaxUsd,
        });
      }
    },
    [openPricingDrawer, setTab, focusProduct, pendingMinis, unboundMinis, shopProducts, bindingsMap, shopName, syncSummaryFromShopData, bumpMirrorRefresh, loadSummary, showToast, t, highlight]
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
        t("productsPage.toastTitleUpdated", {
          title: detail.title ?? t("productsPage.productFallback"),
          currency,
          price: req.price.toFixed(2),
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t]
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
            throw new Error(t("productsPreview.errTitleGenFailed"));
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
          const actionLabel = copyActionLabel(req.copyAction, req.targetLang);
          showToast(
            t("productsPage.toastTitleCopyUpdated", { action: actionLabel })
          );
        } catch (err) {
          showToast(readableError(err) || t("productsPage.toastTitleCopyFailed"));
          throw err;
        }
      }
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t, copyActionLabel]
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
            if (result.success && result.unchanged) {
              success++;
              onProgress?.(i + 1, total, success, failed);
              continue;
            }
            if (result.success && result.translatedText) {
              newText = result.translatedText;
            } else {
              throw new Error(result.error ?? t("productsPreview.errTitleLocalizeFailed"));
            }
          } else {
            throw new Error(t("productsPreview.errCopyNotImplemented"));
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

      const actionLabel = copyActionLabel(copyAction, targetLang);
      showToast(
        t("productsPage.toastBatchCopyDone", {
          action: actionLabel,
          success,
          failed,
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t, copyActionLabel]
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
            throw new Error(t("productsPreview.errCannotCalcPrice"));
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

      const modeLabel = batchPriceFixed
        ? t("productsPage.priceModeFixed", { price: batchPriceFixed })
        : t("productsPage.priceModeMultiplier", {
            multiplier: batchPriceMultiplier ?? 1,
          });
      showToast(
        t("productsPage.toastBatchPriceDone", {
          mode: modeLabel,
          success,
          failed,
        })
      );
    },
    [bumpMirrorRefresh, loadSummary, shopName, showToast, t]
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
        t("productsPage.toastListingUpdated", {
          title: detail.title ?? req.productTitle,
          status: listingStatusLabel(t, req.targetStatus),
        })
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast, t]
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
        t("productsPage.toastBatchListingDone", {
          status: listingStatusLabel(t, targetStatus),
          success,
          failed,
        })
      );
    },
    [applyLocalProductStatus, bumpMirrorRefresh, loadSummary, shopName, showToast, t]
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
            throw new Error(result.error ?? t("productsPreview.errTitleGenFailed"));
          }
          translatedText = result.translatedText;
        } else {
          throw new Error(t("productsPreview.errCopyNotImplemented"));
        }

        const fieldLabel = previewFieldLabel(copyField);
        const modeNote = previewModeNote(style);

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
          extraNote: `${modeNote}${copyField === "all" ? ` · ${t("productsPreview.updateTitleAndDesc")}` : ""}`.trim(),
          impact: {
            scope: t("productsPreview.scopeOneProduct", { field: fieldLabel }),
            durationHint: t("productsPreview.durationTwoSec"),
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
          throw new Error(t("productsPreview.errNoProducts"));
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
                translatedText = result.error ?? t("productsPreview.genFailed");
              }
            } else {
              translatedText = t("productsPreview.opNotImplemented");
            }

            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: originalTitle,
              after: translatedText,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: t("productsPreview.readFailed"),
            });
          }
        }

        const fieldLabel = previewFieldLabel(copyField);
        const actionLabel =
          copyAction === "translate"
            ? t("productsPreview.localizeTo", { lang: targetLang.toUpperCase() })
            : copyActionLabel(copyAction, targetLang);
        const modeNote = previewModeNote(style, true);

        const extraNote =
          (sampleCount < totalCount
            ? t("productsPreview.previewPartial", {
                sample: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("productsPreview.previewAll", { count: totalCount })) +
          ` · ${modeNote}`;

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint = previewDurationHint(estimatedSeconds);

        return {
          sections: [
            {
              title: t("productsPreview.batchCopyTitle", {
                action: actionLabel,
                count: totalCount,
              }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("productsPreview.scopeBatchCopy", {
              count: totalCount,
              field: fieldLabel,
            }),
            durationHint,
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchCopy") : undefined,
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
          throw new Error(t("productsPreview.errNoProducts"));
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            const title = detail.title ?? t("productsPreview.unknownProduct");
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
              before:
                currentPrice > 0
                  ? `${currentPrice.toFixed(2)}`
                  : t("productsPreview.noPrice"),
              after:
                newPrice > 0
                  ? `${newPrice.toFixed(2)}`
                  : t("productsPreview.cannotCalc"),
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: t("productsPreview.readFailed"),
            });
          }
        }

        const modeLabel = fixedPrice
          ? t("productsPreview.priceModeFixed", { price: fixedPrice })
          : t("productsPreview.priceModeMultiplier", { multiplier });

        const extraNote =
          sampleCount < totalCount
            ? t("productsPreview.previewPartial", {
                sample: sampleCount,
                rest: totalCount - sampleCount,
              })
            : t("productsPreview.previewAll", { count: totalCount });

        const estimatedSeconds = Math.max(3, totalCount * 2);
        const durationHint = previewDurationHint(estimatedSeconds);

        return {
          sections: [
            {
              title: t("productsPreview.batchPriceTitle", {
                mode: modeLabel,
                count: totalCount,
              }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("productsPreview.scopeBatchPrice", { count: totalCount }),
            durationHint,
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchPrice") : undefined,
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
        const title =
          detail.title ?? plan.targetLabel ?? t("productsPreview.productFallback");
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
          extraNote: formatStatusTransition(detail.status, targetStatus, t),
          impact: {
            scope: t("productsPreview.scopeOneStatus"),
            durationHint: t("productsPreview.durationTwoSec"),
            reversible: true,
            riskNote: t("productsPreview.riskDraft"),
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
        const title =
          detail.title ?? plan.targetLabel ?? t("productsPreview.productFallback");
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
          extraNote: formatStatusTransition(detail.status, targetStatus, t),
          impact: {
            scope: t("productsPreview.scopeOneStatus"),
            durationHint: t("productsPreview.durationTwoSec"),
            reversible: true,
            riskNote: t("productsPreview.riskArchive"),
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
        if (totalCount === 0) throw new Error(t("productsPreview.errNoProducts"));

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label:
                detail.title ?? t("productsPreview.productN", { n: i + 1 }),
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: t("productsPreview.batchDraftTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? t("productsPreview.previewPartialDraft", {
                  sample: sampleCount,
                  rest: totalCount - sampleCount,
                })
              : t("productsPreview.previewAllDraft", { count: totalCount }),
          impact: {
            scope: t("productsPreview.scopeBatchStatus", { count: totalCount }),
            durationHint: previewDurationHint(Math.max(3, totalCount * 2)),
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchArchive") : undefined,
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
        if (totalCount === 0) throw new Error(t("productsPreview.errNoProducts"));

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: Array<{ label: string; before: string; after: string }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          try {
            const detail = await api.getShopProductDetail(shopName, productId);
            sampleRows.push({
              label:
                detail.title ?? t("productsPreview.productN", { n: i + 1 }),
              before: normalizeShopStatus(detail.status),
              after: targetStatus,
            });
          } catch {
            sampleRows.push({
              label: t("productsPreview.productN", { n: i + 1 }),
              before: t("productsPreview.readFailed"),
              after: targetStatus,
            });
          }
        }

        return {
          sections: [
            {
              title: t("productsPreview.batchArchiveTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote:
            sampleCount < totalCount
              ? t("productsPreview.previewPartialArchive", {
                  sample: sampleCount,
                  rest: totalCount - sampleCount,
                })
              : t("productsPreview.previewAllArchive", { count: totalCount }),
          impact: {
            scope: t("productsPreview.scopeBatchStatus", { count: totalCount }),
            durationHint: previewDurationHint(Math.max(3, totalCount * 2)),
            reversible: true,
            riskNote:
              totalCount > 10 ? t("productsPreview.riskBatchArchive") : undefined,
          },
          payload: {
            productIds,
            targetStatus,
            totalCount,
          },
        };
      },
      publish_sourcing_item: async (plan: any) => {
        const hitId = plan.draft.params.sourcingItemHint as string | undefined;
        const index = plan.draft.params.sourcingListIndex as number | undefined;
        const session = getSourcingSession(shopName);
        const hit =
          (hitId ? session?.hits.find((h) => h.hitId === hitId) : null) ??
          (index != null ? resolveHitByListIndex(shopName, index) : null);
        if (!hit) throw new Error(t("agentProducts.clarifySourcingPublishTarget"));

        const currency =
          (plan.draft.params.sourcingCurrency as string | undefined) ?? "USD";
        const procurement = plan.draft.params.sourcingProcurementUsd as
          | number
          | null
          | undefined;
        const display = plan.draft.params.sourcingDisplayUsd as
          | number
          | null
          | undefined;

        const fmt = (n: number | null | undefined) =>
          n != null ? `${currency} ${n.toFixed(2)}` : "—";

        return {
          sections: [
            {
              title: hit.title,
              rows: [
                {
                  label: t("agentProducts.detailSourcingSource", {
                    source: hit.source,
                  }),
                  before: "",
                  after: hit.source === "1688" ? "1688" : "Tangbuy",
                },
                {
                  label: t("catalogCard.purchaseCost", {
                    price: fmt(procurement),
                  }),
                  before: "",
                  after: fmt(procurement),
                },
                {
                  label: t("catalogCard.suggestedPrice", {
                    price: fmt(display),
                  }),
                  before: "",
                  after: `${fmt(display)} (${hit.displayMultiplier}×)`,
                },
              ],
            },
          ],
          impact: {
            scope: t("agentProducts.opPublishSourcing"),
            durationHint: hit.source === "1688" ? "30–90s" : "10–30s",
            reversible: false,
            riskNote:
              hit.source === "1688"
                ? t("agentProducts.detailPoolWillIngest")
                : undefined,
          },
          payload: { hitId: hit.hitId },
        };
      },
    }),
    [t, copyActionLabel, previewFieldLabel, previewModeNote, previewDurationHint, shopName]
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
      publish_sourcing_item: async (payload: Record<string, unknown>) => {
        const p = payload as { hitId: string };
        const session = getSourcingSession(shopName);
        const hit = session?.hits.find((h) => h.hitId === p.hitId);
        if (!hit) {
          throw new Error(t("agentProducts.clarifySourcingPublishTarget"));
        }
        const tpl = template ?? (await api.getPricingTemplate(shopName));
        const outcome = await publishSourcingHit({
          hit,
          shopName,
          template: tpl,
        });
        if (!outcome.ok || !outcome.result) {
          throw new Error(outcome.error ?? t("catalogPublish.publishFailed"));
        }
        if (
          outcome.result.publishStatus === "PUBLISHED" &&
          outcome.result.shopifyProductId?.trim() &&
          outcome.catalogItem
        ) {
          const productId = outcome.result.shopifyProductId.trim();
          markCatalogPublished(shopName, productId);
          queuePublishReveal(shopName, productId, outcome.catalogItem);
        }
      },
    }),
    [
      executeListingPriceUpdate,
      executeProductCopyUpdate,
      executeBatchProductCopyUpdate,
      executeBatchListingPriceUpdate,
      executeProductStatusUpdate,
      executeBatchProductStatusUpdate,
      shopName,
      template,
      t,
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
        showToast(t("productsPage.toastPricingDemoReset"));
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
    t,
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
        showToast(t("productsPage.toastPricingSaved"));
        if (previewPricingGuide) {
          startTransition(() => {
            router.replace("/products", { scroll: false });
          });
        }
      } catch (err) {
        setTemplateError(readableError(err));
        showToast(t("productsPage.toastPricingSaveFailed"));
      } finally {
        setSavingTemplate(false);
      }
    },
    [shopName, showToast, previewPricingGuide, router, t]
  );

  const handleClearTemplate = useCallback(async () => {
    if (clearingTemplate) return;
    if (!window.confirm(t("productsPage.clearTemplateConfirm"))) {
      return;
    }
    setClearingTemplate(true);
    setTemplateError(null);
    try {
      const tpl = await api.clearPricingTemplate(shopName);
      setTemplate(tpl);
      setPricingOpen(false);
      showToast(t("productsPage.toastPricingDefaultReset"));
    } catch (err) {
      setTemplateError(readableError(err));
      showToast(readableError(err));
    } finally {
      setClearingTemplate(false);
    }
  }, [clearingTemplate, shopName, showToast, t]);

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

  const scanCopilot: AiPanelContent = {
    title: scanDone ? t("productsPage.scanDoneTitle") : t("productsPage.scanRunningTitle"),
    summary: scanDone
      ? scanBriefingLine(scanStats)
      : t("productsPage.scanRunningSummary"),
    bullets: [],
    nextAction: scanDone
      ? { label: t("productsPage.scanViewResults"), action: "view" }
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

  if (authBootstrapping) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} rail={rail} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("products.title")}
          breadcrumbs={[{ label: t("nav.authorize"), href: localePath(locale, "/authorize") }, { label: t("products.title") }]}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#325BE6]" />
            {t("products.restoringAuth")}
          </div>
          <FadeSwap loading minHeightClass="min-h-[320px]" skeleton={<TableSkeleton rows={4} />}>
            <div />
          </FadeSwap>
        </WorkbenchPanel>
        {pricingDrawer}
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<HubAwareSidebar />}
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
      <ProductsScanView
        breadcrumbs={breadcrumbs}
        scanCopilot={scanCopilot}
        scanDone={scanDone}
        scanTasks={scanTasks}
        scanStats={scanStats}
        scanProgressPercent={scanProgressPercent}
        onFinishToResult={finishToResult}
        onExitScan={exitScanToProducts}
        shellProps={wb.shellProps}
        panelProps={wb.panelProps}
        pricingDrawer={pricingDrawer}
      />
    );
  }

  const tabs = [
    { id: "shop", label: t("products.tabShop"), count: displaySummary?.shopProducts },
    { id: "catalog", label: t("products.tabDiscover") },
  ];

  return (
    <WorkbenchShell
      sidebar={<HubAwareSidebar />}
      rail={rail}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("products.title")}
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
            {hasNewProductsToLink ? (
              <Button
                size="sm"
                onClick={() => void enqueueNewArrivalsBatchLink()}
                disabled={batchLinkActive}
              >
                {batchLinkActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {batchLinkActive
                  ? t("productsPage.batchLinkRunning")
                  : t("productsPage.batchLinkNewArrivals", {
                      count: newLinkableIds.length,
                    })}
              </Button>
            ) : pageLinkableCount > 0 ? (
              <Button
                size="sm"
                onClick={() => void enqueueUnboundMatch()}
                disabled={batchLinkActive}
              >
                {batchLinkActive ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {batchLinkActive
                  ? t("productsPage.batchLinkRunning")
                  : t("productsPage.batchLink")}
              </Button>
            ) : null}
            <Link
              href={localePath(locale, "/sku-align")}
              onMouseEnter={() => {
                if (isAuthorized && shopName) prefetchSkuAlignListCache(shopName);
              }}
              onFocus={() => {
                if (isAuthorized && shopName) prefetchSkuAlignListCache(shopName);
              }}
            >
              <Button
                size="sm"
                variant={
                  hasNewProductsToLink || pageLinkableCount > 0
                    ? "secondary"
                    : "primary"
                }
              >
                {t("productsPage.skuBindingCta")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      >
        <div className="space-y-3">
          {/* 1) Tabs — above all tab-specific context */}
          <SegmentedTabs
            variant="solid"
            tabs={tabs}
            value={tab}
            onValueChange={(id) => setTab(id as ProductsPageTab)}
          />

          {/* 2) Tab context: Shopify summary vs Discover filters */}
          <div className="min-h-0">
            {tab === "shop" ? (
              <SmartSourcingSummaryBar
                ready={displaySummary != null}
                analyzed={displaySummary?.shopProducts ?? 0}
                matched={matched}
                pending={pendingCount}
                unbound={unbound}
                pendingNewAnalysis={newArrivalStats.pendingNewAnalysisCount}
                recommendedCategories={recommendedCategories}
                onRefresh={restartScan}
                onViewNewArrivals={() => setShopFilter("new_arrivals")}
                onBatchLinkNewArrivals={
                  hasNewProductsToLink
                    ? () => void enqueueNewArrivalsBatchLink()
                    : undefined
                }
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
                onActivity={refreshProductsQuietly}
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
                onBatchLinkProgressChange={handleBatchLinkProgressChange}
                onPageLinkableScopeChange={setPageLinkableScope}
                onBatchLinkFinished={(progress) => {
                  void loadSummary({ force: true }).then((data) => {
                    if (!data) return;
                    const { bindings } = data;
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
              onActivity={refreshProductsQuietly}
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

function ProductsPageFallback() {
  const t = useT();
  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />}>
      <WorkbenchPanel title={t("products.title")}>{null}</WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={<ProductsPageFallback />}
    >
      <SelectContent />
    </Suspense>
  );
}
