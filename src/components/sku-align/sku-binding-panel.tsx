"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Hand,
  ImageOff,
  Loader2,
  MoveRight,
  RefreshCw,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import {
  fetchSourceSkuMatrixResult,
  needsOfferDetailFallback,
  resolveBoundSkuDisplay,
  resolveSkuDetailUrl,
  type SourceSkuRow,
} from "@/lib/source-sku-matrix";
import type {
  OfferDetail,
  PricingTemplate,
  SkuProductOverview,
  SkuVariant,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatShopListingPrice } from "@/lib/purchase-cost-display";
import {
  buildSupplementSourceHint,
  confirmSuggestionsWithFallback,
  enqueueSkuAlignRun,
  needsSupplementSource,
  pollSkuAlignRun,
  unbindWithFallback,
} from "@/lib/sku-align-v1";
import { confirmProductNeedsReview } from "@/lib/sku-align/batch-confirm";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import { SkuManualMatchDrawer } from "@/components/sku-align/sku-manual-match-drawer";
import { buildGapSummaryText } from "@/lib/sku-align/drawer-helpers";
import type { DrawerPhase } from "@/lib/sku-align/drawer-helpers";
import {
  deriveDisplayStateFromBinding,
  deriveVariantDisplayState,
  countNeedsReview,
  countUnbound,
  DISPLAY_STATE_LABELS,
  filterVariants,
  hasIssues,
  partitionVariantsForDisplay,
  shouldDefaultExpand,
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
  if (raw.startsWith("GATEWAY_BUSY")) return "Tangbuy 货源服务繁忙，请稍后重试";
  if (raw.startsWith("SKU_NOT_IN_MATRIX")) {
    return raw.includes(":") ? raw.split(":").slice(1).join(":").trim() : "所选 SKU 不在货源规格表中";
  }
  if (raw.startsWith("NO_UNRESOLVED_VARIANT")) return "当前没有需要补充货源的变体";
  if (raw.startsWith("SUPPLEMENT_LIMIT")) return "V1 每个商品仅支持 1 个补充货源";
  if (raw.startsWith("SUPPLEMENT_SAME_AS_PRIMARY")) return "补充货源不能与主货源相同";
  return raw || "自动对齐失败";
}

/** RULE/AI bindings come from S1-b1 auto-align; IMAGE from A3-2b image confirm. */
function isAutoAligned(source?: string | null): boolean {
  return source === "RULE" || source === "AI";
}

function isManualBinding(source?: string | null): boolean {
  return source === "MANUAL";
}

function isImageBinding(source?: string | null): boolean {
  return source === "IMAGE" || source === "CATALOG";
}

/** Middle-column status badge — 4-state display model. */
function BindingStatusBadge({ bound }: { bound?: SkuVariant["bound"] | null }) {
  const state = deriveDisplayStateFromBinding(bound);
  switch (state) {
    case "unbound":
      return <Badge variant="outline">{DISPLAY_STATE_LABELS.unbound}</Badge>;
    case "manual_active":
      return <Badge variant="success">{DISPLAY_STATE_LABELS.manual_active}</Badge>;
    case "needs_review":
      return <Badge variant="warning">{DISPLAY_STATE_LABELS.needs_review}</Badge>;
    case "active_auto":
    default:
      return <Badge variant="success">{DISPLAY_STATE_LABELS.active_auto}</Badge>;
  }
}

function bindingStatusHint(
  bound?: SkuVariant["bound"] | null
): string | null {
  switch (deriveDisplayStateFromBinding(bound)) {
    case "unbound":
      return "需在当前货源规格表中选择对应项";
    case "manual_active":
      return "你已手动选择，无需再确认";
    case "needs_review":
      return "系统推测，可接受 AI 或换一个";
    case "active_auto":
      return bound ? matchReason(bound) : null;
    default:
      return bound ? matchReason(bound) : null;
  }
}

function bindingScoreLine(bound: NonNullable<SkuVariant["bound"]>): string | null {
  const state = deriveDisplayStateFromBinding(bound);
  if (state === "manual_active") return "手动确认";
  if (state === "needs_review") return `建议匹配度 ${formatScore(bound.matchScore)}`;
  if (state === "active_auto") {
    if (isAutoAligned(bound.matchSource)) {
      return `匹配度 ${formatScore(bound.matchScore)}`;
    }
    if (isImageBinding(bound.matchSource)) {
      return `相似度 ${formatScore(bound.matchScore)}`;
    }
  }
  return formatScore(bound.matchScore) !== "—"
    ? `相似度 ${formatScore(bound.matchScore)}`
    : null;
}

/** Similarity score may be a 0–1 ratio or an absolute index; render defensively. */
function formatScore(score?: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return String(Math.round(score));
}

/** One short, human reason for audit / image bindings. */
function matchReason(bound: NonNullable<SkuVariant["bound"]>): string {
  if (isManualBinding(bound.matchSource)) return "手动映射";
  if (isAutoAligned(bound.matchSource)) return "按规格自动对齐";
  if (bound.querySource === "LLM") return "AI 识图匹配";
  if (bound.querySource === "TITLE") return "按标题图搜匹配";
  return "按原图图搜匹配";
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

/**
 * Collapsed summary for already-aligned variants — keeps multi-SKU cards scannable.
 */
function ResolvedVariantsSummary({
  variants,
  expanded,
  onToggle,
  children,
}: {
  variants: SkuVariant[];
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const autoCount = variants.filter(
    (v) => deriveVariantDisplayState(v) === "active_auto"
  ).length;
  const manualCount = variants.length - autoCount;
  const preview = variants.slice(0, 4).map((v) => v.optionLabel);
  const rest = variants.length - preview.length;

  return (
    <div className="border-t border-hairline/60">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-0.5 py-2 text-left hover:bg-surface-muted/50"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-subtle transition-transform",
            expanded && "rotate-90"
          )}
        />
        <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
          已对齐 {variants.length}
        </Badge>
        <span className="shrink-0 text-[10px] text-ink-subtle">
          {manualCount > 0
            ? `自动 ${autoCount} · 手动 ${manualCount}`
            : "全部自动对齐"}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
          {preview.join(" · ")}
          {rest > 0 ? ` 等 ${variants.length} 个规格` : ""}
        </span>
      </button>
      {expanded ? (
        <div className="divide-y divide-slate-100/80 border-t border-hairline/40">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One variant comparison row: Shopify variant (left) vs the matched 1688 SKU (right), with a compact
 * judgement in the middle. Evidence is ordered for the eye — image, name/spec, price — with codes/ids
 * demoted to muted footnotes. Source image/price/spec come from the on-demand offer detail (`offer`);
 * when it is unresolved we fall back to what the overview already carries and say so, never faking it.
 */
function VariantCompareRow({
  variant,
  product,
  offer,
  offerLoading,
  offerFallbackAttempted,
  sourceMatrix,
  sourceMatrixLoading,
  sourceMatrixError,
  onRetryEvidence,
  shopName,
  onMutated,
  showToast,
  shopCurrency,
  pricingTemplate,
  onOpenManualPicker,
  compact = false,
}: {
  variant: SkuVariant;
  product: SkuProductOverview;
  offer?: OfferDetail;
  offerLoading: boolean;
  offerFallbackAttempted: boolean;
  sourceMatrix: SourceSkuRow[];
  sourceMatrixLoading: boolean;
  sourceMatrixError: string | null;
  onRetryEvidence: () => void;
  shopName: string;
  onMutated: () => Promise<void>;
  showToast: (message: string) => void;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  onOpenManualPicker?: () => void;
  compact?: boolean;
}) {
  const bound = variant.bound;
  const displayState = deriveVariantDisplayState(variant);
  const isNeedsReview = displayState === "needs_review";
  const isUnbound = displayState === "unbound";
  const isManualActive = displayState === "manual_active";
  const isActiveAuto = displayState === "active_auto";
  const [acking, setAcking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const detailUrl = resolveSkuDetailUrl(product.detailUrl, product.tangbuyProductId);
  const tangbuyProductId =
    product.tangbuyProductId?.trim() ||
    bound?.tangbuyProductId?.trim() ||
    product.variants.find((v) => v.bound?.tangbuyProductId)?.bound?.tangbuyProductId?.trim() ||
    null;
  const canPickSku = Boolean(detailUrl && tangbuyProductId);

  const ackVariant = async () => {
    if (acking || !isNeedsReview) return;
    setAcking(true);
    try {
      const result = await confirmSuggestionsWithFallback(
        {
          shopName,
          targetScope: "VARIANTS",
          variantIds: [variant.thirdPlatformSkuId],
        },
        [variant.thirdPlatformSkuId]
      );
      if ((result.confirmedCount ?? 0) <= 0) {
        showToast("没有可确认的待确认建议");
        return;
      }
      showToast("已接受 AI 建议，关联已生效");
      await onMutated();
    } catch (err) {
      showToast(autoAlignError(err));
    } finally {
      setAcking(false);
    }
  };

  const unbindVariant = async () => {
    if (unbinding) return;
    if (!window.confirm("取消该变体的货源关联？")) return;
    setUnbinding(true);
    try {
      await unbindWithFallback(shopName, variant.thirdPlatformSkuId, product.thirdPlatformItemId);
      showToast("已取消该变体关联");
      await onMutated();
    } catch (err) {
      showToast(autoAlignError(err));
    } finally {
      setUnbinding(false);
    }
  };

  const offerSku =
    offer?.skus?.find(
      (s) => bound?.tangbuySkuId && String(s.skuId) === String(bound.tangbuySkuId)
    ) ?? undefined;

  const display = bound
    ? resolveBoundSkuDisplay({
        tangbuySkuId: bound.tangbuySkuId,
        sourceMatrix,
        sourceMatrixLoading,
        sourceMatrixError,
        offerSku,
        offerWhiteImage: offer?.whiteImageUrl,
        offerLoading,
        offerFallbackAttempted,
        boundSpec: bound.tangbuySkuSpec,
        boundImageUrl: bound.offerImageUrl,
        boundPriceRaw: bound.offerPrice?.trim() || null,
        shopCurrency,
        pricingTemplate,
      })
    : null;

  const displayStatus = display?.displayStatus ?? null;
  const rightImage = display?.imageUrl ?? null;
  const rightName = display?.specLabel ?? null;
  const rightPrice = display?.priceLabel ?? null;
  const priceCaption =
    display?.priceKind === "procurement" ? "采购价" : null;
  const statusHint = bindingStatusHint(bound);
  const scoreLine = bound ? bindingScoreLine(bound) : null;
  const showPickAction =
    isUnbound || isNeedsReview || displayStatus === "ERROR";
  const showRowActions = !isActiveAuto;
  const thumbClass = compact ? "h-9 w-9" : "h-11 w-11";

  return (
    <>
    <div
      className={cn(
        "grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center md:gap-4",
        compact ? "py-1.5" : "py-2",
        isManualActive && "rounded-[var(--radius-control)] bg-emerald-50/30 px-1",
        isNeedsReview && "rounded-[var(--radius-control)] bg-amber-50/25 px-1"
      )}
    >
      {/* Left — Shopify variant */}
      <div className="flex gap-2">
        <Thumb src={variant.imageUrl} alt={variant.optionLabel} className={thumbClass} />
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-ink-subtle">
            Shopify
          </p>
          <p
            className={cn(
              "mt-0.5 line-clamp-2 font-semibold leading-4 text-ink",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            {variant.optionLabel}
          </p>
          <p
            className={cn(
              "mt-0.5 font-semibold text-ink",
              compact ? "text-[11px]" : "text-xs"
            )}
          >
            {formatShopListingPrice(variant.price, shopCurrency)}
          </p>
          {!compact && variant.sku ? (
            <p className="mt-0.5 truncate text-[10px] text-ink-subtle">
              SKU {variant.sku}
            </p>
          ) : null}
        </div>
      </div>

      {/* Middle — judgement */}
      <div className="flex flex-row items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-muted px-2 py-1.5 md:flex-col md:justify-center md:gap-0.5 md:bg-transparent md:px-0 md:py-0 md:text-center">
        <BindingStatusBadge bound={bound} />
        {bound && scoreLine ? (
          <span className="text-[10px] font-medium text-brand">{scoreLine}</span>
        ) : null}
        {!compact && statusHint ? (
          <span className="text-[10px] leading-tight text-ink-subtle md:max-w-[8rem]">
            {statusHint}
          </span>
        ) : null}
        <MoveRight className="hidden h-3.5 w-3.5 text-ink-subtle md:block" />
      </div>

      {/* Right — Tangbuy source (itemGet first) */}
      <div className="flex gap-2">
        {isUnbound ? (
          <div
            className={cn(
              "flex flex-1 items-center gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/50",
              compact ? "px-2 py-2" : "px-3 py-2.5"
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-amber-900">
                未匹配货源
              </p>
              <p className="text-[10px] text-amber-700/80">
                {canPickSku
                  ? "该规格尚未映射到货源 SKU"
                  : "缺少货源链接，无法加载规格"}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 bg-white text-[11px]"
              disabled={!canPickSku}
              title={
                canPickSku
                  ? "打开 SKU 映射抽屉"
                  : "缺少货源详情链接，无法加载规格"
              }
              onClick={() => onOpenManualPicker?.()}
            >
              <Hand className="h-3.5 w-3.5" />
              去映射
            </Button>
          </div>
        ) : displayStatus === "LOADING" ? (
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-hairline px-3 py-3 text-[11px] text-ink-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            载入货源规格与价格…
          </div>
        ) : displayStatus === "ERROR" ? (
          <div className="flex flex-1 flex-col gap-2 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/40 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] leading-snug text-amber-800">
                {display?.displayError ?? "规格加载失败"}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 w-7 shrink-0 px-0"
                onClick={onRetryEvidence}
                title="重试加载规格"
                aria-label="重试加载规格"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            {canPickSku ? (
              <Button
                size="sm"
                variant="secondary"
                className="w-fit"
                onClick={() => onOpenManualPicker?.()}
                disabled={acking || unbinding}
              >
                <Hand className="h-3.5 w-3.5" />
                编辑映射
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <Thumb
              src={rightImage}
              alt={rightName ?? "Tangbuy 货源"}
              className={thumbClass}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[9px] font-medium uppercase tracking-wide text-brand-strong">
                  Tangbuy 货源
                </p>
                {isManualActive ? (
                  <Badge variant="success" className="px-1 py-0 text-[9px]">
                    手动
                  </Badge>
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-0.5 line-clamp-2 font-semibold leading-4 text-ink",
                  compact ? "text-[11px]" : "text-xs"
                )}
              >
                {rightName ?? bound?.tangbuySkuSpec?.trim() ?? "—"}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-semibold text-ink",
                  compact ? "text-[11px]" : "text-xs"
                )}
              >
                {rightPrice ? (
                  <>
                    {priceCaption ? (
                      <span className="mr-1 text-[10px] font-medium text-ink-subtle">
                        {priceCaption}
                      </span>
                    ) : null}
                    {rightPrice}
                  </>
                ) : (
                  "价未取到"
                )}
              </p>
              {!compact ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-subtle">
                  {bound?.detailUrl ? (
                    <a
                      href={bound.detailUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-ink-muted underline underline-offset-2 hover:text-ink"
                    >
                      <ExternalLink className="h-3 w-3" />
                      详情
                    </a>
                  ) : null}
                  {bound?.tangbuySkuId ? (
                    <span>skuId {bound.tangbuySkuId}</span>
                  ) : null}
                </div>
              ) : null}
              {!compact ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {showRowActions && showPickAction && canPickSku ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenManualPicker?.()}
                    disabled={acking || unbinding}
                    title="在抽屉中编辑 SKU 映射"
                  >
                    <Hand className="h-3.5 w-3.5" />
                    {isNeedsReview ? "编辑映射" : "编辑映射"}
                  </Button>
                ) : null}
                {showRowActions ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void unbindVariant()}
                    disabled={unbinding || acking}
                  >
                    {unbinding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    取消关联
                  </Button>
                ) : null}
                {isNeedsReview ? (
                  <Button
                    size="sm"
                    onClick={() => void ackVariant()}
                    disabled={acking || unbinding}
                    title="接受 AI 对齐建议"
                    className="ml-auto"
                  >
                    {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    接受
                  </Button>
                ) : null}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

/**
 * One product row on the SKU binding workbench. Collapsed by default when fully matched, expanded when
 * partial — surfacing what needs human eyes. The header carries the visual summary (thumb + title +
 * match-state pill + auto-align); expanding reveals per-variant Shopify↔1688 side-by-side comparison.
 * Source images/prices are fetched on demand from the offer detail (route B, no backend change).
 */
export function SkuProductCard({
  product,
  shopName,
  onAligned,
  showToast,
  filterMode = "all",
  pricingTemplate = null,
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

  const [open, setOpen] = useState(() => shouldDefaultExpand(product, filterMode));
  const [aligning, setAligning] = useState(false);
  const [ackingAll, setAckingAll] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);
  const [v1Detail, setV1Detail] = useState<SkuAlignProductDetail | null>(null);
  const [v1DetailLoading, setV1DetailLoading] = useState(false);

  const refreshV1Detail = async () => {
    setV1DetailLoading(true);
    try {
      setV1Detail(
        await api.skuAlignV1ProductDetail(shopName, product.thirdPlatformItemId)
      );
    } catch {
      setV1Detail(null);
    } finally {
      setV1DetailLoading(false);
    }
  };

  /** ack/unbind 后刷新 overview + v1Detail，避免 supplement 提示过时 */
  const onMutatedWithDetail = async () => {
    await onAligned();
    if (open) await refreshV1Detail();
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

  const { attentionVariants, resolvedVariants } = useMemo(() => {
    const { attention, resolved } = partitionVariantsForDisplay(visibleVariants);
    return { attentionVariants: attention, resolvedVariants: resolved };
  }, [visibleVariants]);

  const [resolvedExpanded, setResolvedExpanded] = useState(true);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);
  const [focusVariantId, setFocusVariantId] = useState<string | null>(null);
  const [drawerInitialPhase, setDrawerInitialPhase] =
    useState<DrawerPhase>("primary");

  const openManualDrawer = (
    variantId?: string,
    phase: DrawerPhase = "primary"
  ) => {
    setFocusVariantId(variantId ?? null);
    setDrawerInitialPhase(phase);
    setManualDrawerOpen(true);
  };

  useEffect(() => {
    setOpen(shouldDefaultExpand(product, filterMode));
  }, [product.thirdPlatformItemId, filterMode, product]);

  useEffect(() => {
    setResolvedExpanded(false);
  }, [product.thirdPlatformItemId, open]);

  const productDetailUrl = resolveSkuDetailUrl(
    product.detailUrl,
    product.tangbuyProductId
  );
  const productTangbuyId =
    product.tangbuyProductId?.trim() ||
    product.variants.find((v) => v.bound?.tangbuyProductId)?.bound?.tangbuyProductId?.trim() ||
    null;
  const canManualPick = Boolean(productDetailUrl && productTangbuyId);

  const [offerMap, setOfferMap] = useState<Record<string, OfferDetail>>({});
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerFallbackAttempted, setOfferFallbackAttempted] = useState(false);
  const [sourceMatrix, setSourceMatrix] = useState<SourceSkuRow[]>([]);
  const [sourceMatrixLoading, setSourceMatrixLoading] = useState(false);
  const [sourceMatrixError, setSourceMatrixError] = useState<string | null>(null);
  const [matrixLoadToken, setMatrixLoadToken] = useState(0);
  const [loadedMatrixKey, setLoadedMatrixKey] = useState<string | null>(null);
  const [loadedOfferKey, setLoadedOfferKey] = useState<string | null>(null);

  const boundSkuIds = useMemo(
    () => product.variants.map((v) => v.bound?.tangbuySkuId),
    [product.variants]
  );

  // Distinct 1688 offer ids referenced by this product's bound variants (usually one).
  const boundOfferIds = useMemo(
    () =>
      Array.from(
        new Set(
          product.variants
            .map((v) => v.bound?.tangbuyProductId)
            .filter((id): id is string => Boolean(id))
        )
      ),
    [product]
  );
  const offerSig = boundOfferIds.join(",");
  const matrixKey = productDetailUrl ? `${productDetailUrl}:${matrixLoadToken}` : null;
  const offerKey = offerSig ? `${offerSig}:${matrixLoadToken}` : null;

  const retryEvidence = () => {
    setLoadedMatrixKey(null);
    setLoadedOfferKey(null);
    setOfferMap({});
    setOfferFallbackAttempted(false);
    setMatrixLoadToken((k) => k + 1);
  };

  useEffect(() => {
    if (!open || !productDetailUrl || !matrixKey || loadedMatrixKey === matrixKey) return;
    let cancelled = false;
    setSourceMatrixLoading(true);
    setSourceMatrixError(null);
    void fetchSourceSkuMatrixResult(productDetailUrl)
      .then(({ rows, error }) => {
        if (cancelled) return;
        setSourceMatrix(rows);
        setSourceMatrixError(error);
        setLoadedMatrixKey(matrixKey);
      })
      .finally(() => {
        if (!cancelled) setSourceMatrixLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productDetailUrl, matrixKey, loadedMatrixKey]);

  useEffect(() => {
    if (!open || boundOfferIds.length === 0) return;
    if (sourceMatrixLoading) return;
    if (!needsOfferDetailFallback(sourceMatrix, boundSkuIds)) {
      setOfferFallbackAttempted(false);
      return;
    }
    if (!offerKey || loadedOfferKey === offerKey) return;
    let cancelled = false;
    setOfferLoading(true);
    setOfferFallbackAttempted(true);
    void Promise.all(
      boundOfferIds.map(async (id) => {
        try {
          return [id, await api.getOfferDetail(id)] as const;
        } catch {
          return [id, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, OfferDetail> = {};
      for (const [id, detail] of entries) {
        if (detail) map[id] = detail;
      }
      setOfferMap(map);
      setLoadedOfferKey(offerKey);
      setOfferLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    boundOfferIds,
    offerKey,
    sourceMatrix,
    sourceMatrixLoading,
    boundSkuIds,
    loadedOfferKey,
  ]);

  const runAutoAlign = async () => {
    if (aligning) return;
    setAligning(true);
    setAlignError(null);
    try {
      const status = await enqueueSkuAlignRun(shopName, {
        triggerType: "MANUAL_REFRESH",
        scopeType: "PRODUCT",
        scopeIds: [product.thirdPlatformItemId],
        forceRefresh: true,
      });
      if (status) {
        showToast(
          `自动对齐完成：${status.matchedCount} 个变体已对齐 · 建议 ${status.suggestedCount}`
        );
      } else {
        showToast("对齐任务未受理，请稍后重试");
      }
      setOpen(true);
      await onAligned();
      if (open) await refreshV1Detail();
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAligning(false);
    }
  };

  const showSupplementHint =
    open &&
    v1Detail &&
    !v1DetailLoading &&
    needsSupplementSource(v1Detail);
  const supplementHint = v1Detail ? buildSupplementSourceHint(v1Detail) : null;
  const noSourceCount = v1Detail?.summary.noSourceVariants ?? 0;
  const gapSummary = buildGapSummaryText(unboundCount, noSourceCount);

  // Step 3 — silent CARD_EXPAND + V1 detail when the user opens this product card.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await refreshV1Detail();
      if (cancelled) return;
      try {
        const accepted = await api.skuAlignV1CardExpand(
          shopName,
          product.thirdPlatformItemId
        );
        if (cancelled || !accepted.accepted || !accepted.runId) return;
        const status = await pollSkuAlignRun(shopName, accepted.runId);
        if (
          !cancelled &&
          (status.runStatus === "SUCCEEDED" || status.runStatus === "PARTIAL")
        ) {
          await onAligned();
          await refreshV1Detail();
        }
      } catch {
        // Backend rejects when not stale / already resolved — stay silent.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shopName, product.thirdPlatformItemId, onAligned]);

  // "确认全部待确认": promote every PENDING variant of this product to ACTIVE.
  const ackAll = async () => {
    if (ackingAll || pendingCount === 0) return;
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
      className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card"
      {...(hasIssues(product)
        ? { "data-sku-issue-product": product.thirdPlatformItemId }
        : {})}
    >
      {/* Header — always visible summary */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={open}
        >
          <Thumb
            src={product.imageUrl}
            alt={product.title ?? product.thirdPlatformItemId}
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
          <ChevronDown
            className={cn(
              "mt-1 h-4 w-4 shrink-0 text-ink-subtle transition-transform",
              open && "rotate-180"
            )}
          />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {canManualPick ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openManualDrawer()}
              disabled={aligning || ackingAll}
              title="在右侧抽屉处理当前货源映射与补充货源"
            >
              <Hand className="h-4 w-4" />
              处理 SKU 映射
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runAutoAlign()}
            disabled={aligning || ackingAll}
            title="按 Tangbuy 货源的 SKU 矩阵，自动把每个变体对齐绑定"
          >
            {aligning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {aligning ? "对齐中…" : "自动对齐 SKU"}
          </Button>
          {pendingCount > 0 ? (
            <Button
              size="sm"
              onClick={() => void ackAll()}
              disabled={ackingAll || aligning}
              title="接受该商品下全部待确认的 AI 建议"
            >
              {ackingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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

      {showSupplementHint && supplementHint ? (
        <div className="mx-4 mb-3 flex items-center gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50/50 px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-amber-900">需要补充货源</p>
            <p className="text-[10px] text-amber-700/80">{supplementHint}</p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 shrink-0 bg-white text-[11px]"
            onClick={() => openManualDrawer(undefined, "supplement")}
            disabled={!canManualPick || aligning || ackingAll}
          >
            补充货源
          </Button>
        </div>
      ) : null}

      {/* Body — attention variants full size; resolved collapsed into one summary row */}
      {open ? (
        <div className="divide-y divide-slate-100/80 border-t border-hairline bg-canvas/40 px-3 py-0.5">
          {attentionVariants.map((v) => (
            <VariantCompareRow
              key={v.thirdPlatformSkuId}
              variant={v}
              product={product}
              offer={
                v.bound?.tangbuyProductId
                  ? offerMap[v.bound.tangbuyProductId]
                  : undefined
              }
              offerLoading={offerLoading}
              offerFallbackAttempted={offerFallbackAttempted}
              sourceMatrix={sourceMatrix}
              sourceMatrixLoading={sourceMatrixLoading}
              sourceMatrixError={sourceMatrixError}
              onRetryEvidence={retryEvidence}
              shopName={shopName}
              onMutated={onMutatedWithDetail}
              showToast={showToast}
              shopCurrency={product.currency}
              pricingTemplate={pricingTemplate}
              onOpenManualPicker={() => openManualDrawer(v.thirdPlatformSkuId)}
            />
          ))}
          {resolvedVariants.length > 0 ? (
            <ResolvedVariantsSummary
              variants={resolvedVariants}
              expanded={resolvedExpanded}
              onToggle={() => setResolvedExpanded((v) => !v)}
            >
              {resolvedVariants.map((v) => (
                <VariantCompareRow
                  key={v.thirdPlatformSkuId}
                  variant={v}
                  product={product}
                  compact
                  offer={
                    v.bound?.tangbuyProductId
                      ? offerMap[v.bound.tangbuyProductId]
                      : undefined
                  }
                  offerLoading={offerLoading}
                  offerFallbackAttempted={offerFallbackAttempted}
                  sourceMatrix={sourceMatrix}
                  sourceMatrixLoading={sourceMatrixLoading}
                  sourceMatrixError={sourceMatrixError}
                  onRetryEvidence={retryEvidence}
                  shopName={shopName}
                  onMutated={onMutatedWithDetail}
                  showToast={showToast}
                  shopCurrency={product.currency}
                  pricingTemplate={pricingTemplate}
                  onOpenManualPicker={() =>
                    openManualDrawer(v.thirdPlatformSkuId)
                  }
                />
              ))}
            </ResolvedVariantsSummary>
          ) : null}
        </div>
      ) : null}

      <SkuManualMatchDrawer
        open={manualDrawerOpen}
        onClose={() => setManualDrawerOpen(false)}
        product={product}
        shopName={shopName}
        detailUrl={productDetailUrl}
        tangbuyProductId={productTangbuyId}
        focusVariantId={focusVariantId}
        initialPhase={drawerInitialPhase}
        v1Detail={v1Detail}
        pricingTemplate={pricingTemplate}
        onSaved={onMutatedWithDetail}
        showToast={showToast}
      />
    </article>
  );
}
