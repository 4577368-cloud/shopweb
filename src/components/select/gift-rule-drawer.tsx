"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";
import { api, readableError } from "@/lib/api";
import { saveGiftRule } from "@/lib/bundle/api";
import type { ImageBindingView, ShopMirrorProduct, ShopMirrorSku } from "@/lib/types";
import { Loader2, X } from "@/lib/ui/icons";

function variantLabel(v: ShopMirrorSku): string {
  return (
    v.title ||
    [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") ||
    v.sku ||
    v.thirdPlatformSkuId
  );
}

function isBindingReady(
  bindings: Record<string, ImageBindingView>,
  productId: string
): boolean {
  const b = bindings[productId];
  if (!b?.bound || !b.tangbuyProductId) return false;
  return b.bindStatus == null || b.bindStatus === "ACTIVE";
}

/**
 * Gift rule drawer — separate from kit dual-track composer.
 * Persists tangbuy_gift.rule; storefront Theme Block syncs gift line;
 * Discount Function applies 100% when trigger qty is met.
 */
export function GiftRuleDrawer({
  open,
  shopName,
  triggerProduct,
  catalog,
  bindings,
  onClose,
  onSaved,
}: {
  open: boolean;
  shopName: string;
  triggerProduct: ShopMirrorProduct;
  catalog: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useT();
  const triggerId = triggerProduct.thirdPlatformItemId;
  const [minQty, setMinQty] = useState("1");
  const [giftProductId, setGiftProductId] = useState("");
  const [giftVariantId, setGiftVariantId] = useState("");
  const [label, setLabel] = useState("");
  const [variants, setVariants] = useState<ShopMirrorSku[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const giftCandidates = useMemo(
    () =>
      catalog.filter(
        (p) =>
          p.thirdPlatformItemId !== triggerId &&
          isBindingReady(bindings, p.thirdPlatformItemId)
      ),
    [bindings, catalog, triggerId]
  );

  const triggerBound = isBindingReady(bindings, triggerId);
  const busy = saving || loadingVariants;

  useEffect(() => {
    if (!open) return;
    setMinQty("1");
    setGiftProductId("");
    setGiftVariantId("");
    setLabel("");
    setVariants([]);
    setSaving(false);
    setError(null);
  }, [open, triggerId]);

  useEffect(() => {
    if (!open || !giftProductId) {
      setVariants([]);
      setGiftVariantId("");
      return;
    }
    let cancelled = false;
    setLoadingVariants(true);
    void (async () => {
      try {
        const detail = await api.getShopProductDetail(shopName, giftProductId);
        if (cancelled) return;
        const list = detail.variants ?? [];
        setVariants(list);
        setGiftVariantId(
          list.length === 1 ? list[0].thirdPlatformSkuId : ""
        );
      } catch {
        if (!cancelled) {
          setVariants([]);
          setGiftVariantId("");
        }
      } finally {
        if (!cancelled) setLoadingVariants(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shopName, giftProductId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, busy]);

  if (!open) return null;

  const canSubmit =
    triggerBound &&
    giftProductId &&
    giftVariantId &&
    Number(minQty) >= 1 &&
    !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await saveGiftRule({
        shopName,
        productId: triggerId,
        kind: "qty_gift",
        minQty: Math.max(1, Number(minQty) || 1),
        giftProductId,
        giftVariantId,
        giftQty: 1,
        label: label.trim() || null,
      });
      onSaved(res.message || t("bundle.giftSaved"));
      onClose();
    } catch (err) {
      setError(readableError(err) || t("bundle.giftSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label={t("bundle.giftClose")}
        disabled={busy}
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gift-rule-title"
        className="relative z-10 flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-hairline bg-surface shadow-xl sm:rounded-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
              {t("bundle.giftTriggerCurrent")}
            </p>
            <h2
              id="gift-rule-title"
              className="truncate text-[15px] font-semibold text-ink"
            >
              {t("bundle.giftTitle")}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-ink-muted">
              {triggerProduct.title || t("bundle.untitled")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 w-7 shrink-0 px-0"
            title={t("bundle.giftClose")}
            aria-label={t("bundle.giftClose")}
            disabled={busy}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {t("bundle.giftHint")}
          </p>

          {!triggerBound ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {t("bundle.giftNeedBinding")}
            </p>
          ) : null}

          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">
              {t("bundle.giftMinQty")}
            </span>
            <Input
              className="h-9 text-[13px] tabular-nums"
              type="number"
              min={1}
              max={99}
              value={minQty}
              disabled={busy || !triggerBound}
              onChange={(e) => setMinQty(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">
              {t("bundle.giftProduct")}
            </span>
            <select
              className="h-9 w-full rounded-md border border-input bg-surface px-2 text-[13px] text-ink outline-none"
              value={giftProductId}
              disabled={busy || !triggerBound || giftCandidates.length === 0}
              onChange={(e) => setGiftProductId(e.target.value)}
            >
              <option value="">{t("bundle.giftPickProduct")}</option>
              {giftCandidates.map((p) => (
                <option
                  key={p.thirdPlatformItemId}
                  value={p.thirdPlatformItemId}
                >
                  {p.title || p.thirdPlatformItemId}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">
              {t("bundle.giftVariant")}
            </span>
            {loadingVariants ? (
              <div className="flex h-9 items-center gap-2 text-[12px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            ) : (
              <select
                className={cn(
                  "h-9 w-full rounded-md border bg-surface px-2 text-[13px] text-ink outline-none",
                  giftProductId && !giftVariantId
                    ? "border-amber-500"
                    : "border-input"
                )}
                value={giftVariantId}
                disabled={busy || !giftProductId || variants.length === 0}
                onChange={(e) => setGiftVariantId(e.target.value)}
              >
                <option value="">
                  {variants.length === 0
                    ? t("bundle.giftNeedVariant")
                    : t("bundle.pickVariant")}
                </option>
                {variants.map((v) => (
                  <option
                    key={v.thirdPlatformSkuId}
                    value={v.thirdPlatformSkuId}
                  >
                    {variantLabel(v)}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">
              {t("bundle.giftLabel")}
            </span>
            <Input
              className="h-9 text-[13px]"
              value={label}
              disabled={busy}
              placeholder={t("bundle.giftLabelPlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            {t("bundle.giftClose")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("bundle.giftSaveCta")}
          </Button>
        </footer>
      </div>
    </div>
  );
}
