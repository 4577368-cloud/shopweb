"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/LocaleProvider";
import { readableError } from "@/lib/api";
import { saveMixCampaign } from "@/lib/bundle/campaign-api";
import type { BundleCampaign, MixMatchRule } from "@/lib/bundle/campaign-types";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import { Loader2 } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { BundleHelpBubble } from "@/components/bundle-hub/bundle-help-bubble";
import { BundleAiNameButton } from "@/components/bundle-hub/bundle-ai-name-button";

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

  const candidates = catalog;
  const qtyNum = Math.max(2, Number(minQty) || 2);
  const pctNum = Math.min(100, Math.max(1, Number(percent) || 1));
  const amountNum = Math.max(0.01, Number(amount) || 0.01);

  const ruleSummary =
    pricingType === "percent"
      ? t("bundleHub.mixRuleSummaryPercent", {
          qty: qtyNum,
          percent: pctNum,
        })
      : t("bundleHub.mixRuleSummaryFixed", {
          qty: qtyNum,
          amount: amountNum,
        });

  const toggle = (id: string) => {
    if (!isBindingReady(bindings, id)) return;
    setPool((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim()) {
      setError(t("bundleHub.errTitle"));
      return;
    }
    if (pool.size < qtyNum) {
      setError(t("bundleHub.errPoolSmall", { count: qtyNum }));
      return;
    }
    const rule: MixMatchRule = {
      kind: "mix_match",
      minQty: qtyNum,
      pricing:
        pricingType === "percent"
          ? { type: "percent", percent: pctNum }
          : { type: "fixed_price", amount: amountNum },
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
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-muted">
          {t("bundleHub.mixHowTo")}
        </p>
        <BundleHelpBubble guideId="mix" className="shrink-0" />
      </div>

      <label className="block space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldTitle")}</span>
          <BundleAiNameButton
            kind="mix_title"
            disabled={saving}
            onError={(msg) => setError(msg)}
            context={{
              minQty: qtyNum,
              pricingType,
              percent: pctNum,
              fixedAmount: String(amountNum),
              poolTitles: candidates
                .filter((p) => pool.has(p.thirdPlatformItemId))
                .map((p) => p.title)
                .filter(Boolean)
                .slice(0, 8),
            }}
            onNamed={setTitle}
          />
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
      </label>

      <div className="rounded-lg border border-hairline bg-canvas/40 px-3 py-2.5">
        <p className="mb-2 text-[12px] font-semibold text-ink">
          {t("bundleHub.mixRuleSection")}
        </p>
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
            <span className="block text-[10px] text-ink-subtle">
              {t("bundleHub.fieldMinQtyHint")}
            </span>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldPricing")}</span>
            <Select
              value={pricingType}
              disabled={saving}
              onChange={(e) =>
                setPricingType(e.target.value as "percent" | "fixed_price")
              }
            >
              <option value="percent">{t("bundleHub.pricingPercent")}</option>
              <option value="fixed_price">{t("bundleHub.pricingFixed")}</option>
            </Select>
            <span className="block text-[10px] text-ink-subtle">
              {pricingType === "percent"
                ? t("bundleHub.pricingPercentHint")
                : t("bundleHub.pricingFixedHint")}
            </span>
          </label>
          {pricingType === "percent" ? (
            <label className="block space-y-1">
              <span className="text-[11px] text-ink-muted">
                {t("bundleHub.fieldDiscountPercent")}
              </span>
              <div className="flex h-9 items-center overflow-hidden rounded-[var(--radius-control)] border border-input bg-surface">
                <Input
                  className="h-full border-0 shadow-none focus-visible:ring-0"
                  type="number"
                  min={1}
                  max={100}
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  disabled={saving}
                />
                <span className="shrink-0 border-l border-hairline px-2 text-[11px] text-ink-subtle">
                  %
                </span>
              </div>
              <span className="block text-[10px] text-ink-subtle">
                {t("bundleHub.fieldDiscountPercentHint", {
                  percent: pctNum,
                  remain: Math.max(0, 100 - pctNum),
                })}
              </span>
            </label>
          ) : (
            <label className="block space-y-1">
              <span className="text-[11px] text-ink-muted">
                {t("bundleHub.fieldFixedAmount")}
              </span>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={saving}
              />
              <span className="block text-[10px] text-ink-subtle">
                {t("bundleHub.fieldFixedAmountHint")}
              </span>
            </label>
          )}
        </div>
        <p className="mt-2 rounded-md bg-brand-soft/30 px-2.5 py-1.5 text-[11px] text-ink">
          {ruleSummary}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-hairline">
        <div className="border-b border-hairline px-3 py-2 text-[12px] font-semibold text-ink">
          {t("bundleHub.poolTitle", { count: pool.size })}
        </div>
        <p className="border-b border-hairline px-3 py-1.5 text-[10px] text-ink-muted">
          {t("bundleHub.slotPoolHint")}
        </p>
        <div className="max-h-[min(360px,50vh)] space-y-0 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-ink-muted">
              {t("bundleHub.poolEmptyCatalog")}
            </p>
          ) : (
            candidates.map((p) => {
              const id = p.thirdPlatformItemId;
              const ready = isBindingReady(bindings, id);
              const on = pool.has(id);
              return (
                <label
                  key={id}
                  className={cn(
                    "flex items-center gap-2 border-b border-hairline px-3 py-2 last:border-b-0",
                    ready ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                    on && "bg-brand-soft/20"
                  )}
                  title={ready ? undefined : t("bundleHub.poolNeedBinding")}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(id)}
                    disabled={saving || !ready}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink">
                    {p.title || id}
                  </span>
                  {!ready ? (
                    <span className="shrink-0 text-[10px] text-ink-muted">
                      {t("bundleHub.poolUnboundBadge")}
                    </span>
                  ) : null}
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
