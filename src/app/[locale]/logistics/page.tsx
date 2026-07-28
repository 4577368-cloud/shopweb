"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Loader2, RefreshCw, ArrowRight, Package } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { AccountManagerRailFooter } from "@/components/account-manager/account-manager-contact-cta";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { FadeSwap } from "@/components/ui/fade-swap";
import { useOnboarding } from "@/context/onboarding-context";
import { useAuth } from "@/context/user-context";
import { TangbuyWaveLoader } from "@/components/brand/tangbuy-wave-loader";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useLogisticsWorkflowStep } from "@/hooks/use-logistics-workflow-step";
import { useLogisticsWorkflowNavigation } from "@/hooks/use-logistics-workflow-navigation";
import { useLogisticsMirrorLoad } from "@/hooks/use-logistics-mirror-load";
import { useLogisticsAgentCommands } from "@/hooks/use-logistics-agent-commands";
import { useLogisticsQuoteEstimate } from "@/hooks/use-logistics-quote-estimate";
import { useLogisticsPageActions } from "@/hooks/use-logistics-page-actions";
import { useLogisticsDecisionWorkspaceProps } from "@/hooks/use-logistics-decision-workspace-props";
import { hasSavedLogisticsTemplate } from "@/lib/logistics/incremental-pipeline";
import {
  clearLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import {
  clearLogisticsSession,
} from "@/lib/logistics/logistics-session-cache";
import { clearScanned } from "@/lib/scan/gate";
import { workflowScanShopKey } from "@/lib/scan/shop-key";
import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
import type { LogisticsFilterMode, PostalLimitFilter } from "@/lib/logistics/display";
import {
  decisionStatusToFilterMode,
  normalizeLogisticsFilterMode,
} from "@/lib/logistics/display";
import { deriveLogisticsWorkbenchState } from "@/lib/logistics/workbench-state";
import { countCatalogIngestingProducts } from "@/lib/tangbuy/catalog-ingest-display";
import { collectProfilesNeedingCatalogIngest } from "@/lib/logistics/batch-product-source-ingest";
import type {
  LogisticsDecisionStatus,
  VariantLogisticsDecision,
} from "@/lib/types";
import { LogisticsWorkflowBody } from "@/components/logistics/logistics-workflow-body";
import { LogisticsFilterBar } from "@/components/logistics/logistics-filter-bar";
import type { LogisticsFocusTarget, MeasureOverride } from "@/components/logistics/logistics-decision-list";
import { useEmbeddedMode } from "@/host/embedded/use-embedded-mode";
import { useRegisterEmbeddedPageChrome } from "@/host/embedded/embedded-page-chrome-context";

const LogisticsAgentPanel = dynamic(() => import("@/components/logistics/logistics-agent-panel").then((m) => ({ default: m.LogisticsAgentPanel })), { ssr: false });
const LogisticsTemplateDrawer = dynamic(() => import("@/components/logistics/logistics-template-drawer").then((m) => ({ default: m.LogisticsTemplateDrawer })), { ssr: false });
const LogisticsStrategyRailCard = dynamic(
  () =>
    import("@/components/logistics/logistics-strategy-rail-card").then((m) => ({
      default: m.LogisticsStrategyRailCard,
    })),
  { ssr: false }
);

function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, authBootstrapping, shopAuthHydrating, saveLogistics, showToast, skuReadyForNext, workflowSku, logisticsCompleted, publishLogisticsStepSnapshot, publishLogisticsPipelineActive } =
    useOnboarding();
  const { bootstrapping: userBootstrapping } = useAuth();
  const sessionPending =
    authBootstrapping || userBootstrapping || shopAuthHydrating;
  const shopName = shop.name?.trim() || shop.domain?.trim() || "";
  const scanShopKey = workflowScanShopKey(shop);
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);

  const wb = useWorkbenchPage("logistics");
  const t = useT();
  const locale = useLocale();
  const { isEmbedded } = useEmbeddedMode();
  const { workflowStep, setWorkflowStep } = useLogisticsWorkflowStep(locale);

  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("sku.breadcrumb"), href: localePath(locale, "/sku-align") },
    { label: t("nav.logistics") },
  ];

  const {
    analysis,
    setAnalysis,
    templates,
    setTemplates,
    activeTemplate,
    setActiveTemplate,
    pricingTemplate,
    loading,
    classifying,
    error,
    load,
  } = useLogisticsMirrorLoad({
    shopName,
    shopDomain: shop.domain,
    shopMirrorKey,
    scanShopKey,
    isAuthorized,
    t,
  });

  const [showDrawer, setShowDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<LogisticsFilterMode>("all");
  const [postalLimitFilter, setPostalLimitFilter] = useState<PostalLimitFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<LogisticsFocusTarget | null>(
    null
  );
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const batchAcceptCancelRef = useRef(false);

  const {
    quoteResults,
    quoting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    accepting,
    batchFailedVariantIds,
    quoteMarketCode,
    setQuoteMarketCode,
    measureOverrides,
    setMeasureOverrides,
    selectedLineByVariant,
    handleSelectLine,
    pipeline,
    suppressScopeSwitchToastRef,
    handleFetchQuotes,
    handleFetchQuoteForVariant,
    handleFetchQuotesForProduct,
    handleIngestProductSource,
    handleCatalogIngestComplete,
    handleBatchPreIngest,
    batchPreIngesting,
    handleAcceptAi,
    handleReselectVariant,
    reopeningVariantId,
    handleAcceptAllReady,
    handleStartEstimate,
    handleRetryPipeline,
  } = useLogisticsQuoteEstimate({
    shopName,
    analysis,
    setAnalysis,
    activeTemplate,
    pricingTemplate,
    templates,
    showToast,
    t,
    setFilterMode,
    setWorkflowStep,
  });

  const workbench = useMemo(
    () => deriveLogisticsWorkbenchState(analysis, quoteResults),
    [analysis, quoteResults]
  );
  const planMetrics = workbench.metrics;
  const hasSavedTemplate = hasSavedLogisticsTemplate(templates);

  const openTemplateDrawer = useCallback(() => setShowDrawer(true), []);

  const startEstimateGuarded = useCallback(() => {
    if (!hasSavedTemplate) {
      showToast(t("logistics.templateRequiredDesc"));
      setShowDrawer(true);
      return;
    }
    handleStartEstimate();
  }, [hasSavedTemplate, handleStartEstimate, showToast, t]);

  const {
    saving,
    correctingId,
    completionGate,
    skuBindingGap,
    handleCorrect,
    handleSaveTemplate,
    handleSave,
    handleSaveAndSync,
  } = useLogisticsPageActions({
    shopName,
    locale,
    router,
    localePath,
    analysis,
    setAnalysis,
    setTemplates,
    activeTemplate,
    setActiveTemplate,
    quoteResults,
    hasSavedTemplate,
    pipelineRunning: pipeline.pipelineRunning,
    pipelineActive: pipeline.pipelineActive,
    suppressScopeSwitchToastRef,
    setQuoteMarketCode,
    setWorkflowStep,
    setShowDrawer,
    saveLogistics,
    showToast,
    t,
    isAuthorized,
    skuReadyForNext,
    logisticsCompleted,
    workflowSku,
    publishLogisticsPipelineActive,
    publishLogisticsStepSnapshot,
  });

  const {
    logisticsListRef,
    scrollToLogisticsList,
    handleWorkflowStepChange,
    handleViewPendingConfirm,
    handleViewExceptions,
  } = useLogisticsWorkflowNavigation({
    workflowStep,
    setWorkflowStep,
    hasSavedTemplate,
    planMetrics,
    setFilterMode,
    onClearFocusTarget: () => setFocusTarget(null),
  });

  const catalogIngestingCount = useMemo(() => {
    if (!analysis || !shopName) return 0;
    const variantsByProduct = new Map<string, VariantLogisticsDecision[]>();
    for (const profile of analysis.productProfiles ?? []) {
      variantsByProduct.set(
        profile.thirdPlatformItemId,
        profile.variantDecisions ?? []
      );
    }
    return countCatalogIngestingProducts({
      shopName,
      productIds: (analysis.productProfiles ?? []).map(
        (profile) => profile.thirdPlatformItemId
      ),
      variantsByProduct,
      quoteResults,
    });
  }, [analysis, shopName, quoteResults]);

  const needsPreIngestCount = useMemo(() => {
    if (!shopName || !analysis) return 0;
    return collectProfilesNeedingCatalogIngest({
      shopName,
      analysis,
      quoteResults,
    }).length;
  }, [shopName, analysis, quoteResults]);

  const handleFocusStatus = (status: LogisticsDecisionStatus) => {
    setFilterMode(decisionStatusToFilterMode(status));
    setFocusTarget({ status });
  };

  const handleSetFilter = useCallback((mode: string) => {
    setFilterMode(normalizeLogisticsFilterMode(mode));
    setFocusTarget(null);
  }, []);

  const railFocusProduct = useMemo(() => {
    const id = focusTarget?.productId?.trim();
    if (!id || !analysis) {
      return { id: null as string | null, title: null as string | null };
    }
    const profile = analysis.productProfiles.find(
      (p) => p.thirdPlatformItemId === id
    );
    return { id, title: profile?.title?.trim() ?? null };
  }, [focusTarget?.productId, analysis]);

  const handleRailFocusProduct = useCallback(
    (productId: string) => {
      setFocusTarget({ productId });
      scrollToLogisticsList();
    },
    [scrollToLogisticsList]
  );

  const { previewGenerators: logisticsPreviewGenerators, commandExecutors: logisticsCommandExecutors } =
    useLogisticsAgentCommands({
      batchAcceptCount: workbench.batchAcceptCount,
      handleAcceptAllReady,
      batchAcceptCancelRef,
      t,
    });

  const showDecisionWorkspace = Boolean(analysis);

  const logisticsPlanStatus = useMemo(() => {
    if (!analysis) return null;
    return {
      analysis,
      activeTemplate: hasSavedTemplate ? activeTemplate : null,
      quoteMarketCode,
      onOpenStrategy: () => setShowDrawer(true),
      pipelineProgress: pipeline.progress,
      quoteResults,
    };
  }, [
    analysis,
    hasSavedTemplate,
    activeTemplate,
    quoteMarketCode,
    pipeline.progress,
    quoteResults,
  ]);

  const onMeasureOverride = useCallback(
    (variantId: string, next: MeasureOverride) => {
      setMeasureOverrides((prev) => {
        const map = new Map(prev);
        map.set(variantId, next);
        return map;
      });
    },
    [setMeasureOverrides]
  );

  const logisticsDecisionWorkspace = useLogisticsDecisionWorkspaceProps({
    enabled: showDecisionWorkspace,
    analysis,
    shopName,
    filterMode,
    postalLimitFilter,
    searchQuery,
    quoteResults,
    activeTemplate,
    correctingId,
    focusTarget,
    onCorrect: handleCorrect,
    onAcceptAi: (v, pid) => void handleAcceptAi(v, pid),
    onFetchProductQuotes: handleFetchQuotesForProduct,
    onIngestProductSource: handleIngestProductSource,
    onCatalogIngestComplete: handleCatalogIngestComplete,
    onFetchVariantQuote: handleFetchQuoteForVariant,
    onReselectVariant: (v) => void handleReselectVariant(v),
    reopeningVariantId,
    onMeasureOverride,
    accepting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    onClearFocus: () => setFocusTarget(null),
    pricing: pricingTemplate,
    pipelineActive: pipeline.pipelineActive,
    pipelineProgress: pipeline.progress,
    selectedLineByVariant,
    onSelectLine: handleSelectLine,
  });

  const handleRefreshWorkflow = useCallback(() => {
    clearScanned("logistics", scanShopKey);
    clearLogisticsMirrorCache(shopName);
    clearLogisticsSession(shopName);
    void load(true).then((stats) => {
      if (!stats) return;
      if (stats.mailLimitVariants > 0) {
        showToast(
          t("logistics.toastMailLimitUpdated", {
            mail: stats.mailLimitVariants,
            changed: stats.changedVariants,
            total: stats.totalVariants,
          })
        );
        return;
      }
      if (stats.reason === "listing_empty") {
        showToast(
          t("logistics.toastMailLimitListingEmpty", {
            listingTotal: stats.listingTotal,
            total: stats.totalVariants,
          })
        );
        return;
      }
      if (stats.reason === "listing_error") {
        showToast(
          t("logistics.toastMailLimitListingError", {
            error: stats.detail || "unknown",
          })
        );
        return;
      }
      if (stats.reason === "no_match") {
        showToast(
          t("logistics.toastMailLimitNoMatch", {
            mapped: stats.mappedProducts,
            total: stats.totalVariants,
          })
        );
        return;
      }
      showToast(
        t("logistics.toastMailLimitNoData", {
          total: stats.totalVariants,
        })
      );
    });
  }, [scanShopKey, shopName, load, showToast, t]);

  useRegisterEmbeddedPageChrome({
    enabled: isEmbedded && isAuthorized && !sessionPending,
    search: {
      value: searchQuery,
      onChange: setSearchQuery,
      placeholder: t("products.searchPlaceholder"),
    },
    refresh: {
      onClick: handleRefreshWorkflow,
      busy: loading || classifying,
      title: t("logistics.refreshWorkflowTitle"),
      ariaLabel: t("logistics.refreshWorkflowAria"),
    },
    assistant: {
      open: wb.assistantOpen,
      onToggle: wb.toggleAssistant,
    },
  });

  if (sessionPending) {
    return (
      <WorkbenchShell sidebar={<WorkbenchSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("logistics.pageTitle")}
          breadcrumbs={breadcrumbs}
          titleSuffix={<img src="/brand/on-time-guarantee-tag.svg" alt="" className="h-[18px] w-auto" />}
          {...wb.panelProps}
        >
          <TangbuyWaveLoader label={t("logistics.restoringAuth")} />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<WorkbenchSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs text-ink-subtle">
                {t("logistics.authNeeded")}
              </div>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title={t("logistics.pageTitle")}
          breadcrumbs={breadcrumbs}
          titleSuffix={<img src="/brand/on-time-guarantee-tag.svg" alt="" className="h-[18px] w-auto" />}
          {...wb.panelProps}
        >
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-sm text-ink-muted">
            {t("logistics.authNeeded")}
            <Link
              href={localePath(locale, "/authorize")}
              className="ml-2 text-link hover:text-link-hover hover:underline"
            >
              {t("logistics.goAuthorize")}
            </Link>
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  const logisticsActions = analysis ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {needsPreIngestCount > 0 || batchPreIngesting ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 w-7 px-0"
          onClick={() => void handleBatchPreIngest()}
          disabled={batchPreIngesting || pipeline.pipelineRunning}
          title={t("logistics.batchPreIngestTitle", {
            count: needsPreIngestCount,
          })}
          aria-label={t("logistics.batchPreIngestTitle", {
            count: needsPreIngestCount,
          })}
        >
          {batchPreIngesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Package className="h-3.5 w-3.5" />
          )}
        </Button>
      ) : null}
      {batchFailedVariantIds.length > 0 ? (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          onClick={() =>
            void handleAcceptAllReady({ onlyVariantIds: batchFailedVariantIds })
          }
          disabled={accepting}
          title={t("logistics.actionRetryAccept", {
            count: batchFailedVariantIds.length,
          })}
          aria-label={t("logistics.actionRetryAccept", {
            count: batchFailedVariantIds.length,
          })}
        >
          {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("logistics.actionRetryAcceptShort")}
        </Button>
      ) : null}
      {planMetrics.pendingQuoteCount > 0 || pipeline.pipelineRunning ? (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          onClick={startEstimateGuarded}
          disabled={
            loading ||
            pipeline.pipelineRunning ||
            !hasSavedTemplate ||
            !workbench.actions.canEstimate
          }
          title={
            !hasSavedTemplate
              ? t("logistics.templateRequiredDesc")
              : planMetrics.pendingQuoteCount > 0
                ? t("logistics.estimateTitle", {
                    count: planMetrics.pendingQuoteCount,
                  })
                : t("logistics.estimatePipelineHint")
          }
        >
          {pipeline.pipelineRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {pipeline.pipelineRunning
            ? t("logistics.estimating")
            : t("logistics.actionEstimate")}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="primary"
        onClick={() => void handleSaveAndSync()}
        disabled={
          saving ||
          pipeline.pipelineRunning ||
          !completionGate.canProceedToSync
        }
        title={completionGate.footerHint}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("logisticsUi.goSync")}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
      {!isEmbedded ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 w-7 px-0"
          onClick={handleRefreshWorkflow}
          disabled={loading || classifying}
          title={t("logistics.refreshWorkflowTitle")}
          aria-label={t("logistics.refreshWorkflowAria")}
        >
          {classifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      ) : null}
    </div>
  ) : null;

  const logisticsToolbar =
    !loading || analysis ? (
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        <LogisticsFilterBar
          analysis={analysis}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          postalLimitFilter={postalLimitFilter}
          onPostalLimitFilterChange={setPostalLimitFilter}
          quoteResults={quoteResults}
          className="min-w-0 flex flex-wrap items-center gap-2"
        />
        {!isEmbedded ? (
          <div className="relative min-w-[10rem] max-w-[16rem] flex-1 sm:w-52 sm:flex-none">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("products.searchPlaceholder")}
              className="h-7 w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
            />
          </div>
        ) : null}
        {logisticsActions ? (
          <div className="ml-auto shrink-0">{logisticsActions}</div>
        ) : null}
      </div>
    ) : null;

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <LogisticsAgentPanel
              analysis={analysis}
              activeTemplate={activeTemplate}
              decisionStatusCounts={analysis?.decisionStatusCounts}
              skuReadyForNext={skuReadyForNext}
              quoting={quoting || pipeline.pipelineActive}
              accepting={accepting}
              onFocusStatus={handleFocusStatus}
              onAcceptAllReady={() => void handleAcceptAllReady()}
              onFetchQuotes={() => void handleFetchQuotes()}
              onOpenTemplate={openTemplateDrawer}
              pipelineProgress={pipeline.progress}
              pipelineActive={pipeline.pipelineActive}
              pendingReviewCount={planMetrics.pendingQuoteCount}
              onRetryPipeline={handleRetryPipeline}
              onCancelPipeline={pipeline.cancelPipeline}
              previewGenerators={logisticsPreviewGenerators}
              commandExecutors={logisticsCommandExecutors}
              planMetrics={planMetrics}
              completionGate={completionGate}
              pipelineRunning={pipeline.pipelineRunning}
              saving={saving}
              skuBindingGap={skuBindingGap}
              onStartEstimate={startEstimateGuarded}
              onSaveAndSync={handleSaveAndSync}
              onViewUnidentified={() => {
                setFilterMode("needs_attention");
                scrollToLogisticsList();
              }}
              onViewPendingConfirm={handleViewPendingConfirm}
              onViewExceptions={handleViewExceptions}
              onSetFilter={handleSetFilter}
              onCancelBatchAccept={() => {
                batchAcceptCancelRef.current = true;
              }}
              catalogIngestingCount={catalogIngestingCount}
              currentFilter={filterMode}
              focusProductTitle={railFocusProduct.title}
              focusProductId={railFocusProduct.id}
              quoteResults={quoteResults}
              onFocusProduct={handleRailFocusProduct}
            />
          }
          strategyCards={
            <LogisticsStrategyRailCard
              hasSavedTemplate={hasSavedTemplate}
              activeTemplate={activeTemplate}
              analysisReady={Boolean(analysis)}
              onConfigure={openTemplateDrawer}
            />
          }
          railFooter={<AccountManagerRailFooter context="logistics" />}
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("logistics.pageTitle")}
        breadcrumbs={breadcrumbs}
        titleSuffix={<img src="/brand/on-time-guarantee-tag.svg" alt="" className="h-[18px] w-auto" />}
        {...(isEmbedded ? {} : wb.panelProps)}
        toolbar={logisticsToolbar}
      >
        <LogisticsWorkflowBody
          loading={loading}
          classifying={classifying}
          error={error}
          analysis={analysis}
          hasSavedTemplate={hasSavedTemplate}
          onOpenTemplateDrawer={openTemplateDrawer}
          planStatus={logisticsPlanStatus}
          showSyncConfirm={showSyncConfirm}
          completionGate={completionGate}
          saving={saving}
          onSyncConfirm={() => {
            setShowSyncConfirm(false);
            void handleSave(true, completionGate.exceptionCount);
          }}
          onSyncCancel={() => setShowSyncConfirm(false)}
          onRetryLoad={() => void load(false)}
          workflowSkuProductCount={workflowSku?.productCount}
          showDecisionWorkspace={showDecisionWorkspace}
          decisionWorkspace={logisticsDecisionWorkspace}
          listRef={logisticsListRef}
          skuUnlinkedCount={planMetrics.skuUnlinkedCount}
          pipelineRunning={pipeline.pipelineRunning}
          pipelineProgress={pipeline.progress}
        />
      </WorkbenchPanel>

      {showDrawer ? (
        <LogisticsTemplateDrawer
          shopName={shopName}
          activeTemplate={activeTemplate}
          onSave={handleSaveTemplate}
          onClose={() => setShowDrawer(false)}
        />
      ) : null}
    </WorkbenchShell>
  );
}

export default function LogisticsPage() {
  return (
    <Suspense fallback={null}>
      <LogisticsContent />
    </Suspense>
  );
}
