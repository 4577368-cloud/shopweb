"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageOff, Loader2, MoveRight, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { readableError } from "@/lib/api";
import { manualBindWithFallback } from "@/lib/sku-align-v1/compat";
import {
  fetchSourceSkuMatrixResult,
  findSourceSkuRow,
  rankSourceSkuRows,
  type SourceSkuRow,
} from "@/lib/source-sku-matrix";
import {
  deriveVariantDisplayState,
  DISPLAY_STATE_LABELS,
  partitionVariantsForDisplay,
} from "@/lib/sku-align/display";
import {
  formatShopListingPrice,
  formatSourceCostInShopCurrency,
} from "@/lib/purchase-cost-display";
import type { SkuProductOverview, SkuVariant } from "@/lib/types";

function VariantThumb({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  return (
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="40px"
          className="object-cover"
          unoptimized
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-ink-subtle">
          <ImageOff className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

function formatOptionPrice(
  price?: number | null,
  shopCurrency?: string | null
): string {
  if (price == null || Number.isNaN(price)) return "—";
  return (
    formatSourceCostInShopCurrency(price, shopCurrency) ?? `${price.toFixed(2)} CNY`
  );
}

function CompareSide({
  channel,
  badge,
  imageUrl,
  title,
  price,
  priceCaption,
}: {
  channel: string;
  badge?: React.ReactNode;
  imageUrl?: string | null;
  title: string;
  price: string;
  priceCaption?: string | null;
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <VariantThumb src={imageUrl} alt={title} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-ink-subtle">
            {channel}
          </p>
          {badge}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-ink">
          {title}
        </p>
        <p className="mt-0.5 text-[11px] font-semibold text-ink">
          {priceCaption ? (
            <span className="mr-1 text-[10px] font-medium text-ink-subtle">
              {priceCaption}
            </span>
          ) : null}
          {price}
        </p>
      </div>
    </div>
  );
}

function VariantPickerRow({
  variant,
  matrix,
  shopCurrency,
  value,
  onChange,
  rowRef,
}: {
  variant: SkuVariant;
  matrix: SourceSkuRow[];
  shopCurrency?: string | null;
  value: string;
  onChange: (skuId: string) => void;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const displayState = deriveVariantDisplayState(variant);
  const ranked = useMemo(
    () =>
      rankSourceSkuRows(matrix, variant.optionLabel, {
        variantPrice: variant.price,
        variantImageUrl: variant.imageUrl,
      }),
    [matrix, variant.optionLabel, variant.price, variant.imageUrl]
  );

  const selectedRow = useMemo(() => {
    if (value) return findSourceSkuRow(matrix, value);
    return undefined;
  }, [matrix, value]);

  const sourceImage =
    selectedRow?.imageUrl?.trim() ||
    variant.bound?.offerImageUrl?.trim() ||
    null;
  const sourceTitle =
    selectedRow?.specLabel?.trim() ||
    variant.bound?.tangbuySkuSpec?.trim() ||
    "请选择规格";
  const sourcePrice = selectedRow
    ? formatOptionPrice(selectedRow.procurementPrice, shopCurrency)
    : variant.bound?.offerPrice?.trim()
      ? variant.bound.offerPrice
      : "—";

  const stateBadge = (
    <Badge
      variant={
        displayState === "needs_review"
          ? "warning"
          : displayState === "unbound"
            ? "outline"
            : "success"
      }
      className="px-1.5 py-0 text-[9px]"
    >
      {DISPLAY_STATE_LABELS[displayState]}
    </Badge>
  );

  return (
    <div
      ref={rowRef}
      id={`sku-drawer-row-${variant.thirdPlatformSkuId}`}
      className="rounded-[var(--radius-control)] border border-hairline bg-canvas/40 p-2.5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-start gap-2">
        <CompareSide
          channel="Shopify"
          badge={stateBadge}
          imageUrl={variant.imageUrl}
          title={variant.optionLabel}
          price={formatShopListingPrice(variant.price, shopCurrency)}
        />

        <div className="flex h-10 items-center justify-center">
          <MoveRight className="h-3.5 w-3.5 text-ink-subtle" />
        </div>

        <CompareSide
          channel="Tangbuy 货源"
          imageUrl={sourceImage}
          title={sourceTitle}
          price={sourcePrice}
          priceCaption={selectedRow ? "采购价" : null}
        />
      </div>

      <div className="mt-2 border-t border-hairline/60 pt-2">
        <label
          htmlFor={`sku-select-${variant.thirdPlatformSkuId}`}
          className="sr-only"
        >
          选择货源规格
        </label>
        <Select
          id={`sku-select-${variant.thirdPlatformSkuId}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!ranked.length}
          className="h-8 text-[11px]"
        >
          <option value="">请选择规格…</option>
          {ranked.map((row) => (
            <option key={row.skuId} value={row.skuId}>
              {row.specLabel}
              {row.procurementPrice != null
                ? ` · ${formatOptionPrice(row.procurementPrice, shopCurrency)}`
                : ""}
              {row.matchScore >= 0.5
                ? ` · ${Math.round(row.matchScore * 100)}%`
                : ""}
            </option>
          ))}
        </Select>
        {!ranked.length ? (
          <p className="mt-1 text-[10px] text-amber-700">暂无可用规格</p>
        ) : null}
      </div>
    </div>
  );
}

function VariantSection({
  title,
  variants,
  matrix,
  shopCurrency,
  selections,
  onSelect,
  focusVariantId,
  focusRef,
}: {
  title: string;
  variants: SkuVariant[];
  matrix: SourceSkuRow[];
  shopCurrency?: string | null;
  selections: Record<string, string>;
  onSelect: (variantId: string, skuId: string) => void;
  focusVariantId?: string | null;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!variants.length) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      <div className="space-y-2">
        {variants.map((variant) => (
          <VariantPickerRow
            key={variant.thirdPlatformSkuId}
            variant={variant}
            matrix={matrix}
            shopCurrency={shopCurrency}
            value={selections[variant.thirdPlatformSkuId] ?? ""}
            onChange={(skuId) => onSelect(variant.thirdPlatformSkuId, skuId)}
            rowRef={
              focusVariantId === variant.thirdPlatformSkuId ? focusRef : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

export function SkuManualMatchDrawer({
  open,
  onClose,
  product,
  shopName,
  detailUrl,
  tangbuyProductId,
  focusVariantId,
  onSaved,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  product: SkuProductOverview;
  shopName: string;
  detailUrl: string | null;
  tangbuyProductId: string | null;
  focusVariantId?: string | null;
  onSaved: () => Promise<void>;
  showToast: (message: string) => void;
}) {
  const [matrix, setMatrix] = useState<SourceSkuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);

  const { attention: attentionVariants, resolved: resolvedVariants } = useMemo(
    () => partitionVariantsForDisplay(product.variants),
    [product.variants]
  );

  const canPick = Boolean(detailUrl?.trim() && tangbuyProductId?.trim());

  const reset = useCallback(() => {
    setMatrix([]);
    setLoading(false);
    setLoadError(null);
    setSelections({});
    setSaving(false);
    setSaveError(null);
  }, []);

  const loadMatrix = useCallback(async () => {
    if (!detailUrl?.trim()) {
      setLoadError("缺少货源详情链接，无法加载 SKU 规格表");
      setMatrix([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const { rows, error } = await fetchSourceSkuMatrixResult(detailUrl);
      setMatrix(rows);
      if (error) setLoadError(error);
      else if (!rows.length) setLoadError("该货源未返回可用 SKU 规格");
    } catch (err) {
      setMatrix([]);
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [detailUrl]);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    const init: Record<string, string> = {};
    for (const v of product.variants) {
      const id = v.bound?.tangbuySkuId?.trim();
      if (id) init[v.thirdPlatformSkuId] = id;
    }
    setSelections(init);
    void loadMatrix();
  }, [open, product.variants, loadMatrix, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  useEffect(() => {
    if (!open || !focusVariantId) return;
    const el = focusRef.current ?? document.getElementById(`sku-drawer-row-${focusVariantId}`);
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, focusVariantId, loading]);

  const pendingChanges = useMemo(() => {
    const changes: Array<{ variant: SkuVariant; skuId: string; specLabel: string }> = [];
    for (const variant of product.variants) {
      const nextSkuId = selections[variant.thirdPlatformSkuId]?.trim();
      if (!nextSkuId) continue;
      const current = variant.bound?.tangbuySkuId?.trim() ?? "";
      if (nextSkuId === current) continue;
      const row = findSourceSkuRow(matrix, nextSkuId);
      if (!row) continue;
      changes.push({ variant, skuId: nextSkuId, specLabel: row.specLabel });
    }
    return changes;
  }, [product.variants, selections, matrix]);

  const handleSelect = (variantId: string, skuId: string) => {
    setSelections((prev) => ({ ...prev, [variantId]: skuId }));
  };

  const save = async () => {
    if (saving || !canPick || !tangbuyProductId) return;
    if (pendingChanges.length === 0) {
      showToast("没有需要保存的变更");
      onClose();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      for (const { variant, skuId, specLabel } of pendingChanges) {
        await manualBindWithFallback(
          variant.thirdPlatformSkuId,
          {
            shopName,
            thirdPlatformItemId: product.thirdPlatformItemId,
            offerId: tangbuyProductId,
            offerSkuId: skuId,
            reason: specLabel,
          },
          { detailUrl }
        );
      }
      showToast(`已保存 ${pendingChanges.length} 个 SKU 绑定`);
      onClose();
      await onSaved();
    } catch (err) {
      setSaveError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-ink/30"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-card">
        <header className="flex items-start justify-between gap-2 border-b border-hairline px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
              手动选择 SKU
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-sm font-semibold leading-5 text-ink">
              {product.title ?? product.thirdPlatformItemId}
            </h2>
            <p className="mt-1 text-[10px] leading-snug text-ink-muted">
              左右对照 Shopify 与货源规格，下拉修改后保存
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 shrink-0 px-0"
            onClick={onClose}
            disabled={saving}
            title="关闭"
            aria-label="关闭手动选择"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!canPick ? (
            <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              该商品缺少货源详情链接，无法加载规格表。请先在「智能选品」确认匹配。
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              载入 itemGet 规格表…
            </div>
          ) : (
            <div className="space-y-4">
              {loadError ? (
                <div className="flex items-start justify-between gap-2 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-[11px] text-amber-800">{loadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 w-7 shrink-0 px-0"
                    onClick={() => void loadMatrix()}
                    title="重试加载"
                    aria-label="重试加载"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}

              <VariantSection
                title={`待处理（${attentionVariants.length}）`}
                variants={attentionVariants}
                matrix={matrix}
                shopCurrency={product.currency}
                selections={selections}
                onSelect={handleSelect}
                focusVariantId={focusVariantId}
                focusRef={focusRef}
              />

              <VariantSection
                title={`已对齐（${resolvedVariants.length}）`}
                variants={resolvedVariants}
                matrix={matrix}
                shopCurrency={product.currency}
                selections={selections}
                onSelect={handleSelect}
                focusVariantId={focusVariantId}
                focusRef={focusRef}
              />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2.5">
          <p className="text-[10px] text-ink-subtle">
            {pendingChanges.length > 0
              ? `${pendingChanges.length} 项待保存`
              : "未修改绑定"}
          </p>
          <div className="flex items-center gap-2">
            {saveError ? (
              <span className="max-w-[8rem] truncate text-[10px] text-red-600">
                {saveError}
              </span>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void save()}
              disabled={saving || !canPick || loading || pendingChanges.length === 0}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              保存绑定
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
