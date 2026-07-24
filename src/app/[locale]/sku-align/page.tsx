"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import {
  AssistantRail,
  CopilotCard,
} from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { ScanStage, SCAN_STAGE_PROGRESS_ANIMATION_MS, type ScanTaskStatus } from "@/components/workbench/scan-stage";
import { useSkuAlignScan } from "@/hooks/use-sku-align-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import {
  MetricSummaryCards,
  type MetricSummaryItem,
} from "@/components/workbench/metric-summary-cards";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  confirmPageNeedsReview,
} from "@/lib/sku-align/batch-confirm";
import { unbindWithFallback } from "@/lib/sku-align-v1/compat";
import {
  autoAlignUnboundProducts,
  autoConfirmPendingVariants,
} from "@/lib/sku-align/auto-align-unresolved";
import type { SkuPageContext } from "@/lib/agents/sku-align/plan-command";
import type { SkuCommandPlan } from "@/lib/agents/sku-align/command-schema";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import {
  clearSkuAlignMirrorCache,
  getSkuAlignMirrorCache,
  setSkuAlignMirrorCache,
  isSkuAlignMirrorCacheFresh,
} from "@/lib/sku-align/sku-align-mirror-cache";
import {
  parseSkuAlignFilterParam,
  parseSkuAlignTabParam,
  scrollToFirstSkuIssueProduct,
  SKU_ALIGN_FILTER_PARAM,
  SKU_ALIGN_PRODUCT_PARAM,
  SKU_ALIGN_TAB_PARAM,
  skuAlignHref,
  skuAlignProductWorkbenchHref,
} from "@/lib/sku-align/deep-link";
import { stashSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import {
  clearSkuOverviewSession,
  peekSkuOverviewSession,
  setSkuOverviewSession,
} from "@/lib/sku-align/overview-session-cache";
import type { AiPanelContent, PricingTemplate, SkuProductOverview } from "@/lib/types";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

const SkuProductCard = dynamic(() => import("@/components/sku-align/sku-binding-panel").then((m) => ({ default: m.SkuProductCard })), { ssr: false });
const SkuLogisticsEntryGate = dynamic(() => import("@/components/sku-align/sku-logistics-entry-gate").then((m) => ({ default: m.SkuLogisticsEntryGate })), { ssr: false });
const SkuAgentPanel = dynamic(() => import("@/components/sku-align/sku-agent-panel").then((m) => ({ default: m.SkuAgentPanel })), { ssr: false });

// After scan completes, wait for the progress bar to reach 100% visually before switching views.
const SCAN_COMPLETION_DWELL_MS = 450;
const SCAN_FINISH_DELAY_MS = SCAN_STAGE_PROGRESS_ANIMATION_MS + SCAN_COMPLETION_DWELL_MS;

type FilterId = SkuFilterMode;

function SkuAlignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, showToast, isAuthorized, authBootstrapping, refreshWorkflowProgress } =
    useOnboarding();
  const shopName = shop.name;
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SkuProductOverview[]>([]);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(null);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [shopName]);
  const autoAlignStartedRef = useRef<string | null>(null);
  /** Scan already ran V1 align — skip duplicate PAGE_ENTER align on first result load. */
  const skipNextAutoAlignRef = useRef(false);
  const scanFinishScheduledRef = useRef(false);
  const scanFinishedRef = useRef(false);

  useEffect(() => {
    autoAlignStartedRef.current = null;
  }, [shopName]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const pendingScrollRef = useRef(false);
  const [confirmingPage, setConfirmingPage] = useState(false);
  // "result" is the SSR/hydration-safe default; the mount effect flips to "scan" on first visit.
  const [phase, setPhase] = useState<"scan" | "result">("result");

  const {
    tasks: scanTasks,
    recent: scanRecent,
    done: scanDone,
    start: startScan,
    cancel: cancelScan,
  } = useSkuAlignScan(shopName);

  const load = useCallback(
    async (opts?: { silent?: boolean; skipCache?: boolean }) => {
      // 命中镜像缓存且非静默主动加载 → 直接 hydrate，不 loading、不 fetch；
      // 后台静默刷新（skipCache）写回最新数据。
      if (!opts?.silent && !opts?.skipCache && isSkuAlignMirrorCacheFresh(shopName)) {
        const cached = getSkuAlignMirrorCache(shopName);
        if (cached) {
          setProducts(cached.overview);
          setPricingTemplate(cached.pricingTemplate);
          hasLoadedOnceRef.current = true;
          void load({ silent: true, skipCache: true });
          return;
        }
      }
      const silent = opts?.silent ?? hasLoadedOnceRef.current;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        void api.backfillBindingSnapshots(shopName).catch(() => null);
        const [next, tpl] = await Promise.all([
          api.getSkuOverview(shopName),
          api.getPricingTemplate(shopName).catch(() => null),
        ]);
        setProducts(next);
        setSkuOverviewSession(shopName, next);
        setPricingTemplate(tpl);
        setSkuAlignMirrorCache(shopName, {
          overview: next,
          pricingTemplate: tpl,
        });
        hasLoadedOnceRef.current = true;
      } catch (err) {
        setError(readableError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shopName]
  );

  // Move to the result view once (guarded), pulling the freshly-aligned overview. Non-blocking:
  // callable while the scan is still running ("直接查看当前结果") — cancels remaining work first.
  const finishToResult = useCallback(() => {
    if (scanFinishedRef.current) return;
    scanFinishedRef.current = true;
    cancelScan();
    markScanned("sku-align", shopName);
    skipNextAutoAlignRef.current = true;
    setPhase("result");
    const cached = peekSkuOverviewSession(shopName);
    if (cached?.length) {
      setProducts(cached);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      void load({ silent: true });
    } else {
      void load();
    }
  }, [cancelScan, shopName, load]);

  // Decide once per shop: first session visit → play the scan; otherwise straight to result.
  const startedForShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;

    const deepFilter = parseSkuAlignFilterParam(
      searchParams.get(SKU_ALIGN_FILTER_PARAM)
    );
    const deepProductId = searchParams.get(SKU_ALIGN_PRODUCT_PARAM)?.trim() || null;

    if (deepProductId) {
      markScanned("sku-align", shopName);
      router.replace(
        skuAlignProductWorkbenchHref(deepProductId, {
          tab: parseSkuAlignTabParam(searchParams.get(SKU_ALIGN_TAB_PARAM)),
        })
      );
      return;
    }

    if (deepFilter && deepFilter !== "all") {
      markScanned("sku-align", shopName);
      setPhase("result");
      setFilter(deepFilter);
      if (deepFilter === "partially_linked") pendingScrollRef.current = true;
      void load();
      return;
    }

    const cachedOverview = peekSkuOverviewSession(shopName);
    const skipScan =
      hasScanned("sku-align", shopName) || (cachedOverview?.length ?? 0) > 0;

    if (skipScan) {
      if (!hasScanned("sku-align", shopName)) {
        markScanned("sku-align", shopName);
      }
      setPhase("result");
      if (cachedOverview?.length) {
        setProducts(cachedOverview);
        setLoading(false);
        hasLoadedOnceRef.current = true;
        void load({ silent: true });
      } else {
        void load();
      }
    } else {
      scanFinishScheduledRef.current = false;
      scanFinishedRef.current = false;
      setPhase("scan");
      void startScan();
    }
  }, [isAuthorized, shopName, load, startScan, searchParams, router]);

  useEffect(() => {
    if (phase !== "scan" || !scanDone || scanFinishScheduledRef.current) return;
    scanFinishScheduledRef.current = true;
    const timer = window.setTimeout(() => {
      void finishToResult();
    }, SCAN_FINISH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, scanDone, finishToResult]);

  useEffect(() => {
    const deepFilter = parseSkuAlignFilterParam(
      searchParams.get(SKU_ALIGN_FILTER_PARAM)
    );
    if (!deepFilter || deepFilter === "all") return;
    setFilter((current) => (current === deepFilter ? current : deepFilter));
    if (deepFilter === "partially_linked") pendingScrollRef.current = true;
  }, [searchParams]);

  const handleFilterChange = useCallback(
    (id: FilterId) => {
      setFilter(id);
      if (id === "partially_linked") pendingScrollRef.current = true;
      router.replace(skuAlignHref(id), { scroll: false });
    },
    [router]
  );

  // Entering the workbench: silently align variants that still have no binding at all.
  useEffect(() => {
    if (phase !== "result" || !isAuthorized || loading) return;
    if (!hasLoadedOnceRef.current || loading) return;
    if (autoAlignStartedRef.current === shopName) return;
    if (skipNextAutoAlignRef.current) {
      skipNextAutoAlignRef.current = false;
      autoAlignStartedRef.current = shopName;
      return;
    }
    autoAlignStartedRef.current = shopName;
    if (products.length === 0) return;
    void (async () => {
      try {
        const status = await autoAlignUnboundProducts(shopName, products);
        if (
          status &&
          (status.runStatus === "SUCCEEDED" || status.runStatus === "PARTIAL")
        ) {
          const next = await api.getSkuOverview(shopName);
          setProducts(next);
          // autoAlign 完成后静默确认高置信 active_auto（后端 PENDING → ACTIVE）
          try {
            await autoConfirmPendingVariants(shopName, next);
            const confirmed = await api.getSkuOverview(shopName);
            setProducts(confirmed);
          } catch {
            // 自动确认失败不影响用户操作，仍可手动确认
          }
        }
      } catch {
        // Fail-open — user can still tap per-product align.
      }
    })();
  }, [phase, isAuthorized, loading, products, shopName]);

  const restartScan = useCallback(() => {
    autoAlignStartedRef.current = null;
    clearScanned("sku-align", shopName);
    clearSkuAlignMirrorCache(shopName);
    clearSkuOverviewSession(shopName);
    scanFinishScheduledRef.current = false;
    scanFinishedRef.current = false;
    setPhase("scan");
    void startScan();
  }, [shopName, startScan]);

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

  useEffect(() => {
    if (!pendingScrollRef.current) return;
    if (phase !== "result" || loading) return;
    if (filter !== "partially_linked") return;
    if (filtered.length === 0) {
      pendingScrollRef.current = false;
      return;
    }
    pendingScrollRef.current = false;
    scrollToFirstSkuIssueProduct();
  }, [phase, loading, filter, filtered]);

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
  ]);

  const stats = useMemo(() => {
    const m = metricsSnapshot;
    return {
      issueProducts: m.issueProductCount,
      doneProducts: m.doneProductCount,
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
      hint: stats.needsReviewVariants > 0 ? t("sku.metricNeedsReviewHintYes") : t("sku.metricNeedsReviewHintNo"),
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
    { id: "fully_linked", label: t("sku.filterFullyLinked"), count: stats.fullyLinkedProducts },
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

  const agentContext = useMemo<SkuPageContext>(() => ({
    productCatalog: products,
    currentFilter: filter,
  }), [products, filter]);

  const previewGenerators = useMemo(
    () => ({
      batch_confirm_pending: async (plan: SkuCommandPlan, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error(t("sku.confirmNoProducts"));
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          const product = products.find((p) => p.thirdPlatformItemId === productId);
          if (product) {
            const needsReview = product.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
            sampleRows.push({
              label: product.title ?? t("sku.confirmUnknownProduct"),
              before: t("sku.confirmBefore", { count: needsReview }),
              after: t("sku.confirmAfter"),
            });
          }
        }

        const extraNote =
          sampleCount < totalCount
            ? t("sku.confirmPreviewNote", { count: sampleCount, rest: totalCount - sampleCount })
            : t("sku.confirmPreviewAll", { count: totalCount });

        return {
          sections: [
            {
              title: t("sku.confirmTitle", { count: totalCount }),
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: t("sku.confirmScope", { count: totalCount }),
            durationHint: t("sku.confirmDuration", { seconds: Math.max(3, totalCount * 2) }),
            reversible: true,
          },
          payload: {
            productIds,
            totalCount,
          },
        };
      },
      unbind: async (plan: SkuCommandPlan, shopName: string) => {
        const productId = plan.draft.productId;
        const product = products.find((p) => p.thirdPlatformItemId === productId);
        if (!product) throw new Error(t("sku.confirmNoProducts"));
        const variants = product.variants ?? [];
        let variant: { id: string; label: string } | null = null;
        const idx = plan.draft.params.variantIndex;
        if (idx != null && idx >= 1 && idx <= variants.length) {
          const v = variants[idx - 1];
          variant = { id: v.thirdPlatformSkuId, label: v.optionLabel };
        } else {
          const spec = plan.draft.params.variantSpec?.trim();
          if (spec) {
            const matches = variants.filter((v) =>
              v.optionLabel?.toLowerCase().includes(spec.toLowerCase())
            );
            if (matches.length === 1) {
              variant = { id: matches[0].thirdPlatformSkuId, label: matches[0].optionLabel };
            }
          }
        }
        if (!variant) throw new Error(t("agentSku.clarifyVariantNeeded"));
        return {
          sections: [
            {
              title: t("agentSku.opUnbind"),
              rows: [
                {
                  label: product.title ?? t("sku.confirmUnknownProduct"),
                  before: variant.label,
                  after: t("sku.confirmAfter"),
                },
              ],
            },
          ],
          impact: {
            scope: t("agentSku.detailUnbind", {
              variantLabel: variant.label,
              title: product.title ?? "",
            }),
            durationHint: t("sku.confirmDuration", { seconds: 3 }),
            reversible: true,
          },
          payload: { productId, variantId: variant.id, variantLabel: variant.label },
        };
      },
    }),
    [products, t]
  );

  const commandExecutors = useMemo(
    () => ({
      batch_confirm_pending: async (payload: Record<string, unknown>) => {
        const p = payload as {
          productIds: string[];
          totalCount: number;
          onProgress?: (current: number, total: number, success: number, failed: number) => void;
        };
        const total = p.productIds.length;
        let success = 0;
        let failed = 0;

        for (let i = 0; i < total; i++) {
          const productId = p.productIds[i];
          try {
            const product = products.find((p) => p.thirdPlatformItemId === productId);
            if (product) {
              const filtered = [product];
              const result = await confirmPageNeedsReview(shopName, filtered);
              if (result.confirmedCount && result.confirmedCount > 0) {
                success++;
              } else {
                failed++;
              }
            }
          } catch {
            failed++;
          }
          p.onProgress?.(i + 1, total, success, failed);
        }

        await load();
        showToast(t("sku.confirmDone", { success, failed }));
      },
      unbind: async (payload: Record<string, unknown>) => {
        const p = payload as { productId: string; variantId: string; variantLabel?: string };
        await unbindWithFallback(shopName, p.variantId, p.productId);
        await load();
        showToast(t("sku.unbindDone", { variant: p.variantLabel ?? "" }));
      },
    }),
    [products, shopName, load, showToast]
  );

  const rail = (
    <AssistantRail
      assistantContent={
        <>
          <CopilotCard content={copilot} />
          {phase === "result" && products.length > 0 ? (
            <SkuAgentPanel
              context={agentContext}
              shopName={shopName}
              onFocusProduct={(productId) => {
                const found = products.find(
                  (p) => p.thirdPlatformItemId === productId
                );
                if (found) stashSkuProductHandoff(shopName, found);
                markScanned("sku-align", shopName);
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
    bullets: scanTasks.map((task) => `${task.label}：${scanStatusLabel(task.status, task.resultText)}`),
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
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
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
          <AssistantRail
            assistantContent={<CopilotCard content={copilot} />}
          />
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
      <WorkbenchShell
        sidebar={<HubAwareSidebar />}
        rail={
          <AssistantRail
            assistantContent={
              <>
                <CopilotCard
                  content={scanCopilot}
                  onNextAction={(a) => {
                    if (a === "view") void finishToResult();
                  }}
                />
                <InfoCard title={t("sku.scanInfoTitle")}>
                  <ul className="space-y-1.5">
                    <li>{t("sku.scanInfo1")}</li>
                    <li>{t("sku.scanInfo2")}</li>
                    <li>{t("sku.scanInfo3")}</li>
                  </ul>
                </InfoCard>
              </>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title={t("sku.title")}
          breadcrumbs={breadcrumbs}
          {...wb.panelProps}
        >
          <ScanStage
            heading={t("sku.scanStageHeading")}
            description={t("sku.scanStageDesc")}
            tasks={scanTasks}
            recent={scanRecent}
            done={scanDone}
            onViewResult={() => void finishToResult()}
            className="pt-14 sm:pt-20"
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

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
        <div className="space-y-4">
          <MetricSummaryCards items={metrics} />

          <div className="flex flex-wrap items-center gap-3">
            <SegmentedTabs
              variant="chip"
              tabs={filterTabs}
              value={filter}
              onValueChange={(id) => handleFilterChange(id as FilterId)}
            />
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:w-56 sm:flex-none">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("sku.searchPlaceholder")}
                  className="h-8 w-full rounded-[var(--radius-control)] border border-hairline bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    aria-label={t("sku.clearSearchAria")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 w-7 shrink-0 px-0"
                onClick={() => void load()}
                disabled={loading || refreshing}
                title={t("sku.refreshListAria")}
                aria-label={t("sku.refreshListAria")}
              >
                {loading || refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <Card className="border-red-200">
              <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
                <span>
                  {t("sku.loadFailed", { error })}
                  {error.includes("502") ? (
                    <span className="mt-1 block text-xs text-red-600/90">
                      {t("sku.loadFailedHint")}
                    </span>
                  ) : null}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  {t("sku.retry")}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <FadeSwap
            loading={loading}
            minHeightClass="min-h-[420px]"
            skeleton={
              <Card>
                <TableSkeleton rows={5} />
              </Card>
            }
          >
            {error ? null : products.length === 0 ? (
              <EmptyState
                title={t("sku.emptyBoundTitle")}
                description={t("sku.emptyBoundDesc")}
                action={
                  <Link href={localePath(locale, "/products")}>
                    <Button size="sm" className="mt-1">
                      {t("sku.goSourcing")}
                    </Button>
                  </Link>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={searchQuery.trim() ? t("sku.emptySearchTitle") : t("sku.emptyFilterTitle")}
                description={
                  searchQuery.trim()
                    ? t("sku.emptySearchDesc")
                    : filter === "fully_linked"
                      ? t("sku.emptyAllLinkedDesc")
                      : filter === "partially_linked"
                        ? t("sku.emptyPartialDesc")
                        : t("sku.emptyDefaultDesc")
                }
              />
            ) : (
              <div className="space-y-2.5">
                {filtered.map((p) => (
                  <SkuProductCard
                    key={p.thirdPlatformItemId}
                    product={p}
                    shopName={shopName}
                    onAligned={load}
                    showToast={showToast}
                    filterMode={filter}
                    pricingTemplate={pricingTemplate}
                  />
                ))}
              </div>
            )}
          </FadeSwap>
        </div>
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
