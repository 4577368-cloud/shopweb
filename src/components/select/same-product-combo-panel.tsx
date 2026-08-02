"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { api } from "@/lib/api";
import {
  saveSameProductCombo,
  type SameProductComboKind,
} from "@/lib/bundle/api";
import type { ShopMirrorSku } from "@/lib/types";
import { Loader2 } from "@/lib/ui/icons";

function variantLabel(v: ShopMirrorSku): string {
  return (
    v.title ||
    [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") ||
    v.sku ||
    v.thirdPlatformSkuId
  );
}

/**
 * Track B — same-product combo (qty discount or two variants).
 * Does not create a Fixed Bundle parent product.
 */
export function SameProductComboPanel({
  shopName,
  productId,
  currency,
  busy: parentBusy,
  onSaved,
  onCancel,
}: {
  shopName: string;
  productId: string;
  currency: string;
  busy?: boolean;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<SameProductComboKind>("qty_discount");
  const [qty, setQty] = useState("2");
  const [discountPercent, setDiscountPercent] = useState("10");
  const [variantA, setVariantA] = useState<string>("");
  const [variantB, setVariantB] = useState<string>("");
  const [label, setLabel] = useState("");
  const [variants, setVariants] = useState<ShopMirrorSku[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = parentBusy || saving || loadingVariants;

  useEffect(() => {
    let cancelled = false;
    setLoadingVariants(true);
    void (async () => {
      try {
        const detail = await api.getShopProductDetail(shopName, productId);
        if (cancelled) return;
        const list = detail.variants ?? [];
        setVariants(list);
        if (list.length === 1) {
          setVariantA(list[0].thirdPlatformSkuId);
        }
      } catch {
        if (!cancelled) setVariants([]);
      } finally {
        if (!cancelled) setLoadingVariants(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopName, productId]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const discountRaw = discountPercent.trim() ? Number(discountPercent) : null;
      const discount =
        discountRaw != null && Number.isFinite(discountRaw)
          ? Math.min(100, Math.max(0, discountRaw))
          : null;
      const res = await saveSameProductCombo({
        shopName,
        productId,
        kind,
        label: label.trim() || null,
        ...(kind === "qty_discount"
          ? {
              qty: Math.max(2, Number(qty) || 2),
              discountPercent: discount,
            }
          : {
              variantIds: [variantA, variantB].filter(Boolean),
              discountPercent: discount,
            }),
      });
      onSaved(
        res.message?.trim() ||
          t("bundle.comboSavedPending")
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("bundle.comboSaveFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    !busy &&
    (kind === "qty_discount"
      ? Number(qty) >= 2 && discountPercent.trim().length > 0
      : Boolean(variantA && variantB && variantA !== variantB));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
        <p className="text-[12px] leading-5 text-ink-muted">
          {t("bundle.comboTrackHint")}
        </p>

        <label className="block space-y-1">
          <span className="text-[11px] text-ink-muted">{t("bundle.comboKindLabel")}</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-surface px-2 text-[13px] text-ink"
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as SameProductComboKind)}
          >
            <option value="qty_discount">{t("bundle.comboKindQty")}</option>
            <option value="variant_pair">{t("bundle.comboKindVariants")}</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] text-ink-muted">
            {t("bundle.comboLabel")}
          </span>
          <input
            className="h-9 w-full rounded-md border border-input bg-surface px-2.5 text-[13px] text-ink outline-none"
            value={label}
            disabled={busy}
            placeholder={t("bundle.comboLabelPlaceholder")}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>

        {kind === "qty_discount" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1">
              <span className="text-[11px] text-ink-muted">
                {t("bundle.comboQty")}
              </span>
              <input
                type="number"
                min={2}
                max={99}
                className="h-9 w-full rounded-md border border-input bg-surface px-2.5 text-[13px] tabular-nums text-ink outline-none"
                value={qty}
                disabled={busy}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] text-ink-muted">
                {t("bundle.comboDiscountPercent")}
              </span>
              <div className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-surface">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] tabular-nums outline-none"
                  value={discountPercent}
                  disabled={busy}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                />
                <span className="border-l border-hairline px-2 text-[11px] text-ink-subtle">
                  %
                </span>
              </div>
              <span className="block text-[10px] text-ink-subtle">
                {t("bundle.comboDiscountHint", {
                  percent: Math.min(100, Math.max(0, Number(discountPercent) || 0)),
                })}
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-2">
            {loadingVariants ? (
              <p className="flex items-center gap-2 text-[11px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("bundle.syncing")}
              </p>
            ) : variants.length < 2 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                {t("bundle.comboNeedTwoVariants")}
              </p>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.comboVariantA")}
                  </span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-surface px-2 text-[13px] text-ink"
                    value={variantA}
                    disabled={busy}
                    onChange={(e) => setVariantA(e.target.value)}
                  >
                    <option value="">{t("bundle.pickVariant")}</option>
                    {variants.map((v) => (
                      <option
                        key={v.thirdPlatformSkuId}
                        value={v.thirdPlatformSkuId}
                      >
                        {variantLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.comboVariantB")}
                  </span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-surface px-2 text-[13px] text-ink"
                    value={variantB}
                    disabled={busy}
                    onChange={(e) => setVariantB(e.target.value)}
                  >
                    <option value="">{t("bundle.pickVariant")}</option>
                    {variants.map((v) => (
                      <option
                        key={v.thirdPlatformSkuId}
                        value={v.thirdPlatformSkuId}
                      >
                        {variantLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.comboDiscountPercent")}
                  </span>
                  <div className="flex h-9 max-w-[10rem] items-center overflow-hidden rounded-md border border-input bg-surface">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] tabular-nums outline-none"
                      value={discountPercent}
                      disabled={busy}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                    />
                    <span className="border-l border-hairline px-2 text-[11px] text-ink-subtle">
                      %
                    </span>
                  </div>
                  <span className="block text-[10px] text-ink-subtle">
                    {t("bundle.comboDiscountHint", {
                      percent: Math.min(
                        100,
                        Math.max(0, Number(discountPercent) || 0)
                      ),
                    })}
                  </span>
                </label>
              </>
            )}
          </div>
        )}

        <p className="rounded-md border border-hairline bg-canvas/50 px-3 py-2 text-[11px] leading-4 text-ink-subtle">
          {t("bundle.comboCheckoutPending", { currency })}
        </p>

        {error ? (
          <p className="text-[11px] text-red-700">{error}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-hairline bg-surface px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          {t("bundle.close")}
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
          {t("bundle.comboSaveCta")}
        </Button>
      </div>
    </div>
  );
}
