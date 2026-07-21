"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, readableError } from "@/lib/api";
import { manualBindWithFallback } from "@/lib/sku-align-v1/compat";
import {
  fetchSourceSkuMatrixResult,
  rankSourceSkuRows,
  type SourceSkuRowRanked,
} from "@/lib/source-sku-matrix";
import { cn } from "@/lib/utils";
import { formatSourceCostInShopCurrency } from "@/lib/purchase-cost-display";

const MATCH_HINT_THRESHOLD = 0.5;

function formatProcurementPrice(
  price?: number | null,
  shopCurrency?: string | null
): string {
  if (price == null || Number.isNaN(price)) return "—";
  return (
    formatSourceCostInShopCurrency(price, shopCurrency) ?? `${price.toFixed(2)} CNY`
  );
}

function formatMatchPct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function SkuThumb({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="56px"
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

export type SkuPickerTrayProps = {
  open: boolean;
  onClose: () => void;
  detailUrl: string;
  shopName: string;
  thirdPlatformItemId: string;
  thirdPlatformSkuId: string;
  tangbuyProductId: string;
  variantLabel: string;
  variantPrice?: number | null;
  variantImageUrl?: string | null;
  /** Currently bound Tangbuy skuId — highlighted in the tray. */
  selectedSkuId?: string | null;
  onBound: () => Promise<void>;
  showToast: (message: string) => void;
  shopCurrency?: string | null;
};

/**
 * Inline tray for manual variant→SKU binding via itemGet.productSkus.
 * Rows are ranked by spec overlap with the Shopify variant label.
 */
export function SkuPickerTray({
  open,
  onClose,
  detailUrl,
  shopName,
  thirdPlatformItemId,
  thirdPlatformSkuId,
  tangbuyProductId,
  variantLabel,
  variantPrice,
  variantImageUrl,
  selectedSkuId,
  onBound,
  showToast,
  shopCurrency,
}: SkuPickerTrayProps) {
  const [rows, setRows] = useState<SourceSkuRowRanked[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bindingSkuId, setBindingSkuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { rows, error } = await fetchSourceSkuMatrixResult(detailUrl);
      const ranked = rankSourceSkuRows(rows, variantLabel, {
        variantPrice,
        variantImageUrl,
      });
      setRows(ranked);
      if (error) {
        setError(error);
      } else if (!ranked.length) {
        setError("该货源未返回可用 SKU 规格");
      }
    } catch (err) {
      setError(readableError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [detailUrl, variantLabel, variantPrice, variantImageUrl]);

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setError(null);
    void load();
  }, [open, load]);

  const topMatchScore = rows[0]?.matchScore ?? 0;

  const pickSku = async (row: SourceSkuRowRanked) => {
    if (bindingSkuId) return;
    setBindingSkuId(row.skuId);
    try {
      await manualBindWithFallback(
        thirdPlatformSkuId,
        {
          shopName,
          thirdPlatformItemId,
          offerId: tangbuyProductId,
          offerSkuId: row.skuId,
          reason: row.specLabel,
        },
        { detailUrl }
      );
      showToast(`已手动绑定 · ${row.specLabel}（立即生效）`);
      onClose();
      await onBound();
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setBindingSkuId(null);
    }
  };

  const hintText = useMemo(() => {
    if (loading || !rows.length) return null;
    if (topMatchScore >= MATCH_HINT_THRESHOLD) {
      return `已按与「${variantLabel}」的规格相近度排序，请核对颜色/尺码后选择`;
    }
    return `未找到高相似规格，请对照 Shopify「${variantLabel}」人工选择`;
  }, [loading, rows.length, topMatchScore, variantLabel]);

  if (!open) return null;

  return (
    <div className="col-span-full mt-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-800">
            从货源规格表选择 SKU
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            对应 Shopify 变体：
            <span className="font-medium text-slate-800"> {variantLabel}</span>
          </p>
          {hintText ? (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">{hintText}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 px-0"
          onClick={onClose}
          title="收起"
          aria-label="收起 SKU 选择"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          载入 itemGet SKU 矩阵…
        </div>
      ) : error ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="flex-1 text-[11px] text-red-600">{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 w-7 shrink-0 px-0"
            onClick={() => void load()}
            title="重试加载规格表"
            aria-label="重试加载规格表"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : rows.length > 0 ? (
        <div className="mt-2.5 flex items-stretch gap-2 overflow-x-auto pb-1">
          {rows.map((row, idx) => {
            const isSelected =
              selectedSkuId != null && String(selectedSkuId) === row.skuId;
            const isBinding = bindingSkuId === row.skuId;
            const showMatchHint = row.matchScore >= MATCH_HINT_THRESHOLD;
            const isTopMatch = idx === 0 && showMatchHint;
            return (
              <button
                key={row.skuId}
                type="button"
                disabled={Boolean(bindingSkuId)}
                onClick={() => void pickSku(row)}
                className={cn(
                  "flex w-[11.5rem] shrink-0 flex-col rounded-lg border-2 bg-white p-2 text-left transition-colors",
                  isSelected
                    ? "border-sky-400 bg-sky-50/30"
                    : isTopMatch
                      ? "border-emerald-300 bg-emerald-50/20"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50",
                  bindingSkuId && !isBinding ? "opacity-60" : null
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <SkuThumb src={row.imageUrl} alt={row.specLabel} />
                  <div className="flex min-w-0 flex-col items-end gap-0.5">
                    {isTopMatch ? (
                      <Badge variant="success" className="text-[9px] px-1 py-0">
                        最相近
                      </Badge>
                    ) : showMatchHint ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        相近 {formatMatchPct(row.matchScore)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] font-semibold leading-4 text-ink">
                  {row.specLabel}
                </p>
                {row.optionParts.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.optionParts.slice(0, 3).map((part) => (
                      <span
                        key={`${part.name}:${part.value}`}
                        className="rounded bg-slate-100 px-1 py-0.5 text-[9px] leading-tight text-slate-600"
                        title={`${part.name}: ${part.value}`}
                      >
                        {part.name}: {part.value}
                      </span>
                    ))}
                  </div>
                ) : null}
                <p className="mt-1.5 text-xs font-semibold text-ink">
                  采购价 {formatProcurementPrice(row.procurementPrice, shopCurrency)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-ink-subtle">
                  skuId {row.skuId}
                </p>
                {isBinding ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-brand">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    绑定中…
                  </span>
                ) : isSelected ? (
                  <span className="mt-1.5 text-[10px] font-medium text-sky-700">
                    当前绑定
                  </span>
                ) : (
                  <span className="mt-1.5 text-[10px] font-medium text-brand">
                    选此 SKU · 立即生效
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
