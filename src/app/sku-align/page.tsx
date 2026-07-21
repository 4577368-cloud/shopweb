"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Layers,
  Loader2,
  RefreshCw,
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
  sortProductsForWorkbench,
  type SkuFilterMode,
} from "@/components/sku-align/sku-binding-panel";
import { SkuAlignAiPanel } from "@/components/sku-align/sku-align-ai-panel";
import {
  computeSkuAlignMetrics,
  countNeedsReviewInProducts,
} from "@/lib/sku-align/display";
import {
  confirmPageNeedsReview,
} from "@/lib/sku-align/batch-confirm";
import { autoAlignUnboundProducts } from "@/lib/sku-align/auto-align-unresolved";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import type { AiPanelContent, SkuProductOverview } from "@/lib/types";

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

export default function SkuAlignPage() {
  const { shop, showToast, isAuthorized } = useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("sku-align");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SkuProductOverview[]>([]);
  const hasLoadedOnceRef = useRef(false);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [shopName]);
  const autoAlignStartedRef = useRef<string | null>(null);

  useEffect(() => {
    autoAlignStartedRef.current = null;
  }, [shopName]);
  const [filter, setFilter] = useState<FilterId>("issues");
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

  const load = useCallback(async () => {
    const silent = hasLoadedOnceRef.current;
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      // Snapshot repair can take minutes — never block overview refresh on it.
      void api.backfillBindingSnapshots(shopName).catch(() => null);
      const next = await api.getSkuOverview(shopName);
      setProducts(next);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [shopName]);

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
    if (hasScanned("sku-align", shopName)) {
      setPhase("result");
      void load();
    } else {
      setPhase("scan");
      void startScan().then(() => {
        window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
      });
    }
  }, [isAuthorized, shopName, load, startScan, finishToResult]);

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
    return sortProductsForWorkbench(filterProducts(products, filter));
  }, [products, filter]);

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
      needsReviewVariants: m.needsReview,
      unboundVariants: m.unbound,
      totalVariants: m.variantCount,
      resolvedVariants: m.activeAuto + m.manualActive,
    };
  }, [metricsSnapshot]);

  const metrics: MetricSummaryItem[] = [
    {
      label: "问题项",
      value: stats.issueProducts,
      hint: `${stats.needsReviewVariants} 待确认 · ${stats.unboundVariants} 未匹配`,
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "warning",
    },
    {
      label: "已就绪",
      value: stats.doneProducts,
      hint: "全部变体已自动或手动对齐",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "brand",
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
    { id: "issues", label: "问题项", count: stats.issueProducts },
    { id: "all", label: "全部", count: products.length },
    { id: "done", label: "已就绪", count: stats.doneProducts },
  ];

  const copilot: AiPanelContent = {
    title: "SKU 绑定助手",
    summary:
      products.length === 0
        ? "确认匹配后的商品会在这里按变体展开，我会帮你把每个变体对齐到 Tangbuy 货源 SKU。"
        : stats.issueProducts > 0
          ? `还有 ${stats.issueProducts} 个商品需要处理（${stats.needsReviewVariants} 待确认 · ${stats.unboundVariants} 未匹配）。高置信和单 SKU 已自动生效。`
          : `全部 ${stats.doneProducts} 个商品已就绪，可直接进入物流确认。`,
    bullets: [
      `问题项：${stats.issueProducts} 个商品`,
      `已就绪：${stats.doneProducts} 个商品`,
      "默认只展示待确认 / 未匹配变体",
      "下一步：用页面上方「进入物流确认」继续",
    ],
  };

  const rail = (
    <AssistantRail
      assistantContent={
        <>
          <CopilotCard content={copilot} />
          {phase === "result" && products.length > 0 ? (
            <SkuAlignAiPanel
              needsReviewOnPage={needsReviewOnPage}
              confirming={confirmingPage}
              onConfirmPage={() => void handleConfirmPageNeedsReview()}
            />
          ) : null}
          <InfoCard title="匹配规则说明">
            <p className="mb-2">AI 基于以下维度进行匹配：</p>
            <ul className="space-y-1.5">
              {matchRules.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </InfoCard>
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
            <Button
              variant="secondary"
              onClick={restartScan}
              className="w-9 px-0"
              title="重新整理（重新对齐 SKU 并预热货源明细）"
              aria-label="重新整理"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/logistics">
              <Button>
                进入物流确认
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      >
        <div className="space-y-4">
          <MetricSummaryCards items={metrics} />

          <div className="flex items-center justify-between gap-3">
            <SegmentedTabs
              variant="chip"
              tabs={filterTabs}
              value={filter}
              onValueChange={(id) => setFilter(id as FilterId)}
            />
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void load()}
              disabled={loading || refreshing}
            >
              {loading || refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新
            </Button>
          </div>

          {error ? (
            <Card className="border-red-200">
              <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
                <span>加载失败：{error}</span>
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
          ) : products.length === 0 ? (
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
              title={filter === "issues" ? "暂无问题项" : "该筛选下暂无商品"}
              description={
                filter === "issues"
                  ? "高置信和单 SKU 变体已自动生效。切换到「全部」或「已就绪」查看完整列表。"
                  : "切换到「问题项」查看待处理商品。"
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
                />
              ))}
            </div>
          )}
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
