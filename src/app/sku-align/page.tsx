"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileDown,
  Layers,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
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
import { StickyActionBar } from "@/components/workbench/sticky-action-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  SkuProductCard,
  boundVariantCount,
  productMatchState,
  type ProductMatchState,
} from "@/components/sku-align/sku-binding-panel";
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

type FilterId = "all" | ProductMatchState;

export default function SkuAlignPage() {
  const { shop, showToast, isAuthorized } = useOnboarding();
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SkuProductOverview[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
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
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.getSkuOverview(shopName));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [shopName]);

  // Move to the result view once (guarded), pulling the freshly-aligned overview. Non-blocking:
  // callable while the scan is still running ("直接查看当前结果") — cancels remaining work first.
  const finishedRef = useRef(false);
  const finishToResult = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelScan();
    markScanned("sku-align", shopName);
    await load();
    setPhase("result");
  }, [cancelScan, shopName, load]);

  // Decide once per shop: first session visit → play the scan; otherwise straight to result.
  const startedForShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;
    finishedRef.current = false;
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

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    clearScanned("sku-align", shopName);
    setPhase("scan");
    void startScan().then(() => {
      window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
    });
  }, [shopName, startScan, finishToResult]);

  const stats = useMemo(() => {
    let full = 0;
    let partial = 0;
    let none = 0;
    let totalVariants = 0;
    let boundVariants = 0;
    for (const p of products) {
      const state = productMatchState(p);
      if (state === "full") full++;
      else if (state === "partial") partial++;
      else none++;
      totalVariants += p.variants.length;
      boundVariants += boundVariantCount(p);
    }
    return { full, partial, none, totalVariants, boundVariants };
  }, [products]);

  // Surface what needs human eyes: partial first, then unmatched, fully-matched last.
  const stateOrder: Record<ProductMatchState, number> = { partial: 0, none: 1, full: 2 };
  const filtered = useMemo(() => {
    const base =
      filter === "all"
        ? products
        : products.filter((p) => productMatchState(p) === filter);
    return [...base].sort(
      (a, b) => stateOrder[productMatchState(a)] - stateOrder[productMatchState(b)]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stateOrder is a stable literal
  }, [products, filter]);

  const metrics: MetricSummaryItem[] = [
    {
      label: "已自动匹配",
      value: stats.full,
      hint: "全部变体已匹配",
      icon: <CheckCircle2 className="h-4 w-4" />,
      tone: "brand",
    },
    {
      label: "部分匹配",
      value: stats.partial,
      hint: "需要手动处理",
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: "warning",
    },
    {
      label: "未匹配",
      value: stats.none,
      hint: stats.none > 0 ? "待建立绑定" : "暂无未匹配",
      icon: <CircleDashed className="h-4 w-4" />,
      tone: "neutral",
    },
    {
      label: "变体总数",
      value: stats.totalVariants,
      hint: `已处理 ${stats.boundVariants}/${stats.totalVariants}`,
      icon: <Layers className="h-4 w-4" />,
      tone: "default",
    },
  ];

  const filterTabs = [
    { id: "all", label: "全部", count: products.length },
    { id: "full", label: "全部匹配", count: stats.full },
    { id: "partial", label: "部分匹配", count: stats.partial },
    { id: "none", label: "未匹配", count: stats.none },
  ];

  const copilot: AiPanelContent = {
    title: "SKU 绑定助手",
    summary:
      products.length === 0
        ? "确认匹配后的商品会在这里按变体展开，我会帮你把每个变体对齐到 Tangbuy 货源 SKU。"
        : `我已帮你匹配 ${stats.boundVariants}/${stats.totalVariants} 个变体${
            stats.partial > 0 ? `，还有 ${stats.partial} 个商品需要手动处理` : "，全部已就绪"
          }。`,
    bullets: [
      `自动匹配完成：${stats.full} 个商品`,
      stats.partial > 0 ? `需要手动处理：${stats.partial} 个商品` : "无需手动处理",
      "点每个商品的「自动对齐 SKU」按货源矩阵逐变体绑定",
    ],
    nextAction: { label: "确认并进入物流确认", href: "/logistics" },
  };

  const rail = (
    <AssistantRail>
      <CopilotCard content={copilot} />
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
    </AssistantRail>
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
          <AssistantRail>
            <CopilotCard content={copilot} />
          </AssistantRail>
        }
      >
        <WorkbenchPanel
          title="SKU 绑定"
          description="请先完成店铺授权。"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "SKU 绑定" }]}
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
          <AssistantRail>
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
          </AssistantRail>
        }
      >
        <WorkbenchPanel
          title="SKU 绑定"
          description="首轮自动整理：正在为已绑定商品对齐货源 SKU。"
          breadcrumbs={BREADCRUMBS}
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

  const showFooter = !loading && !error && products.length > 0;

  return (
    <WorkbenchShell sidebar={<StepSidebar />} rail={rail}>
      <WorkbenchPanel
        title="SKU 绑定"
        description="AI 已自动匹配 Shopify 变体与货源 SKU，请确认并继续。"
        breadcrumbs={BREADCRUMBS}
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
        footer={
          showFooter ? (
            <StickyActionBar
              info={
                <>
                  已匹配{" "}
                  <span className="font-semibold text-ink">
                    {stats.boundVariants} / {stats.totalVariants}
                  </span>{" "}
                  个变体
                </>
              }
            >
              <Button
                variant="secondary"
                onClick={() => showToast("匹配报告导出功能即将上线")}
              >
                <FileDown className="h-4 w-4" />
                导出报告
              </Button>
              <Link href="/logistics">
                <Button>
                  确认并进入物流
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </StickyActionBar>
          ) : undefined
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
              disabled={loading}
            >
              {loading ? (
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
              title="该筛选下暂无商品"
              description="切换到「全部」查看所有已绑定商品。"
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
                />
              ))}
            </div>
          )}
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}
