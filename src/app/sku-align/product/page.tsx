"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { StepSidebar } from "@/components/workbench/step-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { SkuProductWorkbench } from "@/components/sku-align/sku-product-workbench";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnboarding } from "@/context/onboarding-context";
import { api, readableError } from "@/lib/api";
import type { DrawerPhase } from "@/lib/sku-align/drawer-helpers";
import {
  parseSkuAlignTabParam,
  SKU_ALIGN_PRODUCT_PARAM,
  SKU_ALIGN_TAB_PARAM,
  SKU_ALIGN_VARIANT_PARAM,
  skuAlignHref,
  skuAlignProductWorkbenchHref,
} from "@/lib/sku-align/deep-link";
import { takeSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import { readProductSourceIdentity } from "@/lib/product-source-identity";
import { resolveSkuDetailUrl } from "@/lib/source-sku-matrix";
import type { PricingTemplate, SkuProductOverview } from "@/lib/types";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";

function SkuAlignProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, showToast, isAuthorized, authSessionReady } = useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("sku-align");

  const productId = searchParams.get(SKU_ALIGN_PRODUCT_PARAM)?.trim() ?? "";
  const tab = parseSkuAlignTabParam(searchParams.get(SKU_ALIGN_TAB_PARAM));
  const focusVariantId = searchParams.get(SKU_ALIGN_VARIANT_PARAM)?.trim() || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<SkuProductOverview | null>(null);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(null);
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    setError(null);
    try {
      const handed = takeSkuProductHandoff(shopName, productId);
      const [tpl, detail] = await Promise.all([
        api.getPricingTemplate(shopName).catch(() => null),
        api.skuAlignV1ProductDetail(shopName, productId).catch(() => null),
      ]);

      if (handed) {
        setProduct(handed);
        setPricingTemplate(tpl);
        setV1Detail(detail);
        return;
      }

      const overview = await api.getSkuOverview(shopName);
      const found =
        overview.find((p) => p.thirdPlatformItemId === productId) ?? null;
      if (!found) {
        setProduct(null);
        setError("商品不在 SKU 绑定列表中，可能尚未完成货源匹配。");
        return;
      }
      setProduct(found);
      setPricingTemplate(tpl);
      setV1Detail(detail);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [shopName, productId]);

  useEffect(() => {
    if (!isAuthorized || !productId) return;
    void load();
  }, [isAuthorized, productId, load]);

  const storedSource = product
    ? readProductSourceIdentity(shopName, product.thirdPlatformItemId)
    : null;
  const detailUrl = product
    ? resolveSkuDetailUrl(
        storedSource?.tangbuyCatalogUrl ??
          storedSource?.offerDetailUrl ??
          product.detailUrl,
        storedSource?.internalGoodsId ??
          storedSource?.offerId1688 ??
          product.tangbuyProductId
      )
    : null;
  const tangbuyProductId = product
    ? storedSource?.internalGoodsId?.trim() ||
      storedSource?.offerId1688?.trim() ||
      product.tangbuyProductId?.trim() ||
      product.variants.find((v) => v.bound?.tangbuyProductId)?.bound
        ?.tangbuyProductId?.trim() ||
      null
    : null;

  const setTab = useCallback(
    (phase: DrawerPhase) => {
      if (!productId) return;
      router.replace(
        skuAlignProductWorkbenchHref(productId, {
          tab: phase,
          variantId: focusVariantId ?? undefined,
        }),
        { scroll: false }
      );
    },
    [router, productId, focusVariantId]
  );

  const breadcrumbs = useMemo(
    () => [
      { label: "工作台", href: "/" },
      { label: "智能选品", href: "/products" },
      { label: "SKU 绑定", href: skuAlignHref() },
      { label: product?.title?.trim() || "商品对照" },
    ],
    [product?.title]
  );

  if (!authSessionReady) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title="SKU 绑定" breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            正在恢复店铺授权…
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title="SKU 绑定" breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <EmptyState
            title="尚未连接店铺"
            description="完成授权后即可进行 SKU 绑定。"
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

  if (!productId) {
    return (
      <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title="SKU 绑定" breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <EmptyState
            title="未指定商品"
            description="请从 SKU 绑定列表选择一个商品。"
            action={
              <Link href={skuAlignHref()}>
                <Button size="sm" className="mt-1">
                  返回列表
                </Button>
              </Link>
            }
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  return (
    <WorkbenchShell sidebar={<StepSidebar />} {...wb.shellProps}>
      <WorkbenchPanel
        title="SKU 绑定"
        description="对照店铺变体与货源规格；整款换绑与补充货源为独立流程。"
        breadcrumbs={breadcrumbs}
        maxWidth={1280}
        {...wb.panelProps}
      >
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            正在加载商品与货源规格…
          </div>
        ) : error || !product ? (
          <EmptyState
            title="无法打开对照工作台"
            description={error ?? "商品不存在"}
            action={
              <Link href={skuAlignHref()}>
                <Button size="sm" className="mt-1">
                  返回列表
                </Button>
              </Link>
            }
          />
        ) : (
          <SkuProductWorkbench
            product={product}
            shopName={shopName}
            detailUrl={detailUrl}
            tangbuyProductId={tangbuyProductId}
            phase={tab}
            onPhaseChange={setTab}
            focusVariantId={focusVariantId}
            v1Detail={v1Detail}
            pricingTemplate={pricingTemplate}
            onSaved={load}
            onRefreshDetail={async () => {
              try {
                setV1Detail(
                  await api.skuAlignV1ProductDetail(shopName, productId)
                );
              } catch {
                setV1Detail(null);
              }
            }}
            onBack={() => router.push(skuAlignHref())}
            showToast={showToast}
          />
        )}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function SkuAlignProductPage() {
  return (
    <Suspense
      fallback={
        <WorkbenchShell sidebar={<StepSidebar />}>
          <WorkbenchPanel title="SKU 绑定">
            <div className="flex items-center gap-2 py-16 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              加载中…
            </div>
          </WorkbenchPanel>
        </WorkbenchShell>
      }
    >
      <SkuAlignProductContent />
    </Suspense>
  );
}
