"use client";

import Link from "next/link";
import { ThumbImage } from "@/components/ui/thumb-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ImageOff,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { resolveSkuDetailUrl } from "@/lib/source-sku-matrix";
import { readProductSourceIdentity } from "@/lib/product-source-identity";
import type {
  PricingTemplate,
  SkuProductOverview,
  SkuVariant,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  buildSupplementSourceHint,
  needsSupplementSource,
} from "@/lib/sku-align-v1";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import { buildGapSummaryText } from "@/lib/sku-align/drawer-helpers";
import { mergeV1DetailIntoProductOverview } from "@/lib/sku-align/merge-v1-overview";
import { skuAlignProductWorkbenchHref } from "@/lib/sku-align/deep-link";
import { stashSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import { setSkuProductSession } from "@/lib/sku-align/product-session-cache";
import {
  deriveVariantDisplayState,
  countNeedsReview,
  countUnbound,
  filterVariants,
  hasIssues,
  isFullyResolved,
  isResolvedVariantState,
  type SkuFilterMode,
  type SkuVariantDisplayState,
} from "@/lib/sku-align/display";
import { useT } from "@/i18n/LocaleProvider";

export type ProductMatchState = "full" | "partial" | "none";

/** Derived per-product state from display resolution (not raw bound row count). */
export function productMatchState(product: SkuProductOverview): ProductMatchState {
  const total = product.variants.length;
  if (total === 0) return "none";
  if (isFullyResolved(product)) return "full";
  const resolved = product.variants.filter((v) =>
    isResolvedVariantState(deriveVariantDisplayState(v))
  ).length;
  if (resolved === 0) return "none";
  return "partial";
}

export type { SkuFilterMode, SkuVariantDisplayState };
export {
  countNeedsReview,
  countUnbound,
  deriveVariantDisplayState,
  filterProducts,
  hasIssues,
  isFullyResolved,
  isResolvedVariantState,
  matchesSkuProductSearch,
  sortProductsForWorkbench,
} from "@/lib/sku-align/display";

export function boundVariantCount(product: SkuProductOverview): number {
  return product.variants.filter((v) => v.bound).length;
}

function MatchStatePill({
  state,
  bound,
  total,
  t,
}: {
  state: ProductMatchState;
  bound: number;
  total: number;
  t: ReturnType<typeof useT>;
}) {
  if (state === "full") {
    return (
      <Badge variant="success">
        {t("skuBinding.fullMatch", { bound, total })}
      </Badge>
    );
  }
  if (state === "partial") {
    return (
      <Badge variant="warning">
        {t("skuBinding.partialMatch", { bound, total })}
      </Badge>
    );
  }
  return <Badge variant="outline">{t("skuBinding.unmatched")}</Badge>;
}

/** Small square thumbnail with graceful "no image" fallback. */
function Thumb({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted",
        className
      )}
    >
      {src ? (
        <ThumbImage
          src={src}
          alt={alt}
          fill
          sizes="72px"
          pixelWidth={144}
          className="object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-subtle">
          <ImageOff className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function buildVariantPreviewLine(
  variants: SkuVariant[],
  t: ReturnType<typeof useT>
): string {
  const preview = variants.slice(0, 4).map((v) => v.optionLabel);
  const rest = variants.length - preview.length;
  return `${preview.join(" · ")}${
    rest > 0 ? t("skuBinding.variantPreviewMore", { count: variants.length }) : ""
  }`;
}

/**
 * One product row on the SKU binding list.
 */
export function SkuProductCard({
  product,
  shopName,
  filterMode = "all",
}: {
  product: SkuProductOverview;
  shopName: string;
  onAligned?: () => Promise<void>;
  showToast?: (message: string) => void;
  filterMode?: SkuFilterMode;
  pricingTemplate?: PricingTemplate | null;
}) {
  const t = useT();
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);
  const [v1DetailLoading, setV1DetailLoading] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const mergedProduct = useMemo(
    () => mergeV1DetailIntoProductOverview(product, v1Detail),
    [product, v1Detail]
  );
  const total = mergedProduct.variants.length;
  const bound = mergedProduct.variants.filter((v) =>
    isResolvedVariantState(deriveVariantDisplayState(v))
  ).length;
  const state = productMatchState(mergedProduct);

  const productId = product.thirdPlatformItemId;
  const stashHandoff = () => {
    stashSkuProductHandoff(shopName, product);
    setSkuProductSession(shopName, product);
  };
  const workbenchHref = skuAlignProductWorkbenchHref(productId);

  const refreshV1Detail = async () => {
    setV1DetailLoading(true);
    try {
      setV1Detail(await api.skuAlignV1ProductDetail(shopName, productId));
    } catch {
      setV1Detail(null);
    } finally {
      setV1DetailLoading(false);
    }
  };

  const pendingCount = countNeedsReview(mergedProduct);
  const unboundCount = countUnbound(mergedProduct);
  const manualCount = mergedProduct.variants.filter(
    (v) => deriveVariantDisplayState(v) === "manual_active"
  ).length;

  const visibleVariants = useMemo(
    () => filterVariants(mergedProduct.variants, filterMode),
    [mergedProduct.variants, filterMode]
  );

  useEffect(() => {
    setV1Detail(null);
  }, [productId]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setCardVisible(true);
      },
      { rootMargin: "120px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mightNeedV1Detail =
    state !== "full" || unboundCount > 0 || pendingCount > 0;

  useEffect(() => {
    if (!cardVisible || !mightNeedV1Detail || v1Detail || v1DetailLoading) return;
    void refreshV1Detail();
  }, [cardVisible, mightNeedV1Detail, productId, shopName]);

  const storedSource = readProductSourceIdentity(shopName, productId);
  const productDetailUrl = resolveSkuDetailUrl(
    storedSource?.tangbuyCatalogUrl ??
      storedSource?.offerDetailUrl ??
      product.detailUrl,
    storedSource?.internalGoodsId ??
      storedSource?.offerId1688 ??
      product.tangbuyProductId
  );
  const productTangbuyId =
    storedSource?.internalGoodsId?.trim() ||
    storedSource?.offerId1688?.trim() ||
    product.tangbuyProductId?.trim() ||
    product.variants.find((v) => v.bound?.tangbuyProductId)?.bound?.tangbuyProductId?.trim() ||
    null;
  const canManualPick = Boolean(productDetailUrl && productTangbuyId);

  const showSupplementHint =
    v1Detail &&
    !v1DetailLoading &&
    needsSupplementSource(v1Detail) &&
    (unboundCount > 0 || (v1Detail.summary.noSourceVariants ?? 0) > 0);
  const supplementHint = v1Detail ? buildSupplementSourceHint(t, v1Detail) : null;
  const noSourceCount = v1Detail?.summary.noSourceVariants ?? 0;
  const gapSummary = buildGapSummaryText(t, unboundCount, noSourceCount);

  const alignedPreview = buildVariantPreviewLine(visibleVariants, t);

  return (
    <article
      ref={cardRef}
      className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card"
      {...(hasIssues(mergedProduct) ? { "data-sku-issue-product": productId } : {})}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Thumb
            src={product.imageUrl}
            alt={product.title ?? productId}
            className="h-12 w-12"
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-sm font-semibold leading-5 text-ink">
              {product.title ?? t("skuBinding.noTitle")}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] text-ink-subtle">
                {t("skuBinding.variantCount", { count: total })}
              </span>
              <MatchStatePill state={state} bound={bound} total={total} t={t} />
              {pendingCount > 0 ? (
                <Badge variant="warning">
                  {t("skuBinding.pendingConfirm", { count: pendingCount })}
                </Badge>
              ) : null}
              {unboundCount > 0 ? (
                <Badge variant="outline">
                  {t("skuBinding.unboundCount", { count: unboundCount })}
                </Badge>
              ) : null}
              {manualCount > 0 ? (
                <Badge variant="success">
                  {t("skuBinding.manualCount", { count: manualCount })}
                </Badge>
              ) : null}
              {gapSummary ? (
                <p className="mt-1 text-[11px] text-amber-800">{gapSummary}</p>
              ) : null}
            </div>
          </div>
        </div>

        <Link
          href={workbenchHref}
          onClick={stashHandoff}
          className="relative z-10 shrink-0 self-center"
        >
          <Button size="sm" aria-label={t("skuBinding.viewSkuMapping")}>
            {t("skuBinding.viewMapping")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {showSupplementHint && supplementHint && canManualPick ? (
        <Link
          href={workbenchHref}
          onClick={stashHandoff}
          className="mx-4 mb-3 flex items-center gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/50 px-3 py-2.5 transition-colors hover:bg-amber-50"
          aria-label={t("skuBinding.enterSupplement")}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-900">
              {t("skuBinding.needSupplement")}
            </p>
            <p className="text-[10px] text-amber-700/80">{supplementHint}</p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-amber-900">
            {t("skuBinding.goSupplement")}
            <ChevronRight className="ml-0.5 inline h-3.5 w-3.5" />
          </span>
        </Link>
      ) : showSupplementHint && supplementHint ? (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-900">
              {t("skuBinding.needSupplement")}
            </p>
            <p className="text-[10px] text-amber-700/80">{supplementHint}</p>
          </div>
        </div>
      ) : null}

      {canManualPick && visibleVariants.length > 0 && alignedPreview ? (
        <p className="border-t border-hairline/60 px-4 py-2 text-[11px] text-ink-muted">
          {alignedPreview}
        </p>
      ) : null}
    </article>
  );
}
