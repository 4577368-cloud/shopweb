"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import {
  AssistantRail,
  CopilotCard,
} from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { ScanStage, type ScanTaskStatus } from "@/components/workbench/scan-stage";
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
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  SkuProductCard,
  filterProducts,
  matchesSkuProductSearch,
  sortProductsForWorkbench,
  type SkuFilterMode,
} from "@/components/sku-align/sku-binding-panel";
import { SkuLogisticsEntryGate } from "@/components/sku-align/sku-logistics-entry-gate";
import { SkuAgentPanel } from "@/components/sku-align/sku-agent-panel";
import {
  computeSkuAlignMetrics,
  countNeedsReviewInProducts,
} from "@/lib/sku-align/display";
import {
  confirmPageNeedsReview,
} from "@/lib/sku-align/batch-confirm";
import {
  autoAlignUnboundProducts,
  autoConfirmPendingVariants,
} from "@/lib/sku-align/auto-align-unresolved";
import type { SkuPageContext } from "@/lib/agents/sku-align/plan-command";
import type { SkuCommandPlan } from "@/lib/agents/sku-align/command-schema";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import {
  parseSkuAlignFilterParam,
  scrollToFirstSkuIssueProduct,
  SKU_ALIGN_FILTER_PARAM,
  skuAlignHref,
} from "@/lib/sku-align/deep-link";
import type { AiPanelContent, PricingTemplate, SkuProductOverview } from "@/lib/types";

const BREADCRUMBS = [
  { label: "工作台", href: "/" },
  { label: "智能选品", href: "/products" },
  { label: "SKU 绑定" },
];

// Hold the completed progress bar briefly so users can see the finished state before the result view.
const SCAN_DWELL_MS = 900;

const matchRules = [
  "商品标题与关键词",
  "规格（颜色 / 尺寸 / 材质等）",
  "图片相似度",
  "类目与属性",
];

type FilterId = SkuFilterMode;

function SkuAlignContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, showToast, isAuthorized, authSessionReady, refreshWorkflowProgress } =
    useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("sku-align");

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

  useEffect(() => {
    autoAlignStartedRef.current = null;
  }, [shopName]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const pendingScrollRef = useRef(false);
  const [confirmingPage, setConfirmingPage] = useState(false);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  // "result" is the SSR/hydration-safe default; the mount effect flips to "scan" on first visit.
  const [phase, setPhase] = useState<"scan" | "result">("result");

  const {
    tasks: scanTasks,
    recent: scanRecent,
    done: scanDone,
    start: startScan,
    cancel: cancelScan,
  } = useSkuAlignScan(shopName);

  const load = useCallback(async () => {
    const silent = hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      // Snapshot repair can take minutes — never block overview refresh on it.
      void api.backfillBindingSnapshots(shopName).catch(() => null);
      const [next, tpl] = await Promise.all([
        api.getSkuOverview(shopName),
        api.getPricingTemplate(shopName).catch(() => null),
      ]);
      setProducts(next);
      setPricingTemplate(tpl);
      hasLoadedOnceRef.current = true;
      void refreshWorkflowProgress();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopName, refreshWorkflowProgress]);

  // Move to the result view once (guarded), pulling the freshly-aligned overview. Non-blocking:
  // callable while the scan is still running ("直接查看当前结果") — cancels remaining work first.
  const finishToResult = useCallback(() => {
    cancelScan();
    markScanned("sku-align", shopName);
    setPhase("result");
    void load();
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
    if (deepFilter && deepFilter !== "all") {
      markScanned("sku-align", shopName);
      setPhase("result");
      setFilter(deepFilter);
      if (deepFilter === "partially_linked") pendingScrollRef.current = true;
      void load();
      return;
    }

    if (hasScanned("sku-align", shopName)) {
      setPhase("result");
      void load();
    } else {
      setPhase("scan");
      void startScan().then(() => {
        window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
      });
    }
  }, [isAuthorized, shopName, load, startScan, finishToResult, searchParams]);

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
          // autoAlign 完成后自动确认所有待确认变体（高置信度项已在显示层视为 active_auto）
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
    setPhase("scan");
    void startScan().then(() => {
      window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
    });
  }, [shopName, startScan, finishToResult]);

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
        showToast("本页没有可确认的待确认建议");
        return;
      }
      showToast(`已接受本页 ${confirmed} 个 AI 建议`);
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
      label: "全部关联",
      value: stats.fullyLinkedProducts,
      hint: "全部 SKU 已映射匹配",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "brand",
    },
    {
      label: "部分关联",
      value: stats.partiallyLinkedProducts,
      hint: `${stats.needsReviewVariants} 待确认 · ${stats.unboundVariants} 未匹配`,
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: stats.partiallyLinkedProducts > 0 ? "warning" : "neutral",
    },
    {
      label: "待确认变体",
      value: stats.needsReviewVariants,
      hint: stats.needsReviewVariants > 0 ? "中等置信度，需人工确认" : "暂无待确认",
      icon: <CircleDashed className="h-4 w-4" />,
      tone: stats.needsReviewVariants > 0 ? "warning" : "neutral",
    },
    {
      label: "变体总数",
      value: stats.totalVariants,
      hint: `已处理 ${stats.resolvedVariants}/${stats.totalVariants}`,
      icon: <Layers className="h-4 w-4" />,
      tone: "default",
    },
  ];

  const filterTabs = [
    { id: "all", label: "全部", count: products.length },
    { id: "fully_linked", label: "全部关联", count: stats.fullyLinkedProducts },
    {
      id: "partially_linked",
      label: "部分关联",
      count: stats.partiallyLinkedProducts,
    },
  ];

  const copilot: AiPanelContent = {
    title: "SKU 绑定助手",
    summary:
      products.length === 0
        ? "确认匹配后的商品会在这里按变体展开，我会帮你把每个变体对齐到 Tangbuy 货源 SKU。"
        : stats.partiallyLinkedProducts > 0
          ? `还有 ${stats.partiallyLinkedProducts} 个商品部分关联（${stats.needsReviewVariants} 待确认 · ${stats.unboundVariants} 未匹配）。`
          : `全部 ${stats.fullyLinkedProducts} 个商品已全部关联，可直接进入物流确认。`,
    bullets: [
      `全部关联：${stats.fullyLinkedProducts} 个商品`,
      `部分关联：${stats.partiallyLinkedProducts} 个商品`,
      "可用上方搜索框按标题或 ID 定位商品",
      "下一步：用页面上方「进入物流确认」继续",
    ],
  };

  const agentContext = useMemo<SkuPageContext>(() => ({
    productCatalog: products,
    focusProductId: focusProductId ?? undefined,
    focusProduct: products.find((p) => p.thirdPlatformItemId === focusProductId) ?? undefined,
    currentFilter: filter,
  }), [products, focusProductId, filter]);

  const previewGenerators = useMemo(
    () => ({
      batch_confirm_pending: async (plan: SkuCommandPlan, shopName: string) => {
        const productIds = plan.draft.params.batchProductIds ?? [];
        const totalCount = productIds.length;

        if (totalCount === 0) {
          throw new Error("没有可处理的商品");
        }

        const sampleCount = Math.min(3, totalCount);
        const sampleRows: any[] = [];

        for (let i = 0; i < sampleCount; i++) {
          const productId = productIds[i];
          const product = products.find((p) => p.thirdPlatformItemId === productId);
          if (product) {
            const needsReview = product.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
            sampleRows.push({
              label: product.title ?? "未知商品",
              before: `${needsReview} 个待确认变体`,
              after: "确认后自动绑定",
            });
          }
        }

        const extraNote =
          sampleCount < totalCount
            ? `以上为前 ${sampleCount} 个商品预览，剩余 ${totalCount - sampleCount} 个商品将按相同规则处理`
            : `以上为全部 ${totalCount} 个商品`;

        return {
          sections: [
            {
              title: `批量确认待匹配 · 共 ${totalCount} 个商品`,
              rows: sampleRows,
            },
          ],
          extraNote,
          impact: {
            scope: `确认 ${totalCount} 个商品的待匹配变体`,
            durationHint: `约 ${Math.max(3, totalCount * 2)} 秒`,
            reversible: true,
          },
          payload: {
            productIds,
            totalCount,
          },
        };
      },
    }),
    [products]
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
        showToast(`批量确认完成：成功 ${success} 个，失败 ${failed} 个`);
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
              onFocusProduct={setFocusProductId}
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
    if (s === "running") return "进行中…";
    if (s === "done") return resultText ?? "完成";
    if (s === "failed") return "失败";
    if (s === "skipped") return resultText ?? "跳过";
    return "待处理";
  };
  const scanCopilot: AiPanelContent = {
    title: "正在自动整理",
    summary: scanDone
      ? "首轮自动对齐已完成，正在进入对照确认。"
      : "我正在把已绑定商品的变体尝试对齐到 Tangbuy 货源 SKU，并预热货源明细。",
    bullets: scanTasks.map((t) => `${t.label}：${scanStatusLabel(t.status, t.resultText)}`),
    nextAction: { label: scanDone ? "查看结果" : "直接查看当前结果", action: "view" },
  };

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel
          title="SKU 绑定"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "SKU 绑定" }]}
          {...wb.panelProps}
        >
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            正在恢复店铺授权…
          </div>
          <TableSkeleton rows={4} />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell
        sidebar={<StepSidebar />}
        rail={
          <AssistantRail
            assistantContent={<CopilotCard content={copilot} />}
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title="SKU 绑定"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "SKU 绑定" }]}
          {...wb.panelProps}
        >
          <EmptyState
            title="尚未连接店铺"
            description="完成授权后即可在这里按变体查看与对齐货源绑定。"
            action={
              <Link href="/authorize">
                <Button size="sm" className="mt-1">
                  去授权店铺
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
        sidebar={<StepSidebar />}
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
                <InfoCard title="这一步在做什么">
                  <ul className="space-y-1.5">
                    <li>读取已绑定商品与变体</li>
                    <li>按 Tangbuy 货源 SKU 矩阵自动对齐（可信项落库）</li>
                    <li>预热货源明细，进入后图 / 价即时可见</li>
                  </ul>
                </InfoCard>
              </>
            }
          />
        }
        {...wb.shellProps}
      >
        <WorkbenchPanel
          title="SKU 绑定"
          breadcrumbs={BREADCRUMBS}
          {...wb.panelProps}
        >
          <ScanStage
            heading="首轮自动整理"
            description="系统正在用真实接口自动对齐 SKU，可随时直接查看当前结果。"
            tasks={scanTasks}
            recent={scanRecent}
            done={scanDone}
            onViewResult={() => void finishToResult()}
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell sidebar={<StepSidebar />} rail={rail} {...wb.shellProps}>
      <WorkbenchPanel
        title="SKU 绑定"
        breadcrumbs={BREADCRUMBS}
        {...wb.panelProps}
        actions={
          <div className="flex items-center gap-2">
            <SkuLogisticsEntryGate />
            <Button
              variant="secondary"
              onClick={restartScan}
              className="h-7 w-7 px-0"
              title="重新整理（重新对齐 SKU 并预热货源明细）"
              aria-label="重新整理"
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
                  placeholder="搜索标题 / 商品 ID / SKU…"
                  className="h-8 w-full rounded-[var(--radius-control)] border border-hairline bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    aria-label="清除搜索"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 w-8 shrink-0 px-0"
                onClick={() => void load()}
                disabled={loading || refreshing}
                title="刷新列表"
                aria-label="刷新列表"
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
                  加载失败：{error}
                  {error.includes("502") ? (
                    <span className="mt-1 block text-xs text-red-600/90">
                      智能选品侧的匹配数据仍在，但 SKU 概览接口未响应。请确认后端服务可用后重试。
                    </span>
                  ) : null}
                </span>
                <Button size="sm" variant="secondary" onClick={() => void load()}>
                  重试
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {loading ? (
            <Card>
              <TableSkeleton rows={5} />
            </Card>
          ) : error ? null : products.length === 0 ? (
            <EmptyState
              title="还没有已绑定的商品"
              description="请先到「智能选品」查找货源并确认匹配。绑定成功的商品会在这里按变体展开。"
              action={
                <Link href="/products">
                  <Button size="sm" className="mt-1">
                    去智能选品确认匹配
                  </Button>
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={searchQuery.trim() ? "未找到匹配商品" : "该筛选下暂无商品"}
              description={
                searchQuery.trim()
                  ? "试试更短的关键词，或切换到「全部」查看完整列表。"
                  : filter === "fully_linked"
                    ? "还没有全部 SKU 都映射完成的商品。切换到「部分关联」或「全部」查看待处理项。"
                    : filter === "partially_linked"
                      ? "暂无部分关联的商品。切换到「全部关联」查看已完成项。"
                      : "当前列表为空。"
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
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function SkuAlignPage() {
  return (
    <Suspense
      fallback={
        <WorkbenchShell sidebar={<StepSidebar />}>
          <WorkbenchPanel title="SKU 绑定">
            <TableSkeleton rows={5} />
          </WorkbenchPanel>
        </WorkbenchShell>
      }
    >
      <SkuAlignContent />
    </Suspense>
  );
}
