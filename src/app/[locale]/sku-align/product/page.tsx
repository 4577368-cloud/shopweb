"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "@/lib/ui/icons";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { HubAwareSidebar } from "@/components/workbench/hub-aware-sidebar";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { SkuProductWorkbench } from "@/components/sku-align/sku-product-workbench";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useOnboarding } from "@/context/onboarding-context";
import { api, invalidateSkuOverviewCache, readableError } from "@/lib/api";
import type { DrawerPhase } from "@/lib/sku-align/drawer-helpers";
import {
  parseSkuAlignTabParam,
  readSkuAlignProductTabFromLocation,
  SKU_ALIGN_PRODUCT_PARAM,
  SKU_ALIGN_TAB_PARAM,
  SKU_ALIGN_VARIANT_PARAM,
  skuAlignHref,
  syncSkuAlignProductTabInUrl,
} from "@/lib/sku-align/deep-link";
import { markScanned } from "@/lib/scan/gate";
import {
  peekSkuProductHandoff,
  takeSkuProductHandoff,
} from "@/lib/sku-align/overview-handoff";
import {
  peekSkuProductSession,
  setSkuProductSession,
} from "@/lib/sku-align/product-session-cache";
import { readProductSourceIdentity } from "@/lib/product-source-identity";
import { resolveSkuDetailUrl } from "@/lib/source-sku-matrix";
import type { PricingTemplate, SkuProductOverview } from "@/lib/types";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

function resolveCachedProduct(
  shopName: string,
  productId: string
): SkuProductOverview | null {
  if (!productId) return null;
  return (
    peekSkuProductHandoff(shopName, productId) ??
    peekSkuProductSession(shopName, productId)
  );
}

function SkuAlignProductContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shop, showToast, isAuthorized, authBootstrapping } = useOnboarding();
  const shopName = shop.name;
  const wb = useWorkbenchPage("sku-align");
  const t = useT();
  const locale = useLocale();

  const productId = searchParams.get(SKU_ALIGN_PRODUCT_PARAM)?.trim() ?? "";
  const tabParam = searchParams.get(SKU_ALIGN_TAB_PARAM);
  const focusVariantId = searchParams.get(SKU_ALIGN_VARIANT_PARAM)?.trim() || null;
  const [phase, setPhase] = useState<DrawerPhase>(() =>
    parseSkuAlignTabParam(tabParam)
  );

  const cachedProduct = useMemo(
    () => resolveCachedProduct(shopName, productId),
    [shopName, productId]
  );

  const [loading, setLoading] = useState(() => !cachedProduct);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<SkuProductOverview | null>(
    () => cachedProduct
  );
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(
    null
  );
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);
  const productRef = useRef<SkuProductOverview | null>(cachedProduct);
  const loadedForRef = useRef<string | null>(
    cachedProduct ? `${shopName}::${productId}` : null
  );

  const load = useCallback(
    async (opts?: { silent?: boolean; forceOverview?: boolean }) => {
      if (!productId) return;
      const silent = opts?.silent === true;
      const hasLocal =
        productRef.current?.thirdPlatformItemId === productId ||
        Boolean(peekSkuProductHandoff(shopName, productId)) ||
        Boolean(peekSkuProductSession(shopName, productId));

      if (!silent && !hasLocal) {
        setLoading(true);
      }
      setError(null);
      try {
        takeSkuProductHandoff(shopName, productId);

        const [tpl, detail] = await Promise.all([
          api.getPricingTemplate(shopName).catch(() => null),
          api.skuAlignV1ProductDetail(shopName, productId).catch(() => null),
        ]);

        let found: SkuProductOverview | null =
          productRef.current?.thirdPlatformItemId === productId
            ? productRef.current
            : resolveCachedProduct(shopName, productId);

        if (!found || opts?.forceOverview) {
          invalidateSkuOverviewCache(shopName);
          const overview = await api.getSkuOverview(shopName);
          const fresh =
            overview.find((p) => p.thirdPlatformItemId === productId) ?? null;
          if (fresh) found = fresh;
        }

        if (!found) {
          if (silent && productRef.current) {
            showToast(t("sku.refreshOverviewFailed"));
            setPricingTemplate(tpl);
            setV1Detail(detail);
            return;
          }
          setProduct(null);
          productRef.current = null;
          setError(t("sku.errNotInList"));
          return;
        }

        setProduct(found);
        productRef.current = found;
        setSkuProductSession(shopName, found);
        setPricingTemplate(tpl);
        setV1Detail(detail);
      } catch (err) {
        const message = readableError(err);
        if (silent && productRef.current) {
          showToast(message);
          return;
        }
        if (productRef.current?.thirdPlatformItemId === productId) {
          showToast(message);
          return;
        }
        setError(message);
        setProduct(null);
        productRef.current = null;
      } finally {
        setLoading(false);
      }
    },
    [shopName, productId, showToast, t]
  );

  useEffect(() => {
    if (!isAuthorized || !productId) return;
    markScanned("sku-align", shopName);

    const loadKey = `${shopName}::${productId}`;
    if (loadedForRef.current === loadKey && productRef.current) {
      void load({ silent: true });
      return;
    }

    const instant = resolveCachedProduct(shopName, productId);
    if (instant) {
      setProduct(instant);
      productRef.current = instant;
      setLoading(false);
      loadedForRef.current = loadKey;
      void load({ silent: true });
      return;
    }

    loadedForRef.current = loadKey;
    void load();
  }, [isAuthorized, productId, load, shopName]);

  /** External navigation (different product / deep link) — re-read tab from URL once. */
  useEffect(() => {
    setPhase(parseSkuAlignTabParam(tabParam));
  }, [productId, tabParam]);

  /** Browser back/forward while staying on this page. */
  useEffect(() => {
    const onPopState = () => {
      setPhase(readSkuAlignProductTabFromLocation());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goBackToList = useCallback(() => {
    markScanned("sku-align", shopName);
    router.replace(skuAlignHref());
  }, [router, shopName]);

  const setTab = useCallback(
    (next: DrawerPhase) => {
      if (!productId) return;
      setPhase(next);
      syncSkuAlignProductTabInUrl(locale, productId, {
        tab: next,
        variantId: focusVariantId,
      });
    },
    [productId, focusVariantId, locale]
  );

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

  const breadcrumbs = useMemo(
    () => [
      { label: t("nav.workbench"), href: localePath(locale, "/") },
      { label: t("products.title"), href: localePath(locale, "/products") },
      { label: t("sku.breadcrumb"), href: skuAlignHref() },
      { label: product?.title?.trim() || t("sku.compareFallback") },
    ],
    [product?.title, t, locale]
  );

  const panelTitle = t("sku.breadcrumb");

  if (authBootstrapping) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title={panelTitle} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            {t("sku.restoringAuth")}
          </div>
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  if (!isAuthorized) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title={panelTitle} breadcrumbs={breadcrumbs} {...wb.panelProps}>
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

  if (!productId) {
    return (
      <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
        <WorkbenchPanel title={panelTitle} breadcrumbs={breadcrumbs} {...wb.panelProps}>
          <EmptyState
            title={t("sku.noProductSpecified")}
            description={t("sku.noProductSpecifiedDesc")}
            action={
              <Link href={skuAlignHref()}>
                <Button size="sm" className="mt-1">
                  {t("sku.backToList")}
                </Button>
              </Link>
            }
          />
        </WorkbenchPanel>
      </WorkbenchShell>
    );
  }

  const showBlockingLoader = loading && !product;

  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />} {...wb.shellProps}>
      <WorkbenchPanel
        title={panelTitle}
        description={t("sku.panelDescription")}
        breadcrumbs={breadcrumbs}
        maxWidth={1280}
        {...wb.panelProps}
      >
        {showBlockingLoader ? (
          <div className="flex items-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            {t("sku.loadingProductSpecs")}
          </div>
        ) : error || !product ? (
          <EmptyState
            title={error ?? t("sku.errOpenWorkbench")}
            description={
              error ? t("sku.errOpenWorkbenchHint") : t("sku.productNotFound")
            }
            action={
              <Link href={skuAlignHref()}>
                <Button size="sm" className="mt-1">
                  {t("sku.backToList")}
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
            phase={phase}
            onPhaseChange={setTab}
            focusVariantId={focusVariantId}
            v1Detail={v1Detail}
            pricingTemplate={pricingTemplate}
            onSaved={() => load({ silent: true, forceOverview: true })}
            onRefreshDetail={async () => {
              try {
                setV1Detail(
                  await api.skuAlignV1ProductDetail(shopName, productId)
                );
              } catch {
                setV1Detail(null);
              }
            }}
            onBack={goBackToList}
            showToast={showToast}
          />
        )}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

function SkuAlignProductPageFallback() {
  const t = useT();
  return (
    <WorkbenchShell sidebar={<HubAwareSidebar />}>
      <WorkbenchPanel title={t("sku.breadcrumb")}>
        <div className="flex items-center gap-2 py-16 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          {t("sku.loading")}
        </div>
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

export default function SkuAlignProductPage() {
  return (
    <Suspense fallback={<SkuAlignProductPageFallback />}>
      <SkuAlignProductContent />
    </Suspense>
  );
}
