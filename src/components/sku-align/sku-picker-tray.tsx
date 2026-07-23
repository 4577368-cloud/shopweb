"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, RefreshCw, X } from "@/lib/ui/icons";
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
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";
import { formatSourceCostInShopCurrency } from "@/lib/purchase-cost-display";
import type { PricingTemplate } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";

const MATCH_HINT_THRESHOLD = 0.5;

function formatProcurementPrice(
  price?: number | null,
  shopCurrency?: string | null,
  pricingTemplate?: PricingTemplate | null
): string {
  if (price == null || Number.isNaN(price)) return "—";
  return (
    formatSourceCostInShopCurrency(price, shopCurrency, pricingTemplate) ??
    `${price.toFixed(2)} CNY`
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
        <ThumbImage
          src={src}
          alt={alt}
          fill
          sizes="56px"
          pixelWidth={112}
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
  pricingTemplate?: PricingTemplate | null;
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
  pricingTemplate = null,
}: SkuPickerTrayProps) {
  const t = useT();
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
        setError(t("skuPicker.errNoSkuSpecs"));
      }
    } catch (err) {
      setError(readableError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [detailUrl, variantLabel, variantPrice, variantImageUrl, t]);

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
      showToast(t("skuPicker.toastBound", { spec: row.specLabel }));
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
      return t("skuPicker.hintSorted", { label: variantLabel });
    }
    return t("skuPicker.hintManual", { label: variantLabel });
  }, [loading, rows.length, topMatchScore, variantLabel, t]);

  if (!open) return null;

  return (
    <div className="col-span-full mt-1 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-800">
            {t("skuPicker.title")}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-600">
            {t("skuPicker.shopifyVariant")}
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
          title={t("skuPicker.collapse")}
          aria-label={t("skuPicker.collapseAria")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-subtle">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("skuPicker.loadingMatrix")}
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
            title={t("skuPicker.retryLoadTitle")}
            aria-label={t("skuPicker.retryLoadAria")}
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
                aria-selected={isSelected}
                className={cn(
                  "flex w-[11.5rem] shrink-0 flex-col p-2 text-left transition-colors",
                  selectableCardClassName({
                    selected: isSelected,
                    className: isTopMatch && !isSelected ? "bg-success-soft/30" : undefined,
                  }),
                  bindingSkuId && !isBinding ? "opacity-60" : null
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <SkuThumb src={row.imageUrl} alt={row.specLabel} />
                  <div className="flex min-w-0 flex-col items-end gap-0.5">
                    {isTopMatch ? (
                      <Badge variant="success" className="text-[9px] px-1 py-0">
                        {t("skuPicker.bestMatch")}
                      </Badge>
                    ) : showMatchHint ? (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        {t("skuPicker.similarPct", { pct: formatMatchPct(row.matchScore) })}
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
                  {t("skuPicker.purchaseCost")}{" "}
                  {formatProcurementPrice(row.procurementPrice, shopCurrency, pricingTemplate)}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-ink-subtle">
                  skuId {row.skuId}
                </p>
                {isBinding ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-brand">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("skuPicker.binding")}
                  </span>
                ) : isSelected ? (
                  <span className="mt-1.5 text-[10px] font-medium text-sky-700">
                    {t("skuPicker.currentBinding")}
                  </span>
                ) : (
                  <span className="mt-1.5 text-[10px] font-medium text-brand">
                    {t("skuPicker.pickSku")}
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
