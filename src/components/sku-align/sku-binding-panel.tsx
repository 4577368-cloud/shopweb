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
} from "lucide-react";
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
import { confirmProductNeedsReview } from "@/lib/sku-align/batch-confirm";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import { buildGapSummaryText } from "@/lib/sku-align/drawer-helpers";
import { skuAlignProductWorkbenchHref } from "@/lib/sku-align/deep-link";
import { stashSkuProductHandoff } from "@/lib/sku-align/overview-handoff";
import {
  deriveVariantDisplayState,
  countNeedsReview,
  countUnbound,
  filterVariants,
  hasIssues,
  type SkuFilterMode,
  type SkuVariantDisplayState,
} from "@/lib/sku-align/display";

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
function autoAlignError(err: unknown): string {
  let raw = "";
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    raw = body?.message ?? err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  }
  if (raw.startsWith("NOT_BOUND")) return "该商品尚未绑定货源，请先在「智能选品」确认匹配";
  if (raw.startsWith("NO_VARIANT")) return "该商品无可用变体，请重新同步商品";
  if (raw.startsWith("NO_OFFER_SKU")) return "该 Tangbuy 货源未返回可用 SKU";
  if (raw.startsWith("AOP_CRED_MISSING")) return "Tangbuy 货源平台凭证未配置";
  if (raw.startsWith("AOP_TOKEN_INVALID")) return "Tangbuy 货源授权已失效，请重新授权";
  if (isOfferNotFoundMessage(raw)) return "该货源已下架或无效，请换一个候选";
  if (raw.startsWith("GATEWAY_BUSY")) return "Tangbuy 货源服务繁忙，请稍后重试";
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "所选 SKU 不在货源规格表中";
  }
  if (raw.startsWith("NO_UNRESOLVED_VARIANT")) return "当前没有需要补充货源的变体";
  if (raw.startsWith("SUPPLEMENT_LIMIT")) return "V1 每个商品仅支持 1 个补充货源";
  if (raw.startsWith("SUPPLEMENT_SAME_AS_PRIMARY")) return "补充货源不能与主货源相同";
  return raw || "自动对齐失败";
}

function MatchStatePill({
  state,
  bound,
  total,
}: {
  state: ProductMatchState;
  bound: number;
  total: number;
}) {
  if (state === "full") {
    return (
      <Badge variant="success">
        全部匹配 {bound}/{total}
      </Badge>
    );
  }
  if (state === "partial") {
    return (
      <Badge variant="warning">
        部分匹配 {bound}/{total}
      </Badge>
    );
  }
  return <Badge variant="outline">未匹配</Badge>;
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

function buildVariantPreviewLine(variants: SkuVariant[]): string {
  const preview = variants.slice(0, 4).map((v) => v.optionLabel);
  const rest = variants.length - preview.length;
  return `${preview.join(" · ")}${rest > 0 ? ` 等 ${variants.length} 个规格` : ""}`;
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
  const total = product.variants.length;
  const bound = boundVariantCount(product);
  const state = productMatchState(product);

  const [aligning, setAligning] = useState(false);
  const [ackingAll, setAckingAll] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);
  const [v1DetailLoading, setV1DetailLoading] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const [cardVisible, setCardVisible] = useState(false);

  const productId = product.thirdPlatformItemId;
  const stashHandoff = () => stashSkuProductHandoff(shopName, product);
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
  const busy = aligning || ackingAll;

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
          `自动对齐完成：${status.matchedCount} 个变体已对齐 · 建议 ${status.suggestedCount}`
        );
        await onAligned();
        await refreshV1Detail();
      } else {
        showToast("对齐任务未受理，请稍后重试或点标题进入对照页手动调整");
      }
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAligning(false);
    }
  };

  const showSupplementHint =
    v1Detail && !v1DetailLoading && needsSupplementSource(v1Detail);
  const supplementHint = v1Detail ? buildSupplementSourceHint(v1Detail) : null;
  const noSourceCount = v1Detail?.summary.noSourceVariants ?? 0;
  const gapSummary = buildGapSummaryText(unboundCount, noSourceCount);

  const alignedPreview = buildVariantPreviewLine(visibleVariants);
  const autoAlignedCount = visibleVariants.filter(
    (v) => deriveVariantDisplayState(v) === "active_auto"
  ).length;

  const ackAll = async () => {
    if (busy || pendingCount === 0) return;
    setAckingAll(true);
    setAlignError(null);
    try {
      const result = await confirmProductNeedsReview(shopName, product);
      const confirmed = result.confirmedCount ?? 0;
      if (confirmed <= 0) {
        showToast("没有可确认的待确认建议");
        return;
      }
      showToast(`已接受本商品 ${confirmed} 个 AI 建议`);
      await onAligned();
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAckingAll(false);
    }
  };

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
          aria-label={`查看 ${product.title ?? productId} 的 SKU 对照`}
        >
          <Thumb
            src={product.imageUrl}
            alt={product.title ?? productId}
            className="h-12 w-12"
          />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-1 text-sm font-semibold leading-5 text-ink">
              {product.title ?? "(无标题)"}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[11px] text-ink-subtle">{total} 个变体</span>
              <MatchStatePill state={state} bound={bound} total={total} />
              {pendingCount > 0 ? (
                <Badge variant="warning">待确认 {pendingCount}</Badge>
              ) : null}
              {unboundCount > 0 ? (
                <Badge variant="outline">未匹配 {unboundCount}</Badge>
              ) : null}
              {manualCount > 0 ? (
                <Badge variant="success">手动 {manualCount}</Badge>
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
                title="整款替换主货源"
                aria-label="整款替换主货源"
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
                title="为缺口规格补充货源"
                aria-label="为缺口规格补充货源"
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
            title="按 Tangbuy 货源 SKU 矩阵自动对齐绑定"
            aria-label={aligning ? "对齐中" : "自动对齐 SKU"}
          >
            {aligning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
          </button>
          {pendingCount > 0 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => void ackAll()}
              disabled={busy}
              title="接受该商品下全部待确认的 AI 建议"
            >
              {ackingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              接受（{pendingCount}）
            </Button>
          ) : null}
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
          aria-label="进入补充货源流程"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-900">需要补充货源</p>
            <p className="text-[10px] text-amber-700/80">{supplementHint}</p>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-amber-900">
            去补充
            <ChevronRight className="ml-0.5 inline h-3.5 w-3.5" />
          </span>
        </Link>
      ) : showSupplementHint && supplementHint ? (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-900">需要补充货源</p>
            <p className="text-[10px] text-amber-700/80">{supplementHint}</p>
          </div>
        </div>
      ) : null}

      {canManualPick && visibleVariants.length > 0 ? (
        <Link
          href={workbenchHref}
          onClick={stashHandoff}
          className="flex w-full items-center gap-2 border-t border-hairline/60 px-4 py-2.5 transition-colors hover:bg-surface-muted/40"
          aria-label="查看 SKU 对照"
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
          {state === "full" || bound > 0 ? (
            <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
              已对齐 {bound}
            </Badge>
          ) : null}
          <span className="shrink-0 text-[10px] text-ink-subtle">
            {manualCount > 0
              ? `自动 ${autoAlignedCount} · 手动 ${manualCount}`
              : pendingCount > 0
                ? `待确认 ${pendingCount}`
                : unboundCount > 0
                  ? `未匹配 ${unboundCount}`
                  : "全部自动对齐"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
            {alignedPreview}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-brand">查看对照</span>
        </Link>
      ) : null}
    </article>
  );
}
