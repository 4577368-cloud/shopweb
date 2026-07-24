"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { ProductsScanView } from "@/components/select/products-page/products-scan-view";
import { ProductsPageHeaderActions } from "@/components/select/products-page/products-page-header-actions";
import { ProductsShopTab } from "@/components/select/products-page/products-shop-tab";
import { ProductsCatalogTab } from "@/components/select/products-page/products-catalog-tab";
import { useProductsPageTab } from "@/hooks/use-products-page-tab";
import { useProductsBatchLink } from "@/hooks/use-products-batch-link";
import { useProductsNewArrivals } from "@/hooks/use-products-new-arrivals";
import { useProductsMirror } from "@/hooks/use-products-mirror";
import { useProductsEntry } from "@/hooks/use-products-entry";
import { useProductsAgentRail } from "@/hooks/use-products-agent-rail";
import { useProductsCommands } from "@/hooks/use-products-commands";
import { useProductsPricing } from "@/hooks/use-products-pricing";
import {
  useProductsAiFieldEdits,
  useProductsFocusState,
} from "@/hooks/use-products-focus";
import { useProductsShopTabProps } from "@/hooks/use-products-shop-tab-props";
import { useProductsScan } from "@/hooks/use-products-scan";
import { handleProductsBatchLinkFinish } from "@/lib/products/batch-link-finish";
import { scanBriefingLine } from "@/lib/scan/copilot-workflow";
import { selectProductsDisplayMetrics } from "@/lib/products/display-metrics";
import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
import type { ProductsPageTab } from "@/lib/products/page-constants";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { type ShopFilter } from "@/components/select/shop-products-panel";
import {
  buildProductFocusSnapshot,
} from "@/lib/agents/products/product-focus-snapshot";
import { deriveRecommendedCategories } from "@/lib/recommended-categories";
import type { AiPanelContent } from "@/lib/types";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { prefetchSkuAlignListCache } from "@/lib/sku-align/prefetch-list-cache";

const PricingTemplateDrawer = dynamic(() => import("@/components/select/pricing-template-drawer").then((m) => ({ default: m.PricingTemplateDrawer })), { ssr: false });
const ProductsAgentPanel = dynamic(() => import("@/components/select/products-agent-panel").then((m) => ({ default: m.ProductsAgentPanel })), { ssr: false });

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

  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const { newArrivalStats, refreshNewArrivalAwareness, commitAnalysisBaseline } =
    useProductsNewArrivals(shopName, shopMirrorKey);

  const previewPricingGuide = searchParams.get("previewPricingGuide") === "1";
  const resetPricingGuideRequested =
    searchParams.get("resetPricingGuide") === "1";

  const {
    template,
    setTemplate,
    openPricingDrawer,
    pricingDrawerProps,
  } = useProductsPricing({
    shopName,
    isAuthorized,
    showToast,
    t,
    router,
    resetPricingGuideRequested,
    previewPricingGuide,
  });

  const {
    filterSummary,
    setFilterSummary,
    focusProductId,
    setFocusProductId,
    scrollToProductId,
    setScrollToProductId,
    focusCandidateId,
    setFocusCandidateId,
    focusCandidates,
    setFocusCandidates,
    searchModeProductId,
    setSearchModeProductId,
    rematchUnboundSignal,
    setRematchUnboundSignal,
    filterPresetRequest,
    setFilterPresetRequest,
  } = useProductsFocusState();

  const { aiFieldEdits, setAiFieldEdits, aiFieldEditsRef } =
    useProductsAiFieldEdits();

  const [pendingMinis, setPendingMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);
  const [unboundMinis, setUnboundMinis] = useState<
    import("@/lib/agents/products/shop-minis").ShopProductMini[]
  >([]);

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

  const {
    batchLinkBusyRef,
    batchLinkProgress,
    setBatchLinkProgress,
    batchLinkRequest,
    setPageLinkableScope,
    batchLinkActive,
    pageLinkableCount,
    handleBatchLinkProgressChange,
    hasNewProductsToLink,
    newLinkableIds,
    enqueueNewArrivalsBatchLink,
    enqueueUnboundMatch,
  } = useProductsBatchLink({
    setTab,
    setShopFilter,
    showToast,
    t,
    newArrivalStats,
  });

  const {
    summary,
    shopProducts,
    setShopProducts,
    bindingsMap,
    setBindingsMap,
    loadSummary,
    syncSummaryFromShopData,
    mirrorRefreshSignal,
    bumpMirrorRefresh,
    refreshProductsQuietly,
  } = useProductsMirror({
    shopName,
    shopMirrorKey,
    shopDomain: shop.domain,
    batchLinkBusyRef,
    aiFieldEditsRef,
    refreshNewArrivalAwareness,
    setPricingTemplate: setTemplate,
    t,
  });

  const {
    phase,
    scanHandoff,
    finishToResult,
    exitScanToProducts,
    restartScan,
  } = useProductsEntry({
    shopName,
    shopMirrorKey,
    isAuthorized,
    scanDone,
    scanStats,
    loadSummary,
    commitAnalysisBaseline,
    cancelScan,
    startScan,
    resumeActiveJob,
    pollActiveMatchJobInBackground,
  });

  const recommendedCategories = useMemo(
    () => deriveRecommendedCategories(shopProducts, 3),
    [shopProducts]
  );

  const [searchQuery, setSearchQuery] = useState("");

  const { displaySummary, pendingCount, analyzed, matched, unbound } = useMemo(
    () => selectProductsDisplayMetrics(summary, shopMirrorKey),
    [summary, shopMirrorKey]
  );

  const analysisReady = phase === "result" && displaySummary != null;

  const shopCurrencyHint = shopProducts[0]?.currency ?? null;

  const focusProductSnapshot = useMemo(() => {
    if (!focusProductId) return null;
    const product = shopProducts.find(
      (p) => p.thirdPlatformItemId === focusProductId
    );
    if (!product) return null;
    return buildProductFocusSnapshot(product, bindingsMap[focusProductId], template);
  }, [focusProductId, shopProducts, bindingsMap, template]);

  const {
    agentIntentRequest,
    setAgentIntentRequest,
    highlightedArea,
    agentPanelContext,
    requestAgentIntent,
    focusProduct,
    applyAgentAction,
  } = useProductsAgentRail({
    phase,
    tab,
    shopFilter,
    isAuthorized,
    shopName,
    displaySummaryShopProducts: displaySummary?.shopProducts,
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
    shopProducts,
    bindingsMap,
    scanHandoff,
    shopCurrencyHint,
    pendingMinis,
    unboundMinis,
    setTab,
    setShopFilter,
    setFocusProductId,
    setScrollToProductId,
    setFocusCandidateId,
    setFocusCandidates,
    setSearchModeProductId,
    setRematchUnboundSignal,
    setFilterPresetRequest,
    openPricingDrawer,
    syncSummaryFromShopData,
    bumpMirrorRefresh,
    loadSummary,
    showToast,
    t,
  });

  const { clearAiFieldEdit, previewGenerators, commandExecutors } =
    useProductsCommands({
      shopName,
      template,
      aiFieldEditsRef,
      setAiFieldEdits,
      setShopProducts,
      loadSummary,
      bumpMirrorRefresh,
      showToast,
      t,
    });

  const pricingDrawer = (
    <PricingTemplateDrawer
      {...pricingDrawerProps}
      highlighted={highlightedArea === "pricing"}
    />
  );

  const onBatchLinkFinished = useCallback(
    (progress: import("@/lib/batch-link/types").BatchLinkProgress) => {
      void handleProductsBatchLinkFinish({
        shopName,
        progress,
        loadSummary,
        bumpMirrorRefresh,
        showToast,
        clearBatchLinkProgress: () => setBatchLinkProgress(null),
      });
    },
    [
      shopName,
      loadSummary,
      bumpMirrorRefresh,
      showToast,
      setBatchLinkProgress,
    ]
  );

  const shopTab = useProductsShopTabProps({
    displaySummaryReady: displaySummary != null,
    displaySummaryShopProducts: displaySummary?.shopProducts ?? 0,
    matched,
    pendingCount,
    unbound,
    pendingNewAnalysisCount: newArrivalStats.pendingNewAnalysisCount,
    pendingNewAnalysisIds: newArrivalStats.pendingNewAnalysisIds,
    recommendedCategories,
    restartScan,
    setShopFilter,
    hasNewProductsToLink,
    enqueueNewArrivalsBatchLink,
    batchLinkActive,
    refreshProductsQuietly,
    shopFilter,
    commitAnalysisBaseline,
    focusProductId,
    scrollToProductId,
    setScrollToProductId,
    searchModeProductId,
    setSearchModeProductId,
    rematchUnboundSignal,
    batchLinkRequest,
    mirrorRefreshSignal,
    handleBatchLinkProgressChange,
    setPageLinkableScope,
    onBatchLinkFinished,
    setFocusProductId,
    setBindingsMap,
    syncSummaryFromShopData,
    setFocusCandidateId,
    setFocusCandidates,
    setPendingMinis,
    setUnboundMinis,
    aiFieldEdits,
    clearAiFieldEdit,
    searchQuery,
    filtersHighlighted: highlightedArea === "filters",
    template,
  });

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
          <ProductsPageHeaderActions
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            hasNewProductsToLink={hasNewProductsToLink}
            newLinkableCount={newLinkableIds.length}
            onEnqueueNewArrivalsBatchLink={() => void enqueueNewArrivalsBatchLink()}
            pageLinkableCount={pageLinkableCount}
            onEnqueueUnboundMatch={() => void enqueueUnboundMatch()}
            batchLinkActive={batchLinkActive}
            skuAlignHref={localePath(locale, "/sku-align")}
            onPrefetchSkuAlign={
              isAuthorized && shopName
                ? () => prefetchSkuAlignListCache(shopName)
                : undefined
            }
          />
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

          {/* 2–3) Shop tab vs Discover filter mount + results */}
          {tab === "shop" ? (
            <ProductsShopTab summary={shopTab.summary} panel={shopTab.panel} />
          ) : null}

          {tab === "catalog" ? (
            <ProductsCatalogTab
              onActivity={refreshProductsQuietly}
              onBindingLinked={() => bumpMirrorRefresh()}
              onPublished={() => bumpMirrorRefresh()}
              recommendedCategories={recommendedCategories}
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
