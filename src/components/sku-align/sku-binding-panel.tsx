"use client";

import Link from "next/link";
import { ThumbImage } from "@/components/ui/thumb-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronRight,
  ImageOff,
  Loader2,
  Plus,
  Wand2,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { isOfferNotFoundMessage } from "@/lib/batch-link/match-errors";
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
  enqueueSkuAlignRun,
  needsSupplementSource,
} from "@/lib/sku-align-v1";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import { buildGapSummaryText } from "@/lib/sku-align/drawer-helpers";
import { skuAlignProductWorkbenchHref } from "@/lib/sku-align/deep-link";
import { stashSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import { setSkuProductSession } from "@/lib/sku-align/product-session-cache";
import {
  deriveVariantDisplayState,
  countActiveAuto,
  countNeedsReview,
  countUnbound,
  filterVariants,
  hasIssues,
  type SkuFilterMode,
  type SkuVariantDisplayState,
} from "@/lib/sku-align/display";
import { useT } from "@/i18n/LocaleProvider";

export type ProductMatchState = "full" | "partial" | "none";

/** Derived per-product state from the real overview (all / some / no variants bound). */
export function productMatchState(product: SkuProductOverview): ProductMatchState {
  const total = product.variants.length;
  const bound = product.variants.filter((v) => v.bound).length;
  if (total > 0 && bound === total) return "full";
  if (bound > 0) return "partial";
  return "none";
}

export type { SkuFilterMode, SkuVariantDisplayState };
export {
  countNeedsReview,
  countUnbound,
  deriveVariantDisplayState,
  filterProducts,
  hasIssues,
  isFullyResolved,
  matchesSkuProductSearch,
  sortProductsForWorkbench,
} from "@/lib/sku-align/display";

export function boundVariantCount(product: SkuProductOverview): number {
  return product.variants.filter((v) => v.bound).length;
}

/** Map auto-align backend errors to a readable message by machine-code prefix. */
function autoAlignError(
  err: unknown,
  t: ReturnType<typeof useT>
): string {
  let raw = "";
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    raw = body?.message ?? err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  }
  if (raw.startsWith("NOT_BOUND")) return t("skuBinding.errNotBound");
  if (raw.startsWith("NO_VARIANT")) return t("skuBinding.errNoVariant");
  if (raw.startsWith("NO_OFFER_SKU")) return t("skuBinding.errNoOfferSku");
  if (raw.startsWith("AOP_CRED_MISSING")) return t("skuBinding.errAopCred");
  if (raw.startsWith("AOP_TOKEN_INVALID")) return t("skuBinding.errAopToken");
  if (isOfferNotFoundMessage(raw)) return t("skuBinding.errOfferGone");
  if (raw.startsWith("GATEWAY_BUSY")) return t("skuBinding.errGatewayBusy");
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":")
      ? raw.split(":").slice(1).join(":").trim()
      : t("skuBinding.errSkuNotInMatrix");
  }
  if (raw.startsWith("NO_UNRESOLVED_VARIANT")) return t("skuBinding.errNoUnresolved");
  if (raw.startsWith("SUPPLEMENT_LIMIT")) return t("skuBinding.errSupplementLimit");
  if (raw.startsWith("SUPPLEMENT_SAME_AS_PRIMARY")) return t("skuBinding.errSupplementSame");
  return raw || t("skuBinding.errAutoAlignFailed");
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

const ICON_BTN =
  "relative z-10 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-hairline bg-surface text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:pointer-events-none disabled:opacity-50";

/**
 * One product row on the SKU binding list.
 * Navigation uses <Link>; async actions use <button type="button"> — never mixed on the same hit target.
 */
export function SkuProductCard({
  product,
  shopName,
  onAligned,
  showToast,
  filterMode = "all",
}: {
  product: SkuProductOverview;
  shopName: string;
  onAligned: () => Promise<void>;
  showToast: (message: string) => void;
  filterMode?: SkuFilterMode;
  pricingTemplate?: PricingTemplate | null;
}) {
  const t = useT();
  const total = product.variants.length;
  const bound = boundVariantCount(product);
  const state = productMatchState(product);

  const [aligning, setAligning] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);
  const [v1DetailLoading, setV1DetailLoading] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const productId = product.thirdPlatformItemId;
  const stashHandoff = () => {
    stashSkuProductHandoff(shopName, product);
    setSkuProductSession(shopName, product);
  };
  const workbenchHref = skuAlignProductWorkbenchHref(productId);
  const replaceHref = skuAlignProductWorkbenchHref(productId, { tab: "replace" });
  const supplementHref = skuAlignProductWorkbenchHref(productId, { tab: "supplement" });

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

  const pendingCount = countNeedsReview(product);
  const unboundCount = countUnbound(product);
  const manualCount = product.variants.filter(
    (v) => deriveVariantDisplayState(v) === "manual_active"
  ).length;

  const visibleVariants = useMemo(
    () => filterVariants(product.variants, filterMode),
    [product.variants, filterMode]
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
  const busy = aligning;

  const runAutoAlign = async () => {
    if (busy) return;
    setAligning(true);
    setAlignError(null);
    try {
      const status = await enqueueSkuAlignRun(shopName, {
        triggerType: "MANUAL_REFRESH",
        scopeType: "PRODUCT",
        scopeIds: [productId],
        forceRefresh: true,
      });
      if (status) {
        showToast(
          t("skuBinding.alignDone", {
            matched: status.matchedCount,
            suggested: status.suggestedCount,
          })
        );
        await onAligned();
        await refreshV1Detail();
      } else {
        showToast(t("skuBinding.alignNotAccepted"));
      }
    } catch (err) {
      setAlignError(autoAlignError(err, t));
    } finally {
      setAligning(false);
    }
  };

  const showSupplementHint =
    v1Detail && !v1DetailLoading && needsSupplementSource(v1Detail);
  const supplementHint = v1Detail ? buildSupplementSourceHint(t, v1Detail) : null;
  const noSourceCount = v1Detail?.summary.noSourceVariants ?? 0;
  const gapSummary = buildGapSummaryText(t, unboundCount, noSourceCount);

  const alignedPreview = buildVariantPreviewLine(visibleVariants, t);

  return (
    <article
      ref={cardRef}
      className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card"
      {...(hasIssues(product) ? { "data-sku-issue-product": productId } : {})}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Title block: only thumb + text navigate to workbench */}
        <Link
          href={workbenchHref}
          onClick={stashHandoff}
          className="flex min-w-0 flex-1 items-start gap-3 text-left hover:opacity-90"
          aria-label={t("skuBinding.viewSkuAria", {
            title: product.title ?? productId,
          })}
        >
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
        </Link>

        {/* Actions: isolated from title link — z-10 so clicks never fall through */}
        <div className="relative z-10 flex shrink-0 items-center gap-1.5">
          {canManualPick ? (
            <>
              <Link
                href={replaceHref}
                className={ICON_BTN}
                title={t("skuBinding.replaceSource")}
                aria-label={t("skuBinding.replaceSource")}
                onClick={(e) => {
                  if (busy) e.preventDefault();
                  else stashHandoff();
                }}
                aria-disabled={busy}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={supplementHref}
                className={ICON_BTN}
                title={t("skuBinding.supplementSource")}
                aria-label={t("skuBinding.supplementSource")}
                onClick={(e) => {
                  if (busy) e.preventDefault();
                  else stashHandoff();
                }}
                aria-disabled={busy}
              >
                <Plus className="h-3.5 w-3.5" />
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => void runAutoAlign()}
            disabled={busy}
            title={aligning ? t("skuBinding.aligning") : t("skuBinding.autoAlign")}
            aria-label={aligning ? t("skuBinding.aligning") : t("skuBinding.autoAlign")}
          >
            {aligning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {alignError ? (
        <div className="mx-4 mb-3 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {alignError}
        </div>
      ) : null}

      {showSupplementHint && supplementHint && canManualPick ? (
        <Link
          href={supplementHref}
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

      {canManualPick && visibleVariants.length > 0 ? (
        <Link
          href={workbenchHref}
          onClick={stashHandoff}
          className="flex w-full items-center gap-2 border-t border-hairline/60 px-4 py-2.5 transition-colors hover:bg-surface-muted/40"
          aria-label={t("skuBinding.viewSkuMapping")}
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
          {state === "full" || bound > 0 ? (
            <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
              {t("skuBinding.alignedCount", { count: bound })}
            </Badge>
          ) : null}
          <span className="shrink-0 text-[10px] text-ink-subtle">
            {manualCount > 0
              ? t("skuBinding.statusAutoManual", {
                  auto: countActiveAuto(product),
                  manual: manualCount,
                })
              : pendingCount > 0
                ? t("skuBinding.pendingConfirm", { count: pendingCount })
                : unboundCount > 0
                  ? t("skuBinding.unboundCount", { count: unboundCount })
                  : t("skuBinding.allAutoAligned")}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
            {alignedPreview}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-brand">
            {t("skuBinding.viewMapping")}
          </span>
        </Link>
      ) : null}
    </article>
  );
}
