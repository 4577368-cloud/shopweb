"use client";

import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import type { SkuProductOverview, SkuVariant } from "@/lib/types";
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

export function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
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
  if (raw.startsWith("NO_OFFER_SKU")) return "该 1688 货源未返回可用 SKU";
  if (raw.startsWith("AOP_CRED_MISSING")) return "1688 开放平台凭证未配置";
  if (raw.startsWith("AOP_TOKEN_INVALID")) return "1688 授权已失效，请重新授权";
  if (raw.startsWith("GATEWAY_BUSY")) return "1688 网关繁忙，请稍后重试";
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

function formatPrice(price?: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  return price.toFixed(2);
}

function queryHint(v: NonNullable<SkuVariant["bound"]>): string | null {
  if (!v.querySource || v.querySource === "NONE") return null;
  const src = v.querySource === "LLM" ? "AI 识图" : "标题";
  return v.appliedQuery ? `${src}纠偏「${v.appliedQuery}」` : `${src}纠偏`;
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
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {bound}/{total} 已匹配
      </Badge>
    );
  }
  if (state === "partial") {
    return (
      <Badge variant="warning">
        {bound}/{total} 部分匹配
      </Badge>
    );
  }
  return <Badge variant="outline">未匹配</Badge>;
}

/**
 * One product row on the SKU binding workbench: header (thumb + title + match-state pill + auto-align
 * action) expanding into its Shopify variants with their real binding state. Auto-align and read-only
 *回显 logic are unchanged from S1-a/S1-b1 — only the visual shell is upgraded to the workbench tokens.
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
  const hasImage = Boolean(product.imageUrl);
  const [aligning, setAligning] = useState(false);
  const [alignError, setAlignError] = useState<string | null>(null);

  const total = product.variants.length;
  const bound = boundVariantCount(product);
  const state = productMatchState(product);

  const runAutoAlign = async () => {
    if (aligning) return;
    setAligning(true);
    setAlignError(null);
    try {
      const res = await api.autoAlignSku(shopName, product.thirdPlatformItemId);
      showToast(`自动对齐完成：${res.matchedCount}/${res.totalVariants} 个变体已绑定`);
      await onAligned();
    } catch (err) {
      setAlignError(autoAlignError(err));
    } finally {
      setAligning(false);
    }
  };

  return (
    <article className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-3.5 shadow-card">
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
          {hasImage ? (
            <Image
              src={product.imageUrl as string}
              alt={product.title ?? product.thirdPlatformItemId}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-subtle">
              无图
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold leading-5 text-ink">
            {product.title ?? "(无标题)"}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] text-ink-subtle">{total} 个变体</span>
            <MatchStatePill state={state} bound={bound} total={total} />
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0"
          onClick={() => void runAutoAlign()}
          disabled={aligning}
          title="按 1688 货源的 SKU 矩阵，自动把每个变体对齐绑定"
        >
          {aligning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {aligning ? "对齐中…" : "自动对齐 SKU"}
        </Button>
      </div>

      {alignError ? (
        <div className="mt-2 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {alignError}
        </div>
      ) : null}

      <div className="mt-2.5 divide-y divide-slate-100 border-t border-hairline">
        {product.variants.map((v) => (
          <VariantRow key={v.thirdPlatformSkuId} variant={v} />
        ))}
      </div>
    </article>
  );
}

function VariantRow({ variant }: { variant: SkuVariant }) {
  const bound = variant.bound;
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">{variant.optionLabel}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-subtle">
          {variant.sku ? <span>SKU {variant.sku}</span> : null}
          <span>¥{formatPrice(variant.price)}</span>
        </div>
      </div>

      <div className="min-w-0 max-w-[62%] text-right">
        {bound ? (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              <Badge variant="success">
                {isAutoAligned(bound.matchSource) ? "已对齐" : "已绑"}
              </Badge>
              {isAutoAligned(bound.matchSource) && bound.tangbuySkuId ? (
                <span className="text-[11px] font-medium text-ink">
                  1688 SKU {bound.tangbuySkuId}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-ink">
                  1688 offer {bound.tangbuyProductId}
                </span>
              )}
              {bound.matchScore != null ? (
                <span className="text-[11px] text-brand">
                  {isAutoAligned(bound.matchSource) ? "匹配度" : "相似度"}{" "}
                  {formatScore(bound.matchScore)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 text-[11px] text-ink-subtle">
              {bound.tangbuySkuSpec ? (
                <span className="text-ink-muted">规格 {bound.tangbuySkuSpec}</span>
              ) : null}
              {queryHint(bound) ? <span>{queryHint(bound)}</span> : null}
              {bound.detailUrl ? (
                <a
                  href={bound.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
                  )}
                >
                  <ExternalLink className="h-3 w-3" />
                  1688 详情
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <Badge variant="outline">未绑定</Badge>
        )}
      </div>
    </div>
  );
}
