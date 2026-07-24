"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Layers,
  Loader2,
  RefreshCw,
} from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import {
  AssistantRail,
  CopilotCard,
} from "@/components/workbench/assistant-rail";
import { type ScanTaskStatus } from "@/components/workbench/scan-stage";
import { SkuAlignScanView } from "@/components/sku-align/sku-align-scan-view";
import { SkuAlignResultBody } from "@/components/sku-align/sku-align-result-body";
import { useSkuAlignMirrorLoad } from "@/hooks/use-sku-align-mirror-load";
import { useSkuAlignEntry } from "@/hooks/use-sku-align-entry";
import {
  useSkuAlignAutoAlign,
  useSkuAlignPartiallyLinkedScroll,
} from "@/hooks/use-sku-align-auto-align";
import { useSkuAlignAgentCommands } from "@/hooks/use-sku-align-agent-commands";
import { markScanned } from "@/lib/scan/gate";
import { type MetricSummaryItem } from "@/components/workbench/metric-summary-cards";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  filterProducts,
  matchesSkuProductSearch,
  sortProductsForWorkbench,
  type SkuFilterMode,
} from "@/components/sku-align/sku-binding-panel";
import {
  computeSkuAlignMetrics,
  countNeedsReviewInProducts,
} from "@/lib/sku-align/display";
import { confirmPageNeedsReview } from "@/lib/sku-align/batch-confirm";
import type { SkuPageContext } from "@/lib/agents/sku-align/plan-command";
import { useOnboarding } from "@/context/onboarding-context";
import { readableError } from "@/lib/api";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
import { workflowScanShopKey } from "@/lib/scan/shop-key";
import {
  parseSkuAlignFilterParam,
  SKU_ALIGN_FILTER_PARAM,
  skuAlignHref,
  skuAlignProductWorkbenchHref,
} from "@/lib/sku-align/deep-link";
import { stashSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import type { AiPanelContent } from "@/lib/types";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

const SkuLogisticsEntryGate = dynamic(
  () =>
    import("@/components/sku-align/sku-logistics-entry-gate").then((m) => ({
      default: m.SkuLogisticsEntryGate,
    })),
  { ssr: false }
);
const SkuAgentPanel = dynamic(
  () =>
    import("@/components/sku-align/sku-agent-panel").then((m) => ({
      default: m.SkuAgentPanel,
    })),
  { ssr: false }
);

type FilterId = SkuFilterMode;

function SkuAlignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, showToast, isAuthorized, authBootstrapping } = useOnboarding();
  const shopName = resolveShopApiName(shop);
  const scanShopKey = workflowScanShopKey(shop);
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);
  const wb = useWorkbenchPage("sku-align");
  const t = useT();
  const locale = useLocale();

  const breadcrumbs = [
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("products.title"), href: localePath(locale, "/products") },
    { label: t("sku.breadcrumb") },
  ];
  const notAuthBreadcrumbs = [
    { label: t("nav.authorize"), href: localePath(locale, "/authorize") },
    { label: t("sku.breadcrumb") },
  ];

  const [filter, setFilter] = useState<FilterId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const pendingScrollRef = useRef(false);
  const [confirmingPage, setConfirmingPage] = useState(false);

  const {
    loading,
    setLoading,
    refreshing,
    error,
    products,
    setProducts,
    pricingTemplate,
    setPricingTemplate,
    load,
    hasLoadedOnceRef,
  } = useSkuAlignMirrorLoad({
    shopName,
    shopMirrorKey,
    shopDomain: shop.domain,
    t,
  });

  const {
    phase,
    scanTasks,
    scanRecent,
    scanDone,
    finishToResult,
    restartScan,
    skipNextAutoAlignRef,
    autoAlignStartedRef,
  } = useSkuAlignEntry({
    shopName,
    scanShopKey,
    isAuthorized,
    searchParams,
    router,
    load,
    setProducts,
    setPricingTemplate,
    setLoading,
    hasLoadedOnceRef,
    setFilter,
    pendingScrollRef,
  });

  useSkuAlignAutoAlign({
    phase,
    isAuthorized,
    loading,
    products,
    shopName,
    setProducts,
    hasLoadedOnceRef,
    skipNextAutoAlignRef,
    autoAlignStartedRef,
  });

  const handleFilterChange = useCallback(
    (id: FilterId) => {
      setFilter(id);
      if (id === "partially_linked") pendingScrollRef.current = true;
      router.replace(skuAlignHref(id), { scroll: false });
    },
    [router]
  );

  useEffect(() => {
    const deepFilter = parseSkuAlignFilterParam(
      searchParams.get(SKU_ALIGN_FILTER_PARAM)
    );
    if (!deepFilter || deepFilter === "all") return;
    setFilter((current) => (current === deepFilter ? current : deepFilter));
    if (deepFilter === "partially_linked") pendingScrollRef.current = true;
  }, [searchParams]);

  const metricsSnapshot = useMemo(
    () => computeSkuAlignMetrics(products),
    [products]
  );

  const filtered = useMemo(() => {
    let list = filterProducts(products, filter);
    if (searchQuery.trim()) {
      list = list.filter((p) => matchesSkuProductSearch(p, searchQuery));
    }
    return sortProductsForWorkbench(list);
  }, [products, filter, searchQuery]);

  useSkuAlignPartiallyLinkedScroll({
    phase,
    loading,
    filter,
    filtered,
    pendingScrollRef,
  });

  const needsReviewOnPage = useMemo(
    () => countNeedsReviewInProducts(filtered),
    [filtered]
  );

  const handleConfirmPageNeedsReview = useCallback(async () => {
    if (confirmingPage || needsReviewOnPage === 0) return;
    setConfirmingPage(true);
    try {
      const result = await confirmPageNeedsReview(shopName, filtered);
      const confirmed = result.confirmedCount ?? 0;
      if (confirmed <= 0) {
        showToast(t("sku.toastNoConfirmable"));
        return;
      }
      showToast(t("sku.toastAccepted", { count: confirmed }));
      await load();
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setConfirmingPage(false);
    }
  }, [
    confirmingPage,
    needsReviewOnPage,
    shopName,
    filtered,
    load,
    showToast,
    t,
  ]);

  const stats = useMemo(() => {
    const m = metricsSnapshot;
    return {
      fullyLinkedProducts: m.fullyLinkedProductCount,
      partiallyLinkedProducts: m.partiallyLinkedProductCount,
      needsReviewVariants: m.needsReview,
      unboundVariants: m.unbound,
      totalVariants: m.variantCount,
      resolvedVariants: m.activeAuto + m.manualActive,
    };
  }, [metricsSnapshot]);

  const metrics: MetricSummaryItem[] = [
    {
      label: t("sku.metricFullyLinked"),
      value: stats.fullyLinkedProducts,
      hint: t("sku.metricFullyLinkedHint"),
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "brand",
    },
    {
      label: t("sku.metricPartiallyLinked"),
      value: stats.partiallyLinkedProducts,
      hint: t("sku.metricPartiallyLinkedHint", {
        review: stats.needsReviewVariants,
        unbound: stats.unboundVariants,
      }),
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: stats.partiallyLinkedProducts > 0 ? "warning" : "neutral",
    },
    {
      label: t("sku.metricNeedsReview"),
      value: stats.needsReviewVariants,
      hint:
        stats.needsReviewVariants > 0
          ? t("sku.metricNeedsReviewHintYes")
          : t("sku.metricNeedsReviewHintNo"),
      icon: <CircleDashed className="h-4 w-4" />,
      tone: stats.needsReviewVariants > 0 ? "warning" : "neutral",
    },
    {
      label: t("sku.metricTotalVariants"),
      value: stats.totalVariants,
      hint: t("sku.metricTotalVariantsHint", {
        resolved: stats.resolvedVariants,
        total: stats.totalVariants,
      }),
      icon: <Layers className="h-4 w-4" />,
      tone: "default",
    },
  ];

  const filterTabs = [
    { id: "all", label: t("sku.filterAll"), count: products.length },
    {
      id: "fully_linked",
      label: t("sku.filterFullyLinked"),
      count: stats.fullyLinkedProducts,
    },
    {
      id: "partially_linked",
      label: t("sku.filterPartiallyLinked"),
      count: stats.partiallyLinkedProducts,
    },
  ];

  const copilot: AiPanelContent = {
    title: t("sku.assistantTitle"),
    summary:
      products.length === 0
        ? t("sku.copilotEmpty")
        : stats.partiallyLinkedProducts > 0
          ? t("sku.copilotPartial", {
              products: stats.partiallyLinkedProducts,
              review: stats.needsReviewVariants,
              unbound: stats.unboundVariants,
            })
          : t("sku.copilotAll", { products: stats.fullyLinkedProducts }),
    bullets: [
      t("sku.copilotBulletAll", { products: stats.fullyLinkedProducts }),
      t("sku.copilotBulletPartial", { products: stats.partiallyLinkedProducts }),
      t("sku.copilotBulletSearch"),
      t("sku.copilotBulletNext"),
    ],
  };

  const agentContext = useMemo<SkuPageContext>(
    () => ({
      productCatalog: products,
      currentFilter: filter,
    }),
    [products, filter]
  );

  const { previewGenerators, commandExecutors } = useSkuAlignAgentCommands({
    products,
    shopName,
    load: () => load(),
    showToast,
    t,
  });

  const scanStatusLabel = (s: ScanTaskStatus, resultText?: string | null) => {
    if (s === "running") return t("sku.scanStatusRunning");
    if (s === "done") return resultText ?? t("sku.scanStatusDone");
    if (s === "failed") return t("sku.scanStatusFailed");
    if (s === "skipped") return resultText ?? t("sku.scanStatusSkipped");
    return t("sku.scanStatusPending");
  };

  const scanCopilot: AiPanelContent = {
    title: t("sku.scanCopilotTitle"),
    summary: scanDone ? t("sku.scanCopilotDone") : t("sku.scanCopilotRunning"),
    bullets: scanTasks.map(
      (task) => `${task.label}：${scanStatusLabel(task.status, task.resultText)}`
    ),
    nextAction: {
      label: scanDone ? t("sku.scanCopilotNextDone") : t("sku.scanCopilotNextRunning"),
      action: "view",
    },
  };

  if (authBootstrapping) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title={t("sku.title")}
          breadcrumbs={notAuthBreadcrumbs}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-[#325BE6]" />
            {t("sku.restoringAuth")}
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
          <AssistantRail assistantContent={<CopilotCard content={copilot} />} />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title={t("sku.title")}
          breadcrumbs={notAuthBreadcrumbs}
          {...wb.panelProps}
        >
          <EmptyState
            title={t("sku.notConnectedTitle")}
            description={t("sku.notConnectedDesc")}
            action={
              <Link href={localePath(locale, "/authorize")}>
                <Button size="sm" className="mt-1">
                  {t("sku.goAuthorize")}
                </Button>
              </Link>
            }
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (phase === "scan") {
    return (
      <SkuAlignScanView
        breadcrumbs={breadcrumbs}
        scanCopilot={scanCopilot}
        scanTasks={scanTasks}
        scanRecent={scanRecent}
        scanDone={scanDone}
        onFinishToResult={finishToResult}
        shellProps={wb.shellProps}
        panelProps={wb.panelProps}
      />
    );
  }

  const rail = (
    <AssistantRail
      assistantContent={
        <>
          <CopilotCard content={copilot} />
          {products.length > 0 ? (
            <SkuAgentPanel
              context={agentContext}
              shopName={shopName}
              onFocusProduct={(productId) => {
                const found = products.find(
                  (p) => p.thirdPlatformItemId === productId
                );
                if (found) stashSkuProductHandoff(shopName, found);
                markScanned("sku-align", scanShopKey);
                router.push(skuAlignProductWorkbenchHref(productId));
              }}
              onSetFilter={setFilter}
              previewGenerators={previewGenerators}
              commandExecutors={commandExecutors}
            />
          ) : null}
        </>
      }
    />
  );

  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />} rail={rail} {...wb.shellProps}>
      <WorkbenchPanel
        title={t("sku.title")}
        breadcrumbs={breadcrumbs}
        {...wb.panelProps}
        actions={
          <div className="flex items-center gap-2">
            {needsReviewOnPage > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleConfirmPageNeedsReview()}
                disabled={confirmingPage || loading || refreshing}
                title={t("sku.acceptPageTitle")}
              >
                {confirmingPage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("sku.acceptPage", { count: needsReviewOnPage })}
              </Button>
            ) : null}
            <SkuLogisticsEntryGate />
            <Button
              size="sm"
              variant="secondary"
              onClick={restartScan}
              className="h-7 w-7 px-0"
              title={t("sku.rescanTitle")}
              aria-label={t("sku.rescanAria")}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      >
        <SkuAlignResultBody
          locale={locale}
          metrics={metrics}
          filterTabs={filterTabs}
          filter={filter}
          onFilterChange={handleFilterChange}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          loading={loading}
          refreshing={refreshing}
          error={error}
          products={products}
          filtered={filtered}
          shopName={shopName}
          pricingTemplate={pricingTemplate}
          onRefresh={() => void load()}
          onAligned={() => void load()}
          showToast={showToast}
        />
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function SkuAlignPage() {
  const t = useT();
  return (
    <Suspense
      fallback={
        <WorkbenchShell sidebar={<HubAwareSidebar />}>
          <WorkbenchPanel title={t("sku.title")}>
            <TableSkeleton rows={5} />
          </WorkbenchPanel>
        </WorkbenchShell>
      }
    >
      <SkuAlignContent />
    </Suspense>
  );
}
