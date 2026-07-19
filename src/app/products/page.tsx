"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Boxes, CircleDashed, Layers, Link2, Wand2 } from "lucide-react";
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

/** Shop-level counts derived from real endpoints; drives the metric strip + copilot summary. */
interface ProductsSummary {
  shopProducts: number;
  boundProducts: number;
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
    const bound = new Set(
      bindings.filter((b) => b.bound && b.thirdPlatformItemId).map((b) => b.thirdPlatformItemId)
    );
    setSummary({
      shopProducts: products.length,
      boundProducts: bound.size,
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
        void finishToResult();
      });
    }
  }, [isAuthorized, shopName, loadSummary, startScan, finishToResult]);

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    clearScanned("products", shopName);
    setPhase("scan");
    void startScan().then(() => {
      void finishToResult();
    });
  }, [shopName, startScan, finishToResult]);

  const dash = (n?: number) => (summary ? String(n) : "—");
  const pending =
    summary != null ? Math.max(summary.shopProducts - summary.boundProducts, 0) : undefined;

  const metrics: MetricSummaryItem[] = [
    {
      label: "在售商品",
      value: dash(summary?.shopProducts),
      hint: "Shopify 同步镜像",
      icon: <Boxes className="h-4 w-4" />,
      tone: "default",
    },
    {
      label: "已关联货源",
      value: dash(summary?.boundProducts),
      hint: "已确认 1688 图搜绑定",
      icon: <Link2 className="h-4 w-4" />,
      tone: "brand",
    },
    {
      label: "待关联",
      value: dash(pending),
      hint: pending && pending > 0 ? "建议查找货源" : "暂无待关联",
      icon: <CircleDashed className="h-4 w-4" />,
      tone: pending && pending > 0 ? "warning" : "neutral",
    },
    {
      label: "目录可上架",
      value: dash(summary?.recommendations),
      hint: "离线目录候选",
      icon: <Layers className="h-4 w-4" />,
      tone: "default",
    },
  ];

  const copilot: AiPanelContent = {
    title: "选品助手",
    summary: summary
      ? `店铺共 ${summary.shopProducts} 个在售商品，已关联 ${summary.boundProducts} 个货源，还有 ${
          pending ?? 0
        } 个待关联；离线目录有 ${summary.recommendations} 条可上架。`
      : "正在读取店铺商品与离线目录…",
    bullets: [
      summary
        ? `在售商品已关联：${summary.boundProducts}/${summary.shopProducts}`
        : "在售商品：读取中",
      pending && pending > 0
        ? `待关联货源：${pending} 个，可在「在售商品」用图搜关联`
        : "在售商品货源关联已就绪",
      summary
        ? `离线目录可上架：${summary.recommendations} 条`
        : "离线目录：读取中",
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
      : "我正在同步店铺商品，并为未关联的在售商品自动图搜关联 1688 货源。",
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
            为已上架的 Shopify 商品用 1688 图搜找货源并确认关联。
          </li>
          <li>
            <span className="font-medium text-ink">离线目录（路径 B）</span>
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
          description="连接店铺后，可为在售商品关联货源，或从离线目录选品上架。"
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
                <li>为未关联商品自动图搜并绑定 1688 货源</li>
                <li>生成离线目录可上架候选</li>
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
    { id: "catalog", label: "离线目录", count: summary?.recommendations },
  ];

  return (
    <WorkbenchShell sidebar={<StepSidebar />} rail={rail}>
      <WorkbenchPanel
        title="智能选品"
        description="为在售商品关联货源（路径 A），或从离线目录选品上架（路径 B）。"
        breadcrumbs={BREADCRUMBS}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={restartScan}>
              <Wand2 className="h-4 w-4" />
              重新分析
            </Button>
            <Link href="/sku-align">
              <Button variant="secondary">
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
