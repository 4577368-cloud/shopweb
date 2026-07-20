"use client";

import { Suspense, useCallback, useEffect, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Coins } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { ScanStage, type ScanTaskStatus } from "@/components/workbench/scan-stage";
import { useProductsScan } from "@/hooks/use-products-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import { AiTaskStatus } from "@/components/select/ai-task-status";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnboarding } from "@/context/onboarding-context";
import { api } from "@/lib/api";
import {
  ShopProductsPanel,
  type ShopFilter,
} from "@/components/select/shop-products-panel";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";
import type { AiPanelContent, PricingTemplate } from "@/lib/types";

type Tab = "shop" | "catalog";

const BREADCRUMBS = [{ label: "工作台", href: "/" }, { label: "智能选品" }];

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

  const urlTab: Tab = searchParams.get("tab") === "catalog" ? "catalog" : "shop";
  // Optimistic local tab so clicks switch immediately even if soft-nav / searchParams lag.
  const [tab, setTabLocal] = useState<Tab>(urlTab);
  useEffect(() => {
    setTabLocal(urlTab);
  }, [urlTab]);

  const setTab = useCallback(
    (t: Tab) => {
      setTabLocal(t);
      const current = searchParams.get("tab");
      const already =
        current === t || (t === "shop" && (current == null || current === ""));
      if (already) return;
      startTransition(() => {
        router.replace(`/products?tab=${t}`, { scroll: false });
      });
    },
    [router, searchParams]
  );

  // Filter is lifted so the top status CTA can jump to e.g. 待确认 / 未关联.
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [summary, setSummary] = useState<ProductsSummary | null>(null);
  const [template, setTemplate] = useState<PricingTemplate | null>(null);
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
    const [products, bindings, recCount, tpl] = await Promise.all([
      api.getShopProducts(shopName).catch(() => []),
      api.listImageBindings(shopName).catch(() => []),
      api.getRecommendationsCount().catch(() => ({ count: 0 })),
      api.getPricingTemplate(shopName).catch(() => null),
    ]);
    const confirmed = new Set<string>();
    const pending = new Set<string>();
    for (const b of bindings) {
      if (!b.bound || !b.thirdPlatformItemId) continue;
      if (b.bindStatus === "PENDING") pending.add(b.thirdPlatformItemId);
      else confirmed.add(b.thirdPlatformItemId);
    }
    setTemplate(tpl);
    setSummary({
      shopProducts: products.length,
      confirmedProducts: confirmed.size,
      pendingProducts: pending.size,
      recommendations: recCount.count,
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

  const pendingCount = summary?.pendingProducts ?? 0;
  const unbound =
    summary != null
      ? Math.max(summary.shopProducts - summary.confirmedProducts - summary.pendingProducts, 0)
      : 0;

  // Header-only primary CTA: 处理待确认 → 查找货源 → 进入 SKU 绑定.
  const jumpToShopFilter = useCallback(
    (f: ShopFilter) => {
      setShopFilter(f);
      setTab("shop");
    },
    [setTab]
  );
  const statusCta: { label: string; href?: string; onClick?: () => void } =
    pendingCount > 0
      ? { label: `处理 ${pendingCount} 个待确认`, onClick: () => jumpToShopFilter("pending") }
      : unbound > 0
        ? { label: `为 ${unbound} 个商品查找货源`, onClick: () => jumpToShopFilter("unbound") }
        : { label: "进入 SKU 绑定", href: "/sku-align" };

  const copilot: AiPanelContent = {
    title: summary ? "店铺商品分析已完成" : "正在分析店铺商品",
    summary: summary
      ? `已分析 ${summary.shopProducts} 个商品，AI 自动匹配 ${
          summary.confirmedProducts + summary.pendingProducts
        } 个货源，其中 ${summary.pendingProducts} 个待你确认；发现新品可上架 ${
          summary.recommendations
        } 条。`
      : "正在读取店铺商品与货源关联…",
    bullets: summary
      ? [
          `已自动匹配货源：${summary.confirmedProducts + summary.pendingProducts}/${summary.shopProducts}`,
          summary.pendingProducts > 0
            ? `待你确认：${summary.pendingProducts} 个（卡片上「确认无误 / 取消关联」）`
            : "待确认：0 个，货源关联已确认",
          unbound > 0
            ? `未匹配：${unbound} 个，可用图搜查找货源`
            : "未匹配：0 个",
          `下一步：用页面上方「${statusCta.label}」继续`,
        ]
      : ["读取中…"],
    // 重点洞察仅在有待办时以「需注意」呈现；全部就绪则不报警，交由摘要与下一步表达。
    alerts:
      summary && pendingCount > 0
        ? [
            {
              id: "insight-pending",
              text: `发现 ${pendingCount} 个商品需要人工确认；确认后 ${
                summary.confirmedProducts + pendingCount
              } 个即可进入 SKU 绑定。`,
            },
          ]
        : summary && unbound > 0
          ? [
              {
                id: "insight-unbound",
                text: `还有 ${unbound} 个商品未匹配货源，建议用图搜逐个查找。`,
              },
            ]
          : undefined,
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
      <CopilotCard content={copilot} heading="AI 运营顾问" />
      <PricingStrategyCard template={template} onAdjust={() => setTab("catalog")} />
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
    { id: "shop", label: "我的 Shopify 商品", count: summary?.shopProducts },
    { id: "catalog", label: "发现新品", count: summary?.recommendations },
  ];

  return (
    <WorkbenchShell sidebar={<StepSidebar />} rail={rail}>
      <WorkbenchPanel
        title="智能选品"
        description="为在售商品关联货源（路径 A），或从 Tangbuy 商城选品上架（路径 B）。"
        breadcrumbs={BREADCRUMBS}
        actions={
          statusCta.href ? (
            <Link href={statusCta.href}>
              <Button>
                {statusCta.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          ) : (
            <Button onClick={statusCta.onClick}>
              {statusCta.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <AiTaskStatus
            ready={summary != null}
            analyzed={summary?.shopProducts ?? 0}
            matched={(summary?.confirmedProducts ?? 0) + (summary?.pendingProducts ?? 0)}
            pending={pendingCount}
            confirmed={summary?.confirmedProducts ?? 0}
            unbound={unbound}
            recommendations={summary?.recommendations ?? 0}
            onRefresh={restartScan}
          />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              variant="solid"
              tabs={tabs}
              value={tab}
              onValueChange={(id) => setTab(id as Tab)}
            />
            <p className="text-xs text-ink-subtle">
              {tab === "shop"
                ? "优化已有商品 · 为在售商品关联货源"
                : "发现新品 · 从 Tangbuy 商城选品上架"}
            </p>
          </div>

          {tab === "shop" ? (
            <ShopProductsPanel
              onActivity={loadSummary}
              filter={shopFilter}
              onFilterChange={setShopFilter}
            />
          ) : (
            <CatalogPublishPanel onActivity={loadSummary} />
          )}
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

/** Lightweight pricing-strategy summary for the rail — the full editor lives (collapsed) under 发现新品. */
function PricingStrategyCard({
  template,
  onAdjust,
}: {
  template: PricingTemplate | null;
  onAdjust: () => void;
}) {
  return (
    <InfoCard
      title="定价策略"
      icon={<Coins className="h-3.5 w-3.5 text-brand" />}
      action={
        <button
          type="button"
          onClick={onAdjust}
          className="font-medium text-brand-strong hover:underline"
        >
          调整定价 →
        </button>
      }
    >
      {template ? (
        <div className="space-y-1.5">
          <p>
            采购价（{template.sourceCurrency}）按汇率{" "}
            <span className="font-medium text-ink">{template.exchangeRate}</span>{" "}
            除法换算为 {template.targetCurrency}。
          </p>
          <p>
            售价 = round(采购价 ÷ 汇率 × {template.multiplier} + {template.addend})
          </p>
          <p className="text-[11px] text-ink-subtle">
            汇率为「多少源币种 = 1 目标币种」（如 6.5 表示 6.5 CNY = 1 USD）。
            该规则将决定上架到 Shopify 的售价
            {template.isDefault ? "（当前为系统默认，未保存）" : ""}。
          </p>
        </div>
      ) : (
        <p>读取定价策略中…</p>
      )}
    </InfoCard>
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
