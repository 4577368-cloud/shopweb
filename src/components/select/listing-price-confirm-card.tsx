"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "@/lib/ui/icons";
import type {
  ListingPriceScope,
  ProductCommandExecution,
  ProductCommandPlan,
} from "@/lib/agents/products/command-schema";
import {
  formatVariantLabel,
  resolveVariantByLabelHint,
} from "@/lib/agents/products/resolve-variant-target";
import { api, readableError } from "@/lib/api";
import { useT } from "@/i18n/LocaleProvider";
import type { ShopMirrorSku, ShopProductDetail } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatMoney(amount: number | null | undefined, currency?: string | null) {
  if (amount == null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim();
  const n = amount.toFixed(2);
  return cur ? `${n} ${cur}` : n;
}

export function ListingPriceConfirmCard({
  plan,
  shopName,
  executing,
  onConfirm,
  onCancel,
}: {
  plan: ProductCommandPlan;
  shopName: string;
  executing?: boolean;
  onConfirm: (
    execution: Extract<ProductCommandExecution, { type: "listing_price_update" }>
  ) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const productId = plan.draft.productId ?? plan.draft.params.productId;
  const price = plan.draft.params.price;
  const currency = plan.draft.params.currency ?? "USD";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopProductDetail | null>(null);
  const [scope, setScope] = useState<ListingPriceScope | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [hintNote, setHintNote] = useState<string | null>(null);

  const variants = detail?.variants ?? [];
  const multi = variants.length > 1;

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .getShopProductDetail(shopName, productId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        const rows = d.variants ?? [];
        const draft = plan.draft.params;

        if (rows.length <= 1) {
          setScope("one");
          setSelectedSkuId(rows[0]?.thirdPlatformSkuId ?? null);
          return;
        }

        if (draft.priceScope === "all") {
          setScope("all");
          return;
        }

        if (draft.variantSkuId) {
          setScope("one");
          setSelectedSkuId(draft.variantSkuId);
          return;
        }

        if (draft.variantLabelHint) {
          const resolved = resolveVariantByLabelHint(
            draft.variantLabelHint,
            rows
          );
          if (resolved.status === "resolved") {
            setScope("one");
            setSelectedSkuId(resolved.thirdPlatformSkuId);
            setHintNote(
              t("commandUi.hintPreselected", {
                hint: draft.variantLabelHint,
                label: resolved.label,
              })
            );
            return;
          }
          if (resolved.status === "ambiguous") {
            setHintNote(
              t("commandUi.hintAmbiguous", {
                hint: draft.variantLabelHint,
                matches: resolved.matches.map((m) => m.label).join(", "),
              })
            );
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(readableError(err, t));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shopName, productId, plan.draft.params, t]);

  const canConfirm = useMemo(() => {
    if (price == null || !productId) return false;
    if (!multi) return Boolean(selectedSkuId);
    if (scope === "all") return true;
    if (scope === "one") return Boolean(selectedSkuId);
    return false;
  }, [price, productId, multi, scope, selectedSkuId]);

  const handleConfirm = () => {
    if (!canConfirm || price == null || !productId) return;
    const variantScope: ListingPriceScope = scope === "all" ? "all" : "one";
    onConfirm({
      type: "listing_price_update",
      productId,
      productTitle: plan.targetLabel,
      price,
      currency,
      variantScope,
      variantSkuId:
        variantScope === "one" ? selectedSkuId ?? undefined : undefined,
    });
  };

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800/80">
        {t("commandUi.confirmHeader")}
      </p>
      <h3 className="mt-0.5 text-xs font-semibold text-amber-950">
        {plan.operation}
      </h3>
      <dl className="mt-2 space-y-1 text-[11px] text-amber-950">
        <div className="flex gap-2">
          <dt className="shrink-0 text-amber-800/80">{t("commandUi.targetLabel")}</dt>
          <dd className="min-w-0 font-medium">{plan.targetLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0 text-amber-800/80">{t("commandUi.newPrice")}</dt>
          <dd className="min-w-0 font-medium tabular-nums">
            {currency} {price?.toFixed(2)}
          </dd>
        </div>
      </dl>

      {loading ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-slate-100/80 px-3 py-2.5">
          <span className="inline-flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
          </span>
          <span className="text-[11px] text-slate-500">{t("commandUi.loadingVariants")}</span>
        </div>
      ) : error ? (
        <p className="mt-2 text-[11px] text-red-700">{error}</p>
      ) : multi ? (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-amber-900/90">
            {t("commandUi.multiVariantHint", { count: variants.length })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={executing}
              onClick={() => {
                setScope("all");
                setSelectedSkuId(null);
              }}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                scope === "all"
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-amber-200 bg-white text-amber-950 hover:border-amber-300"
              )}
            >
              {t("commandUi.allVariantsUnified")}
            </button>
            <button
              type="button"
              disabled={executing}
              onClick={() => setScope("one")}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                scope === "one"
                  ? "border-sky-400 bg-sky-50 text-sky-800"
                  : "border-amber-200 bg-white text-amber-950 hover:border-amber-300"
              )}
            >
              {t("commandUi.singleVariantOnly")}
            </button>
          </div>
          {hintNote ? (
            <p className="text-[10px] leading-4 text-amber-800/85">{hintNote}</p>
          ) : null}
          <div className="max-h-36 overflow-y-auto rounded border border-amber-200/80 bg-white/70">
            <table className="w-full text-left text-[10px]">
              <thead className="sticky top-0 bg-amber-50/95 text-amber-800/80">
                <tr>
                  {scope === "one" ? <th className="w-7 px-1.5 py-1" /> : null}
                  <th className="px-2 py-1 font-medium">{t("commandUi.colVariant")}</th>
                  <th className="px-2 py-1 font-medium">{t("commandUi.colCurrentPrice")}</th>
                  <th className="px-2 py-1 font-medium">{t("commandUi.colAfter")}</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <VariantRow
                    key={v.thirdPlatformSkuId}
                    variant={v}
                    currency={detail?.currency ?? currency}
                    nextPrice={price ?? 0}
                    scope={scope}
                    selected={selectedSkuId === v.thirdPlatformSkuId}
                    onSelect={() => {
                      setScope("one");
                      setSelectedSkuId(v.thirdPlatformSkuId);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {scope === null ? (
            <p className="text-[10px] text-amber-800/85">{t("commandUi.selectScopeHint")}</p>
          ) : null}
        </div>
      ) : variants.length === 1 ? (
        <p className="mt-2 text-[11px] text-amber-900/85">
          {t("commandUi.singleVariantSummary", {
            label: formatVariantLabel(variants[0]!),
            current: formatMoney(variants[0]!.price, detail?.currency ?? currency),
            next: formatMoney(price, currency),
          })}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-red-700">{t("commandUi.noVariants")}</p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={executing || !canConfirm}
          onClick={handleConfirm}
        >
          {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {executing ? t("commandUi.executing") : t("commandUi.confirmModify")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          disabled={executing}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

function VariantRow({
  variant,
  currency,
  nextPrice,
  scope,
  selected,
  onSelect,
}: {
  variant: ShopMirrorSku;
  currency?: string | null;
  nextPrice: number;
  scope: ListingPriceScope | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const showNext =
    scope === "all" || (scope === "one" && selected);
  return (
    <tr
      className={cn(
        "border-t border-amber-100/80",
        scope === "one" && selected && "bg-sky-50/60",
        scope !== "all" && "cursor-pointer hover:bg-amber-50/50"
      )}
      onClick={() => {
        if (scope !== "all") onSelect();
      }}
    >
      {scope === "one" ? (
        <td className="px-1.5 py-1.5 text-center">
          <input
            type="radio"
            name="variant-price-target"
            checked={selected}
            onChange={onSelect}
            className="h-3 w-3 accent-sky-600"
            aria-label={`Select ${formatVariantLabel(variant)}`}
          />
        </td>
      ) : null}
      <td className="px-2 py-1.5 font-medium text-amber-950">
        {formatVariantLabel(variant)}
      </td>
      <td className="px-2 py-1.5 tabular-nums text-amber-900/85">
        {formatMoney(variant.price, currency)}
      </td>
      <td className="px-2 py-1.5 tabular-nums font-medium text-amber-950">
        {showNext ? formatMoney(nextPrice, currency) : "—"}
      </td>
    </tr>
  );
}
