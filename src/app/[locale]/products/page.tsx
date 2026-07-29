"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { AccountManagerRailFooter } from "@/components/account-manager/account-manager-contact-cta";
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
import { useAuth } from "@/context/user-context";
import { TangbuyWaveLoader } from "@/components/brand/tangbuy-wave-loader";
import { type ShopFilter } from "@/components/select/shop-products-panel";
import {
  buildProductFocusSnapshot,
} from "@/lib/agents/products/product-focus-snapshot";
import { deriveRecommendedCategories } from "@/lib/recommended-categories";
import {
  countCatalogScopes,
  type CatalogScope,
} from "@/lib/products/catalog-scope";
import type { AiPanelContent } from "@/lib/types";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { prefetchSkuAlignListCache } from "@/lib/sku-align/prefetch-list-cache";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { useRegisterEmbeddedPageChrome } from "@/host/embedded/embedded-page-chrome-context";

const PricingTemplateDrawer = dynamic(() => import("@/components/select/pricing-template-drawer").then((m) => ({ default: m.PricingTemplateDrawer })), { ssr: false });
const ProductsAgentPanel = dynamic(() => import("@/components/select/products-agent-panel").then((m) => ({ default: m.ProductsAgentPanel })), { ssr: false });

function SelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, isAuthorized, authBootstrapping, shopAuthHydrating, showToast } =
    useOnboarding();
  const { bootstrapping: userBootstrapping } = useAuth();
  const sessionPending =
    authBootstrapping || userBootstrapping || shopAuthHydrating;
  const shopName = resolveShopApiName(shop);
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);
  const wb = useWorkbenchPage("products");
  const t = useT();
  const locale = useLocale();
  const { isEmbedded } = useEmbeddedMode();
  const { tab, setTab } = useProductsPageTab(locale);
  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("products.title") },
  ];

  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [shopFiltersMountEl, setShopFiltersMountEl] =
    useState<HTMLDivElement | null>(null);
  const [shopActionsMountEl, setShopActionsMountEl] =
    useState<HTMLDivElement | null>(null);
  const [catalogFiltersMountEl, setCatalogFiltersMountEl] =
    useState<HTMLDivElement | null>(null);
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
    pageLinkableScope,
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
    refreshMirrorFromServer,
    syncAndRefreshMirror,
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
  const [catalogScope, setCatalogScope] = useState<CatalogScope>("all");
  const [listRefreshing, setListRefreshing] = useState(false);

  const handleRefreshList = useCallback(async () => {
    if (listRefreshing || batchLinkActive) return;
    setListRefreshing(true);
    try {
      const result = await syncAndRefreshMirror();
      if (result) {
        showToast(
          t("sourcing.refreshDone", { count: result.productCount })
        );
      }
    } catch (err) {
      showToast(
        t("sourcing.refreshFailed", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    } finally {
      setListRefreshing(false);
    }
  }, [
    batchLinkActive,
    listRefreshing,
    showToast,
    syncAndRefreshMirror,
    t,
  ]);

  const scopeCounts = useMemo(
    () => countCatalogScopes(shopProducts, bindingsMap, shopName),
    [shopProducts, bindingsMap, shopName]
  );

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
    visiblePageProductIds: pageLinkableScope.visibleIds,
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

  const schedulePublishMirrorPoll = useCallback(() => {
    for (const delayMs of [4000, 10000, 20000]) {
      window.setTimeout(() => refreshMirrorFromServer(), delayMs);
    }
  }, [refreshMirrorFromServer]);

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
    pendingNewAnalysisCount: newArrivalStats.pendingNewAnalysisCount,
    pendingNewAnalysisIds: newArrivalStats.pendingNewAnalysisIds,
    catalogScope,
    setCatalogScope,
    scopeCounts,
    setShopFilter,
    hasNewProductsToLink,
    enqueueNewArrivalsBatchLink,
    batchLinkActive,
    listRefreshing,
    onRefreshList: isEmbedded ? undefined : () => void handleRefreshList(),
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

  useRegisterEmbeddedPageChrome({
    enabled: isEmbedded && isAuthorized && !sessionPending && phase === "result",
    search: {
      value: searchQuery,
      onChange: setSearchQuery,
      placeholder: t("products.searchPlaceholder"),
    },
    refresh: {
      onClick: () => void handleRefreshList(),
      busy: listRefreshing || batchLinkActive,
      title: t("sourcing.refreshTitle"),
      ariaLabel: t("sourcing.refreshAria"),
    },
    assistant: {
      open: wb.assistantOpen,
      onToggle: wb.toggleAssistant,
    },
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
          onBatchLinkDismiss={() => setBatchLinkProgress(null)}
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
      railFooter={<AccountManagerRailFooter context="products" />}
    />
  );

  if (sessionPending) {
    return (
      <WorkbenchShell sidebar={<WorkbenchSidebar />} rail={rail} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("products.title")}
          breadcrumbs={[{ label: t("nav.authorize"), href: localePath(locale, "/authorize") }, { label: t("products.title") }]}
          {...wb.panelProps}
        >
          <TangbuyWaveLoader label={t("products.restoringAuth")} />
        </WorkbenchPanel>
        {pricingDrawer}
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<WorkbenchSidebar />}
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

  const pageTabs = (
    <SegmentedTabs
      variant="solid"
      tabs={tabs}
      value={tab}
      onValueChange={(id) => setTab(id as ProductsPageTab)}
    />
  );

  const isShopTab = tab === "shop";
  const pageCtas = (
    <ProductsPageHeaderActions
      // Discover has its own SmartSourcingFilters; shop search here does nothing on catalog.
      showSearch={isShopTab && !isEmbedded}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      hasNewProductsToLink={isShopTab && hasNewProductsToLink}
      newLinkableCount={isShopTab ? newLinkableIds.length : 0}
      onEnqueueNewArrivalsBatchLink={() => void enqueueNewArrivalsBatchLink()}
      pageLinkableCount={isShopTab ? pageLinkableCount : 0}
      onEnqueueUnboundMatch={() => void enqueueUnboundMatch()}
      batchLinkActive={batchLinkActive}
      skuAlignHref={localePath(locale, "/sku-align")}
      onPrefetchSkuAlign={
        isAuthorized && shopName
          ? () => prefetchSkuAlignListCache(shopName)
          : undefined
      }
    />
  );

  /**
   * Single toolbar row for both tabs: tabs | filters … | CTAs.
   * No wrap / no second “card” row — narrow rails scroll filters horizontally.
   */
  const pageToolbar = (
    <div className="flex w-full min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:thin]">
        <div className="shrink-0">{pageTabs}</div>
        <span
          className="hidden h-4 w-px shrink-0 bg-hairline sm:block"
          aria-hidden
        />
        {isShopTab ? (
          <div ref={setShopFiltersMountEl} className="min-w-0 shrink-0" />
        ) : (
          <div ref={setCatalogFiltersMountEl} className="min-w-0 flex-1" />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isShopTab ? (
          <div
            ref={setShopActionsMountEl}
            className="flex shrink-0 items-center gap-2"
          />
        ) : null}
        {pageCtas}
      </div>
    </div>
  );

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar />}
      rail={rail}
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("products.title")}
        breadcrumbs={breadcrumbs}
        {...(isEmbedded ? {} : wb.panelProps)}
        toolbar={pageToolbar}
      >
        <div className="space-y-3">
          {tab === "shop" ? (
            <ProductsShopTab
              summary={shopTab.summary}
              panel={shopTab.panel}
              filtersMountEl={shopFiltersMountEl}
              actionsMountEl={shopActionsMountEl}
            />
          ) : null}

          {tab === "catalog" ? (
            <ProductsCatalogTab
              filtersMountEl={catalogFiltersMountEl}
              onActivity={refreshMirrorFromServer}
              onBindingLinked={refreshMirrorFromServer}
              onPublished={refreshMirrorFromServer}
              onPublishInProgress={schedulePublishMirrorPoll}
              recommendedCategories={recommendedCategories}
              sharedTemplate={template}
              onConfigurePricing={openPricingDrawer}
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
    <WorkbenchShell sidebar={<WorkbenchSidebar />}>
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
