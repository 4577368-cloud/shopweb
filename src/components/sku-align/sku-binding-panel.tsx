"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  ImageOff,
  Loader2,
  MoveRight,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type {
  OfferDetail,
  OfferSku,
  SkuProductOverview,
  SkuVariant,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type ProductMatchState = "full" | "partial" | "none";

/** Derived per-product state from the real overview (all / some / no variants bound). */
export function productMatchState(product: SkuProductOverview): ProductMatchState {
  const total = product.variants.length;
  const bound = product.variants.filter((v) => v.bound).length;
  if (total > 0 && bound === total) return "full";
  if (bound > 0) return "partial";
  return "none";
}

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
  return raw || "自动对齐失败";
}

/** RULE/AI bindings come from S1-b1 auto-align; IMAGE from A3-2b image confirm. */
function isAutoAligned(source?: string | null): boolean {
  return source === "RULE" || source === "AI";
}

/** Similarity score may be a 0–1 ratio or an absolute index; render defensively. */
function formatScore(score?: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return String(Math.round(score));
}

function formatShopPrice(price?: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  return price.toFixed(2);
}

/** First usable price string from a 1688 SKU (wholesale, else consignment). */
function offerSkuPrice(sku?: OfferSku | null): string | null {
  const raw = sku?.price ?? sku?.consignPrice ?? null;
  return raw && raw.trim() ? raw.trim() : null;
}

/** Human spec label from a 1688 SKU's attribute matrix (translated value preferred). */
function offerSkuSpec(sku?: OfferSku | null): string | null {
  const parts = sku?.skuAttributes
    ?.map((a) => a.valueTrans || a.value)
    .filter((v): v is string => Boolean(v && v.trim()));
  return parts && parts.length ? parts.join(" / ") : null;
}

/** Per-value image on a 1688 SKU, if the attribute matrix carries one. */
function offerSkuImage(sku?: OfferSku | null): string | null {
  return sku?.skuAttributes?.map((a) => a.skuImageUrl).find(Boolean) ?? null;
}

/** One short, human reason for the middle judgement column. */
function matchReason(bound: NonNullable<SkuVariant["bound"]>): string {
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
        <Image
          src={src}
          alt={alt}
          fill
          sizes="72px"
          className="object-cover"
          unoptimized
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
 * One variant comparison row: Shopify variant (left) vs the matched 1688 SKU (right), with a compact
 * judgement in the middle. Evidence is ordered for the eye — image, name/spec, price — with codes/ids
 * demoted to muted footnotes. Source image/price/spec come from the on-demand offer detail (`offer`);
 * when it is unresolved we fall back to what the overview already carries and say so, never faking it.
 */
function VariantCompareRow({
  variant,
  offer,
  offerLoading,
  shopName,
  onMutated,
  showToast,
}: {
  variant: SkuVariant;
  offer?: OfferDetail;
  offerLoading: boolean;
  shopName: string;
  onMutated: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const bound = variant.bound;
  const isPending = bound?.bindStatus === "PENDING";
  const [acking, setAcking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const ackVariant = async () => {
    if (acking) return;
    setAcking(true);
    try {
      await api.ackSkuBinding(shopName, variant.thirdPlatformSkuId);
      showToast("已确认该变体关联");
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
      await api.unbindSkuBinding(shopName, variant.thirdPlatformSkuId);
      showToast("已取消该变体关联");
      await onMutated();
    } catch (err) {
      showToast(autoAlignError(err));
    } finally {
      setUnbinding(false);
    }
  };

  const sku =
    offer?.skus?.find(
      (s) => bound?.tangbuySkuId && String(s.skuId) === String(bound.tangbuySkuId)
    ) ?? undefined;

  const rightImage = offerSkuImage(sku) ?? offer?.whiteImageUrl ?? null;
  const rightName =
    offerSkuSpec(sku) ??
    bound?.tangbuySkuSpec ??
    offer?.subjectTrans ??
    offer?.subject ??
    null;
  const rightPrice = offerSkuPrice(sku);
  const resolved = Boolean(offer);

  return (
    <div className="grid grid-cols-1 gap-3 py-3 md:grid-cols-[minmax(0,1fr)_128px_minmax(0,1fr)] md:items-center md:gap-4">
      {/* Left — Shopify variant */}
      <div className="flex gap-3">
        <Thumb src={variant.imageUrl} alt={variant.optionLabel} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
            Shopify
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-ink">
            {variant.optionLabel}
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">
            ¥{formatShopPrice(variant.price)}
          </p>
          {variant.sku ? (
            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">SKU {variant.sku}</p>
          ) : null}
        </div>
      </div>

      {/* Middle — judgement */}
      <div className="flex flex-row items-center justify-between gap-2 rounded-[var(--radius-control)] bg-surface-muted px-2.5 py-2 md:flex-col md:justify-center md:gap-1 md:bg-transparent md:px-0 md:py-0 md:text-center">
        {bound ? (
          <>
            {isPending ? (
              <Badge variant="warning">AI 待确认</Badge>
            ) : (
              <Badge variant="success">已确认</Badge>
            )}
            <span className="text-[11px] font-medium text-brand">
              {isAutoAligned(bound.matchSource) ? "匹配度" : "相似度"}{" "}
              {formatScore(bound.matchScore)}
            </span>
            <span className="hidden text-[10px] leading-tight text-ink-subtle md:block">
              {matchReason(bound)}
            </span>
          </>
        ) : (
          <>
            <Badge variant="outline">未匹配</Badge>
            <span className="hidden text-[10px] leading-tight text-ink-subtle md:block">
              尚未找到货源
            </span>
          </>
        )}
        <MoveRight className="hidden h-4 w-4 text-ink-subtle md:block" />
      </div>

      {/* Right — 1688 source */}
      <div className="flex gap-3">
        {!bound ? (
          <div className="flex flex-1 items-center rounded-[var(--radius-control)] border border-dashed border-hairline px-3 py-3 text-[11px] text-ink-subtle">
            未匹配货源
          </div>
        ) : offerLoading && !resolved ? (
          <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-hairline px-3 py-3 text-[11px] text-ink-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            载入货源…
          </div>
        ) : (
          <>
            <Thumb src={rightImage} alt={rightName ?? "Tangbuy 货源"} className="h-16 w-16" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-brand-strong">
                Tangbuy 货源
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-ink">
                {rightName ?? "(未取到规格)"}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                {rightPrice ? `¥${rightPrice}` : "价未取到"}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-subtle">
                {bound.detailUrl ? (
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
                {bound.tangbuySkuId ? <span>SKU {bound.tangbuySkuId}</span> : null}
                {!resolved && !offerLoading ? (
                  <span className="text-amber-600">货源明细未取到</span>
                ) : null}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void unbindVariant()}
                  disabled={unbinding || acking}
                >
                  {unbinding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  取消关联
                </Button>
                {isPending ? (
                  <Button
                    size="sm"
                    onClick={() => void ackVariant()}
                    disabled={acking || unbinding}
                  >
                    {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    确认无误
                  </Button>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
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
}: {
  product: SkuProductOverview;
  shopName: string;
  onAligned: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const total = product.variants.length;
  const bound = boundVariantCount(product);
  const state = productMatchState(product);

  const [open, setOpen] = useState(() => state !== "full");
  const [aligning, setAligning] = useState(false);
  const [ackingAll, setAckingAll] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);

  const pendingCount = product.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;

  const [offerMap, setOfferMap] = useState<Record<string, OfferDetail>>({});
  const [offerLoading, setOfferLoading] = useState(false);
  const [fetchedSig, setFetchedSig] = useState<string | null>(null);

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
  const sig = boundOfferIds.join(",");

  useEffect(() => {
    if (!open || boundOfferIds.length === 0 || fetchedSig === sig) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy on-expand fetch; guarded by fetchedSig
    setOfferLoading(true);
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
      setFetchedSig(sig);
      setOfferLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, boundOfferIds, sig, fetchedSig]);

  const runAutoAlign = async () => {
    if (aligning) return;
    setAligning(true);
    setAlignError(null);
    try {
      const res = await api.autoAlignSku(shopName, product.thirdPlatformItemId);
      showToast(`自动对齐完成：${res.matchedCount}/${res.totalVariants} 个变体已绑定`);
      setOpen(true);
      await onAligned();
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAligning(false);
    }
  };

  // "确认全部待确认": promote every PENDING variant of this product to ACTIVE.
  const ackAll = async () => {
    if (ackingAll || pendingCount === 0) return;
    setAckingAll(true);
    setAlignError(null);
    try {
      const pend = product.variants.filter((v) => v.bound?.bindStatus === "PENDING");
      for (const v of pend) {
        await api.ackSkuBinding(shopName, v.thirdPlatformSkuId);
      }
      showToast(`已确认 ${pend.length} 个变体关联`);
      await onAligned();
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAckingAll(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
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
          {pendingCount > 0 ? (
            <Button
              size="sm"
              onClick={() => void ackAll()}
              disabled={ackingAll || aligning}
              title="确认该商品下全部 AI 待确认的变体关联"
            >
              {ackingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              确认全部（{pendingCount}）
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
        </div>
      </div>

      {alignError ? (
        <div className="mx-4 mb-3 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {alignError}
        </div>
      ) : null}

      {/* Body — per-variant side-by-side comparison */}
      {open ? (
        <div className="border-t border-hairline bg-canvas/40 px-4 py-1 divide-y divide-slate-100">
          {product.variants.map((v) => (
            <VariantCompareRow
              key={v.thirdPlatformSkuId}
              variant={v}
              offer={
                v.bound?.tangbuyProductId
                  ? offerMap[v.bound.tangbuyProductId]
                  : undefined
              }
              offerLoading={offerLoading}
              shopName={shopName}
              onMutated={onAligned}
              showToast={showToast}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
