"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Boxes, CircleDashed, Layers, Link2 } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail, CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
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

  useEffect(() => {
    if (!isAuthorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read-only header aggregation on mount
    void loadSummary();
  }, [loadSummary, isAuthorized]);

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
          <Link href="/sku-align">
            <Button variant="secondary">
              进入 SKU 绑定
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
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
