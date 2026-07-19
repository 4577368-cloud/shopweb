"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Boxes, CircleDashed, Layers, Link2, RefreshCw } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { ScanStage, type ScanTaskStatus } from "@/components/workbench/scan-stage";
import { useProductsScan } from "@/hooks/use-products-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import {
  MetricSummaryCards,
  type MetricSummaryItem,
} from "@/components/workbench/metric-summary-cards";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnboarding } from "@/context/onboarding-context";
import { api } from "@/lib/api";
import { ShopProductsPanel } from "@/components/select/shop-products-panel";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";
import type { AiPanelContent } from "@/lib/types";

type Tab = "shop" | "catalog";

const BREADCRUMBS = [{ label: "工作台", href: "/" }, { label: "智能选品" }];

const RECOMMENDATION_LIMIT = 20;

// Hold the completed progress bar briefly so users can see the finished state before the result view.
const SCAN_DWELL_MS = 900;

/** Shop-level counts derived from real endpoints; drives the metric strip + copilot summary. */
interface ProductsSummary {
  shopProducts: number;
  confirmedProducts: number;
  pendingProducts: number;
  recommendations: number;
}

function SelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, isAuthorized } = useOnboarding();
  const shopName = shop.name;

  const tab: Tab = searchParams.get("tab") === "catalog" ? "catalog" : "shop";
  const setTab = (t: Tab) => router.replace(`/products?tab=${t}`, { scroll: false });

  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  // "result" is the SSR/hydration-safe default; the mount effect flips to "scan" on first visit.
  const [phase, setPhase] = useState<"scan" | "result">("result");

  const {
    tasks: scanTasks,
    recent: scanRecent,
    done: scanDone,
    start: startScan,
    cancel: cancelScan,
  } = useProductsScan(shopName);

  // Independent, read-only aggregation for the header. Panels keep their own interactive fetches;
  // this only powers the metric strip + copilot, and is refreshed when a panel reports activity.
  const loadSummary = useCallback(async () => {
    const [products, bindings, recs] = await Promise.all([
      api.getShopProducts(shopName).catch(() => []),
      api.listImageBindings(shopName).catch(() => []),
      api.getRecommendations(shopName, RECOMMENDATION_LIMIT).catch(() => []),
    ]);
    const confirmed = new Set<string>();
    const pending = new Set<string>();
    for (const b of bindings) {
      if (!b.bound || !b.thirdPlatformItemId) continue;
      if (b.bindStatus === "PENDING") pending.add(b.thirdPlatformItemId);
      else confirmed.add(b.thirdPlatformItemId);
    }
    setSummary({
      shopProducts: products.length,
      confirmedProducts: confirmed.size,
      pendingProducts: pending.size,
      recommendations: recs.length,
    });
  }, [shopName]);

  // Move to the result view once (guarded), refreshing the header summary. Non-blocking: callable
  // while the scan is still running ("直接查看当前结果") — cancels remaining work first. The panels
  // reload their own data on mount, so freshly auto-linked bindings show up in the result view.
  const finishedRef = useRef(false);
  const finishToResult = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelScan();
    markScanned("products", shopName);
    await loadSummary();
    setPhase("result");
  }, [cancelScan, shopName, loadSummary]);

  // Decide once per shop: first session visit → play the scan; otherwise straight to result.
  const startedForShopRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;
    finishedRef.current = false;
    if (hasScanned("products", shopName)) {
      setPhase("result");
      void loadSummary();
    } else {
      setPhase("scan");
      void startScan().then(() => {
        window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
      });
    }
  }, [isAuthorized, shopName, loadSummary, startScan, finishToResult]);

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    clearScanned("products", shopName);
    setPhase("scan");
    void startScan().then(() => {
      window.setTimeout(() => void finishToResult(), SCAN_DWELL_MS);
    });
  }, [shopName, startScan, finishToResult]);

  const dash = (n?: number) => (summary ? String(n) : "—");
  const pendingCount = summary?.pendingProducts ?? 0;
  const unbound =
    summary != null
      ? Math.max(summary.shopProducts - summary.confirmedProducts - summary.pendingProducts, 0)
      : undefined;

  const metrics: MetricSummaryItem[] = [
    {
      label: "在售商品",
      value: dash(summary?.shopProducts),
      hint: "Shopify 同步镜像",
      icon: <Boxes className="h-4 w-4" />,
      tone: "default",
    },
    {
      label: "已确认关联",
      value: dash(summary?.confirmedProducts),
      hint: "人工已确认的货源绑定",
      icon: <Link2 className="h-4 w-4" />,
      tone: "brand",
    },
    {
      label: "AI 待确认",
      value: dash(summary?.pendingProducts),
      hint: pendingCount > 0 ? "AI 已关联，待你确认" : "暂无待确认",
      icon: <CircleDashed className="h-4 w-4" />,
      tone: pendingCount > 0 ? "warning" : "neutral",
    },
    {
      label: "目录可上架",
      value: dash(summary?.recommendations),
      hint: "Tangbuy 商城候选",
      icon: <Layers className="h-4 w-4" />,
      tone: "default",
    },
  ];

  const copilot: AiPanelContent = {
    title: "选品助手",
    summary: summary
      ? `店铺共 ${summary.shopProducts} 个在售商品；AI 已关联 ${
          summary.pendingProducts
        } 个待确认，已确认 ${summary.confirmedProducts} 个，还有 ${
          unbound ?? 0
        } 个未关联；Tangbuy 商城有 ${summary.recommendations} 条可上架。`
      : "正在读取店铺商品与 Tangbuy 商城…",
    bullets: [
      summary
        ? `AI 待确认：${summary.pendingProducts} 个，去卡片上「确认无误」或「取消关联」`
        : "AI 待确认：读取中",
      summary
        ? `已确认关联：${summary.confirmedProducts}/${summary.shopProducts}`
        : "已确认关联：读取中",
      unbound && unbound > 0
        ? `未关联：${unbound} 个，可用图搜查找货源`
        : "在售商品货源关联已就绪",
    ],
    nextAction: { label: "去 SKU 绑定确认", href: "/sku-align" },
  };

  const scanStatusLabel = (s: ScanTaskStatus, resultText?: string | null) => {
    if (s === "running") return "进行中…";
    if (s === "done") return resultText ?? "完成";
    if (s === "failed") return "失败";
    if (s === "skipped") return resultText ?? "跳过";
    return "待处理";
  };
  const scanCopilot: AiPanelContent = {
    title: "正在自动选品",
    summary: scanDone
      ? "首轮自动处理已完成，正在进入智能选品结果。"
      : "我正在同步店铺商品，并为未关联的在售商品自动图搜关联 Tangbuy 货源。",
    bullets: scanTasks.map((t) => `${t.label}：${scanStatusLabel(t.status, t.resultText)}`),
    nextAction: { label: scanDone ? "查看结果" : "直接查看当前结果", action: "view" },
  };

  const rail = (
    <AssistantRail>
      <CopilotCard content={copilot} />
      <InfoCard title="两条选品路径">
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-ink">在售商品（路径 A）</span>
            <br />
            为已上架的 Shopify 商品用 Tangbuy 图搜找货源并确认关联。
          </li>
          <li>
            <span className="font-medium text-ink">Tangbuy 商城（路径 B）</span>
            <br />
            从 Tangbuy 目录选品，按定价模板推算售价后一键上架为可售商品。
          </li>
        </ul>
      </InfoCard>
    </AssistantRail>
  );

  if (!isAuthorized) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} rail={rail}>
        <WorkbenchPanel
          title="智能选品"
          description="连接店铺后，可为在售商品关联货源，或从 Tangbuy 商城选品上架。"
          breadcrumbs={[{ label: "授权店铺", href: "/authorize" }, { label: "智能选品" }]}
        >
          <EmptyState
            title="尚未连接店铺"
            description="完成 Shopify 授权后，此处将加载在售商品与可上架的货源商品。"
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
                <li>同步 Shopify 在售商品镜像</li>
                <li>为未关联商品自动图搜并绑定 Tangbuy 货源</li>
                <li>生成 Tangbuy 商城可上架候选</li>
              </ul>
            </InfoCard>
          </AssistantRail>
        }
      >
        <WorkbenchPanel
          title="智能选品"
          description="首轮自动选品：正在同步商品并自动关联货源。"
          breadcrumbs={BREADCRUMBS}
        >
          <ScanStage
            heading="首轮自动选品"
            description="系统正在用真实接口同步商品并自动图搜关联货源，可随时直接查看当前结果。"
            tasks={scanTasks}
            recent={scanRecent}
            done={scanDone}
            onViewResult={() => void finishToResult()}
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  const tabs = [
    { id: "shop", label: "在售商品", count: summary?.shopProducts },
    { id: "catalog", label: "Tangbuy 商城", count: summary?.recommendations },
  ];

  return (
    <WorkbenchShell sidebar={<StepSidebar />} rail={rail}>
      <WorkbenchPanel
        title="智能选品"
        description="为在售商品关联货源（路径 A），或从 Tangbuy 商城选品上架（路径 B）。"
        breadcrumbs={BREADCRUMBS}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={restartScan}
              className="w-9 px-0"
              title="重新分析（同步商品并自动关联货源）"
              aria-label="重新分析"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/sku-align">
              <Button>
                进入 SKU 绑定
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      >
        <div className="space-y-4">
          <MetricSummaryCards items={metrics} />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              variant="solid"
              tabs={tabs}
              value={tab}
              onValueChange={(id) => setTab(id as Tab)}
            />
            <p className="text-xs text-ink-subtle">
              {tab === "shop" ? "路径 A · 关联货源" : "路径 B · 建可售商品"}
            </p>
          </div>

          {tab === "shop" ? (
            <ShopProductsPanel onActivity={loadSummary} />
          ) : (
            <CatalogPublishPanel onActivity={loadSummary} />
          )}
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <WorkbenchShell sidebar={<StepSidebar />}>
          <WorkbenchPanel title="智能选品">{null}</WorkbenchPanel>
        </WorkbenchShell>
      }
    >
      <SelectContent />
    </Suspense>
  );
}
