"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Loader2, RefreshCw, ArrowRight } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { FadeSwap } from "@/components/ui/fade-swap";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { useOnboarding } from "@/context/onboarding-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useLogisticsWorkflowStep } from "@/hooks/use-logistics-workflow-step";
import { useLogisticsWorkflowNavigation } from "@/hooks/use-logistics-workflow-navigation";
import { useLogisticsMirrorLoad } from "@/hooks/use-logistics-mirror-load";
import { useLogisticsAgentCommands } from "@/hooks/use-logistics-agent-commands";
import { useLogisticsQuoteEstimate } from "@/hooks/use-logistics-quote-estimate";
import { createDefaultLogisticsTemplate } from "@/lib/logistics/default-template";
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
import { api, readableError } from "@/lib/api";
import type { LogisticsFilterMode, PostalLimitFilter } from "@/lib/logistics/display";
import {
  decisionStatusToFilterMode,
  normalizeLogisticsFilterMode,
} from "@/lib/logistics/display";
import {
  listTemplateCountryCodes,
  resolveQuoteMarketCode,
} from "@/lib/logistics/template-params";
import {
  evaluateLogisticsCompletionGate,
  deriveLogisticsStepSnapshot,
  type CompletionGateResult,
} from "@/lib/logistics/completion-gate";
import { stashLogisticsSyncExceptionCount } from "@/lib/logistics/sync-handoff";
import { deriveLogisticsWorkbenchState } from "@/lib/logistics/workbench-state";
import { countCatalogIngestingProducts } from "@/lib/tangbuy/catalog-ingest-display";
import type {
  LogisticsDecisionStatus,
  LogisticsTemplate,
  LogisticsTypeCode,
  VariantLogisticsDecision,
} from "@/lib/types";
import { LogisticsWorkflowBody } from "@/components/logistics/logistics-workflow-body";
import type { LogisticsFocusTarget, MeasureOverride } from "@/components/logistics/logistics-decision-list";

const LogisticsAgentPanel = dynamic(() => import("@/components/logistics/logistics-agent-panel").then((m) => ({ default: m.LogisticsAgentPanel })), { ssr: false });
const LogisticsTemplateDrawer = dynamic(() => import("@/components/logistics/logistics-template-drawer").then((m) => ({ default: m.LogisticsTemplateDrawer })), { ssr: false });

function LogisticsContent() {
  const router = useRouter();
  const { shop, isAuthorized, authBootstrapping, saveLogistics, showToast, skuReadyForNext, workflowSku, logisticsCompleted, publishLogisticsStepSnapshot, publishLogisticsPipelineActive } =
    useOnboarding();
  const shopName = shop.name?.trim() || shop.domain?.trim() || "";
  const scanShopKey = workflowScanShopKey(shop);
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);

  const wb = useWorkbenchPage("logistics");
  const t = useT();
  const locale = useLocale();
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

  const [saving, setSaving] = useState(false);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [showDrawer, setShowDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<LogisticsFilterMode>("all");
  const [postalLimitFilter, setPostalLimitFilter] = useState<PostalLimitFilter>("all");
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
    handleAcceptAi,
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

  const handleCorrect = async (itemId: string, type: LogisticsTypeCode) => {
    if (correctingId) return;
    setCorrectingId(itemId);
    try {
      const updated = await api.correctLogisticsType(shopName, itemId, type);
      setAnalysis((prev) => {
        if (!prev) return prev;
        const productProfiles = prev.productProfiles.map((p) =>
          p.thirdPlatformItemId === itemId ? updated : p
        );

        const totalVariants = productProfiles.reduce(
          (sum, p) => sum + p.totalVariants,
          0
        );
        const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
          pending_sku: 0,
          pending_postal_meta: 0,
          ready_for_quote: 0,
          confirmed: 0,
          restricted: 0,
          needs_review: 0,
        };
        for (const p of productProfiles) {
          for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
            decisionStatusCounts[status as LogisticsDecisionStatus] += count;
          }
        }

        const highRiskTypes = productProfiles
          .map((p) => p.dominantLogisticsType)
          .filter(
            (t, i, arr) =>
              (t === "BATTERY_MAGNETIC" || t === "FOOD" || t === "BLADE") &&
              arr.indexOf(t) === i
          );

        return {
          ...prev,
          productProfiles,
          totalVariants,
          decisionStatusCounts,
          highRiskTypes,
        };
      });
      showToast(t("logistics.toastTypeCorrected"));
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setCorrectingId(null);
    }
  };

  const handleSaveTemplate = async (
    upsertData: {
      shopName: string;
      name?: string;
      packaging: string;
      speedPreference: string;
      markets: { marketGroupId: string; countryCodes: string[] }[];
    },
    id?: string
  ) => {
    setSaving(true);
    try {
      const saved = await api.upsertLogisticsTemplate(shopName, upsertData as any, id);
      setTemplates((prev) => {
        if (id) {
          return prev.map((t) => (t.id === id ? saved : t));
        }
        return [saved, ...prev];
      });
      suppressScopeSwitchToastRef.current = true;
      setActiveTemplate(saved);
      showToast(t("logistics.toastTemplateSavedEstimate"));
      setWorkflowStep("estimate");
      setShowDrawer(false);
      return saved;
    } catch (err) {
      showToast(readableError(err));
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await api.deleteLogisticsTemplate(shopName, id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplate?.id === id) {
        const remaining = templates.filter((t) => t.id !== id);
        setActiveTemplate(
          remaining.length > 0
            ? remaining[0]
            : createDefaultLogisticsTemplate(shopName, t("logistics.defaultTemplateName"))
        );
      }
      showToast(t("logistics.toastTemplateDeleted"));
    } catch (err) {
      showToast(readableError(err));
    }
  };

  const handleSelectTemplate = (template: LogisticsTemplate) => {
    setActiveTemplate(template);
    setQuoteMarketCode(resolveQuoteMarketCode(template, null));
  };

  const handleSave = async (goSync = false, syncExceptionCount?: number) => {
    if (!activeTemplate || saving) return;
    const codes = codesFromSelections(activeTemplate.markets);
    if (codes.length === 0) {
      showToast(t("logistics.toastPickMarket"));
      return;
    }
    setSaving(true);
    try {
      saveLogistics();
      if (goSync) {
        if (syncExceptionCount && syncExceptionCount > 0) {
          stashLogisticsSyncExceptionCount(syncExceptionCount);
        }
        router.push(localePath(locale, "/sync"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndSync = () => {
    if (!hasSavedTemplate) {
      showToast(t("completionGate.blockerNoTemplate"));
      return;
    }
    if (pipeline.pipelineActive) {
      showToast(t("completionGate.blockerPipelineRunning"));
      return;
    }
    void handleSave(true, completionGate.exceptionCount);
  };


  const completionGate = useMemo(
    () =>
      evaluateLogisticsCompletionGate(
        {
          hasSavedTemplate,
          pipelineActive: pipeline.pipelineRunning,
          analysis,
          quoteResults,
          templateMarketsConfigured: Boolean(
            activeTemplate && codesFromSelections(activeTemplate.markets).length > 0
          ),
        },
        t
      ),
    [
      hasSavedTemplate,
      pipeline.pipelineRunning,
      analysis,
      quoteResults,
      activeTemplate,
      t,
    ]
  );

  const skuBindingGap = useMemo(() => {
    if (workflowSku) {
      return {
        products: workflowSku.issueProductCount,
        skus: workflowSku.needsReview + workflowSku.unbound,
      };
    }
    let products = 0;
    let skus = 0;
    for (const product of analysis?.productProfiles ?? []) {
      const pending = (product.variantDecisions ?? []).filter(
        (v) => v.decisionStatus === "pending_sku"
      );
      if (pending.length > 0) {
        products += 1;
        skus += pending.length;
      }
    }
    return { products, skus };
  }, [workflowSku, analysis]);

  useEffect(() => {
    publishLogisticsPipelineActive(pipeline.pipelineActive);
  }, [pipeline.pipelineActive, publishLogisticsPipelineActive]);

  useEffect(() => {
    if (!isAuthorized) {
      publishLogisticsStepSnapshot(null);
      return;
    }
    publishLogisticsStepSnapshot(
      deriveLogisticsStepSnapshot(
        {
          skuReady: skuReadyForNext,
          pipelineActive: pipeline.pipelineActive,
          gate: completionGate,
          logisticsCompleted,
        },
        t
      )
    );
  }, [
    isAuthorized,
    skuReadyForNext,
    pipeline.pipelineActive,
    completionGate,
    logisticsCompleted,
    publishLogisticsStepSnapshot,
    t,
  ]);


  const handleFocusStatus = (status: LogisticsDecisionStatus) => {
    setFilterMode(decisionStatusToFilterMode(status));
    setFocusTarget({ status });
  };

  const handleSetFilter = useCallback((mode: string) => {
    setFilterMode(normalizeLogisticsFilterMode(mode));
    setFocusTarget(null);
  }, []);

  const { previewGenerators: logisticsPreviewGenerators, commandExecutors: logisticsCommandExecutors } =
    useLogisticsAgentCommands({
      batchAcceptCount: workbench.batchAcceptCount,
      handleAcceptAllReady,
      batchAcceptCancelRef,
      t,
    });

  const showDecisionWorkspace =
    hasSavedTemplate && Boolean(analysis) && workflowStep !== "setup";

  const logisticsPlanStatus = useMemo(() => {
    if (!hasSavedTemplate || !analysis || workflowStep === "setup") return null;
    return {
      analysis,
      activeTemplate,
      filterMode,
      onFilterModeChange: setFilterMode,
      postalLimitFilter,
      onPostalLimitFilterChange: setPostalLimitFilter,
      quoteMarketCode,
      onOpenStrategy: () => setShowDrawer(true),
      pipelineProgress: pipeline.progress,
      quoteResults,
    };
  }, [
    hasSavedTemplate,
    analysis,
    workflowStep,
    activeTemplate,
    filterMode,
    postalLimitFilter,
    quoteMarketCode,
    pipeline.progress,
    quoteResults,
  ]);

  const logisticsDecisionWorkspace = useMemo(() => {
    if (!showDecisionWorkspace || !analysis) return null;
    return {
      analysis,
      shopName,
      filterMode,
      postalLimitFilter,
      quoteResults,
      activeTemplate,
      correctingId,
      focusTarget,
      onCorrect: (id: string, type: LogisticsTypeCode) => void handleCorrect(id, type),
      onAcceptAi: (v: VariantLogisticsDecision, pid: string) =>
        void handleAcceptAi(v, pid),
      onFetchProductQuotes: (productId: string, variants: VariantLogisticsDecision[]) =>
        handleFetchQuotesForProduct(productId, variants),
      onIngestProductSource: handleIngestProductSource,
      onCatalogIngestComplete: handleCatalogIngestComplete,
      onFetchVariantQuote: (
        variant: VariantLogisticsDecision,
        override?: MeasureOverride
      ) => handleFetchQuoteForVariant(variant, override),
      onMeasureOverride: (variantId: string, next: MeasureOverride) => {
        setMeasureOverrides((prev) => {
          const map = new Map(prev);
          map.set(variantId, next);
          return map;
        });
      },
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
    };
  }, [
    showDecisionWorkspace,
    analysis,
    shopName,
    filterMode,
    postalLimitFilter,
    quoteResults,
    activeTemplate,
    correctingId,
    focusTarget,
    handleCorrect,
    handleAcceptAi,
    handleFetchQuotesForProduct,
    handleIngestProductSource,
    handleCatalogIngestComplete,
    handleFetchQuoteForVariant,
    accepting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    pricingTemplate,
    pipeline.pipelineActive,
    pipeline.progress,
    selectedLineByVariant,
    handleSelectLine,
  ]);

  if (authBootstrapping) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("logistics.pageTitle")}
          breadcrumbs={breadcrumbs}
          titleSuffix={<img src="/brand/on-time-guarantee-tag.svg" alt="" className="h-[18px] w-auto" />}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#325BE6]" />
            {t("logistics.restoringAuth")}
          </div>
          <FadeSwap loading minHeightClass="min-h-[320px]" skeleton={<TableSkeleton rows={4} />}>
            <div />
          </FadeSwap>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<HubAwareSidebar />}
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

  return (
    <WorkbenchShell
      sidebar={<HubAwareSidebar />}
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
              onOpenTemplate={() => setShowDrawer(true)}
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
              onStartEstimate={handleStartEstimate}
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
            />
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
        actions={
          hasSavedTemplate && analysis ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {batchFailedVariantIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void handleAcceptAllReady({ onlyVariantIds: batchFailedVariantIds })
                  }
                  disabled={accepting}
                  title={t("logistics.actionRetryAccept", {
                    count: batchFailedVariantIds.length,
                  })}
                >
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {t("logistics.actionRetryAccept", {
                    count: batchFailedVariantIds.length,
                  })}
                </Button>
              ) : null}
              {(planMetrics.pendingQuoteCount > 0 || pipeline.pipelineRunning) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleStartEstimate}
                  disabled={
                    loading ||
                    pipeline.pipelineRunning ||
                    !workbench.actions.canEstimate
                  }
                  title={
                    planMetrics.pendingQuoteCount > 0
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
                    : planMetrics.pendingQuoteCount > 0
                      ? t("logistics.estimateWithCount", {
                          count: planMetrics.pendingQuoteCount,
                        })
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
              <Button
                size="sm"
                variant="secondary"
                className="h-7 w-7 px-0"
                onClick={() => {
                  clearScanned("logistics", scanShopKey);
                  clearLogisticsMirrorCache(shopName);
                  clearLogisticsSession(shopName);
                  void load(true);
                }}
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
            </div>
          ) : null
        }
      >
        <LogisticsWorkflowBody
          loading={loading}
          classifying={classifying}
          error={error}
          analysis={analysis}
          workflowStep={workflowStep}
          hasSavedTemplate={hasSavedTemplate}
          planMetrics={planMetrics}
          onWorkflowStepChange={handleWorkflowStepChange}
          onOpenTemplateDrawer={() => setShowDrawer(true)}
          onStartEstimate={() => handleWorkflowStepChange("estimate")}
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
          templates={templates}
          activeTemplate={activeTemplate}
          onSave={handleSaveTemplate}
          onDelete={handleDeleteTemplate}
          onSelect={handleSelectTemplate}
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
