"use client";

import { useEffect, useMemo, useState } from "react";
import { ThumbImage } from "@/components/ui/thumb-image";
import { Button } from "@/components/ui/button";
import { ImageOff, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { formatSourceCostInShopCurrency } from "@/lib/purchase-cost-display";
import type { PricingTemplate } from "@/lib/types";
import type { SourceSkuRowRanked } from "@/lib/source-sku-matrix";
import { useT } from "@/i18n/LocaleProvider";

const MATCH_HINT_THRESHOLD = 0.5;

function formatMatchPct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

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

function SkuOptionThumb({ src, alt }: { src?: string | null; alt: string }) {
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

export interface SkuPickerDialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  variantLabel?: string;
  rows: SourceSkuRowRanked[];
  selectedSkuId?: string | null;
  shopCurrency?: string | null;
  pricingTemplate?: PricingTemplate | null;
  onConfirm: (skuId: string) => void;
}

export function SkuPickerDialog({
  open,
  onClose,
  title,
  variantLabel,
  rows,
  selectedSkuId,
  shopCurrency,
  pricingTemplate,
  onConfirm,
}: SkuPickerDialogProps) {
  const t = useT();
  const [pendingSkuId, setPendingSkuId] = useState<string | null>(selectedSkuId ?? null);

  useEffect(() => {
    if (open) {
      setPendingSkuId(selectedSkuId ?? null);
    }
  }, [open, selectedSkuId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.matchScore - a.matchScore);
  }, [rows]);

  const topMatchScore = sortedRows[0]?.matchScore ?? 0;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* panel */}
      <div className="relative flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card">
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">
              {title ?? t("skuPicker.title")}
            </h3>
            {variantLabel ? (
              <p className="mt-1 text-xs text-ink-muted">
                {t("skuPicker.shopifyVariant")}{" "}
                <span className="font-medium text-ink">{variantLabel}</span>
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {sortedRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              {t("skuWorkbench.noSpecsInSource")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sortedRows.map((row, idx) => {
                const isSelected = pendingSkuId === row.skuId;
                const showMatchHint = row.matchScore >= MATCH_HINT_THRESHOLD;
                const isTopMatch = idx === 0 && showMatchHint;

                return (
                  <button
                    key={row.skuId}
                    type="button"
                    onClick={() => setPendingSkuId(row.skuId)}
                    className={cn(
                      "flex items-start gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                      isSelected
                        ? "border-brand bg-brand/5"
                        : "border-hairline bg-surface hover:border-brand/40 hover:bg-surface-hover"
                    )}
                  >
                    <SkuOptionThumb src={row.imageUrl} alt={row.specLabel} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">
                        {row.specLabel}
                      </p>
                      {row.optionParts.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {row.optionParts.slice(0, 2).map((part) => (
                            <span
                              key={`${part.name}:${part.value}`}
                              className="rounded bg-surface-muted px-1 py-0.5 text-[9px] leading-tight text-ink-muted"
                              title={`${part.name}: ${part.value}`}
                            >
                              {part.value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <p className="mt-2 text-xs font-semibold text-ink">
                        {formatProcurementPrice(
                          row.procurementPrice,
                          shopCurrency,
                          pricingTemplate
                        )}
                      </p>
                      {isTopMatch ? (
                        <span className="mt-1.5 inline-block rounded-full bg-success-soft px-1.5 py-0.5 text-[9px] font-medium text-success">
                          {t("skuPicker.bestMatch")}
                        </span>
                      ) : showMatchHint ? (
                        <span className="mt-1.5 inline-block rounded-full bg-surface-muted px-1.5 py-0.5 text-[9px] font-medium text-ink-muted">
                          {t("skuPicker.similarPct", { pct: formatMatchPct(row.matchScore) })}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 border-t border-hairline bg-surface px-5 py-3">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!pendingSkuId}
            onClick={() => {
              if (pendingSkuId) {
                onConfirm(pendingSkuId);
                onClose();
              }
            }}
          >
            {t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
