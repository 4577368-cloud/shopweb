"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnboarding } from "@/context/onboarding-context";
import { ShopProductsPanel } from "@/components/select/shop-products-panel";
import { CatalogPublishPanel } from "@/components/select/catalog-publish-panel";
import { cn } from "@/lib/utils";

type Tab = "shop" | "catalog";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "shop", label: "在售商品", hint: "路径A · 关联货源" },
  { id: "catalog", label: "离线目录上架", hint: "路径B · 建可售商品" },
];

function SelectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthorized } = useOnboarding();

  const tab: Tab = searchParams.get("tab") === "catalog" ? "catalog" : "shop";
  const setTab = (t: Tab) =>
    router.replace(`/products?tab=${t}`, { scroll: false });

  if (!isAuthorized) {
    return (
      <AppShell>
        <PageHeader
          title="选品"
          description="连接店铺后，可查看在售商品并从离线目录选品上架。"
          breadcrumbs={[
            { label: "授权店铺", href: "/authorize" },
            { label: "选品" },
          ]}
          actions={
            <Link href="/authorize">
              <Button>去授权店铺</Button>
            </Link>
          }
        />
        <EmptyState
          title="尚未连接店铺"
          description="完成 Shopify 授权后，此处将加载在售商品与可上架的货源商品。"
          action={
            <Link href="/authorize" className="mt-1">
              <Button size="sm">去授权店铺</Button>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="选品"
        description="在售商品关联货源（路径A）与离线目录上架（路径B）都在这里完成。"
        breadcrumbs={[{ label: "工作台", href: "/" }, { label: "选品" }]}
      />

      <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-white p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-col items-start rounded px-3.5 py-1.5 text-left transition-colors",
              tab === t.id
                ? "bg-teal-700 text-white"
                : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <span className="text-sm font-medium leading-4">{t.label}</span>
            <span
              className={cn(
                "mt-0.5 text-[10px] leading-3",
                tab === t.id ? "text-teal-100" : "text-slate-400"
              )}
            >
              {t.hint}
            </span>
          </button>
        ))}
      </div>

      {tab === "shop" ? <ShopProductsPanel /> : <CatalogPublishPanel />}
    </AppShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<AppShell>{null}</AppShell>}>
      <SelectContent />
    </Suspense>
  );
}
