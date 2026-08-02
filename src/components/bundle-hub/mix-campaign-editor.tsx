"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/LocaleProvider";
import { readableError } from "@/lib/api";
import { saveMixCampaign } from "@/lib/bundle/campaign-api";
import type { BundleCampaign, MixMatchRule } from "@/lib/bundle/campaign-types";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import { Loader2 } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

function isBindingReady(
  bindings: Record<string, ImageBindingView>,
  productId: string
): boolean {
  const b = bindings[productId];
  if (!b?.bound || !b.tangbuyProductId) return false;
  return b.bindStatus == null || b.bindStatus === "ACTIVE";
}

export function MixCampaignEditor({
  shopName,
  catalog,
  bindings,
  seedProductIds,
  initial,
  onCancel,
  onSaved,
}: {
  shopName: string;
  catalog: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  seedProductIds?: string[];
  initial?: BundleCampaign | null;
  onCancel: () => void;
  onSaved: (c: BundleCampaign) => void;
}) {
  const t = useT();
  const parsedRule = useMemo(() => {
    if (!initial?.ruleJson) return null;
    try {
      return JSON.parse(initial.ruleJson) as MixMatchRule;
    } catch {
      return null;
    }
  }, [initial?.ruleJson]);
  const parsedPool = useMemo(() => {
    if (!initial?.poolJson) return seedProductIds ?? [];
    try {
      const arr = JSON.parse(initial.poolJson) as string[];
      return Array.isArray(arr) ? arr : seedProductIds ?? [];
    } catch {
      return seedProductIds ?? [];
    }
  }, [initial?.poolJson, seedProductIds]);

  const [title, setTitle] = useState(initial?.title || t("bundleHub.mixDefaultTitle"));
  const [minQty, setMinQty] = useState(String(parsedRule?.minQty ?? 3));
  const [pricingType, setPricingType] = useState<"percent" | "fixed_price">(
    parsedRule?.pricing?.type === "fixed_price" ? "fixed_price" : "percent"
  );
  const [percent, setPercent] = useState(
    parsedRule?.pricing?.type === "percent"
      ? String(parsedRule.pricing.percent)
      : "15"
  );
  const [amount, setAmount] = useState(
    parsedRule?.pricing?.type === "fixed_price"
      ? String(parsedRule.pricing.amount)
      : "99"
  );
  const [pool, setPool] = useState<Set<string>>(new Set(parsedPool));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(
    () =>
      catalog.filter((p) => isBindingReady(bindings, p.thirdPlatformItemId)),
    [bindings, catalog]
  );

  const toggle = (id: string) => {
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    const qty = Math.max(2, Number(minQty) || 2);
    if (!title.trim()) {
      setError(t("bundleHub.errTitle"));
      return;
    }
    if (pool.size < qty) {
      setError(t("bundleHub.errPoolSmall", { count: qty }));
      return;
    }
    const rule: MixMatchRule = {
      kind: "mix_match",
      minQty: qty,
      pricing:
        pricingType === "percent"
          ? {
              type: "percent",
              percent: Math.min(100, Math.max(1, Number(percent) || 1)),
            }
          : {
              type: "fixed_price",
              amount: Math.max(0.01, Number(amount) || 0.01),
            },
      label: title.trim(),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = await saveMixCampaign({
        shopName,
        id: initial?.synthetic ? null : initial?.id,
        title: title.trim(),
        status: "ACTIVE",
        rule,
        poolProductIds: Array.from(pool),
      });
      onSaved(saved);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldMinQty")}</span>
          <Input
            type="number"
            min={2}
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldPricing")}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                "h-9 rounded-md border px-2.5 text-[12px]",
                pricingType === "percent"
                  ? "border-brand-accent bg-brand-soft/40"
                  : "border-hairline"
              )}
              onClick={() => setPricingType("percent")}
              disabled={saving}
            >
              {t("bundleHub.pricingPercent")}
            </button>
            <button
              type="button"
              className={cn(
                "h-9 rounded-md border px-2.5 text-[12px]",
                pricingType === "fixed_price"
                  ? "border-brand-accent bg-brand-soft/40"
                  : "border-hairline"
              )}
              onClick={() => setPricingType("fixed_price")}
              disabled={saving}
            >
              {t("bundleHub.pricingFixed")}
            </button>
            {pricingType === "percent" ? (
              <Input
                className="w-24"
                type="number"
                min={1}
                max={100}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                disabled={saving}
              />
            ) : (
              <Input
                className="w-28"
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
              />
            )}
          </div>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-hairline">
        <div className="border-b border-hairline px-3 py-2 text-[12px] font-semibold text-ink">
          {t("bundleHub.poolTitle", { count: pool.size })}
        </div>
        <div className="max-h-[min(360px,50vh)] space-y-0 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-ink-muted">{t("bundleHub.poolEmpty")}</p>
          ) : (
            candidates.map((p) => {
              const id = p.thirdPlatformItemId;
              const on = pool.has(id);
              return (
                <label
                  key={id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-b border-hairline px-3 py-2 last:border-b-0",
                    on && "bg-brand-soft/20"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(id)}
                    disabled={saving}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {p.title || id}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
      <p className="text-[10px] text-ink-subtle">{t("bundleHub.mixCheckoutHint")}</p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t("bundleHub.cancel")}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("bundleHub.saveMix")}
        </Button>
      </div>
    </div>
  );
}
