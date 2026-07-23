"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CURRENCY_OPTIONS } from "@/lib/catalog-sourcing-types";
import { calculateSalePrice } from "@/lib/price-calculator";
import type { PricingTemplate } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";

function roundingOptions(t: ReturnType<typeof useT>) {
  return [
    { value: "HALF_UP", label: t("pricingDrawer.roundHalfUp") },
    { value: "CEIL", label: t("pricingDrawer.roundCeil") },
    { value: "FLOOR", label: t("pricingDrawer.roundFloor") },
    { value: "CHARM_99", label: t("pricingDrawer.roundCharm99") },
  ];
}

/** Sample procurement amount used only for the calculation breakdown preview. */
const SAMPLE_COST = 33;

interface TemplateForm {
  exchangeRate: string;
  multiplier: string;
  addend: string;
  roundingStrategy: string;
  decimals: string;
  targetCurrency: string;
}

function toForm(t: PricingTemplate): TemplateForm {
  return {
    exchangeRate: String(t.exchangeRate),
    multiplier: String(t.multiplier),
    addend: String(t.addend),
    roundingStrategy: t.roundingStrategy,
    decimals: String(t.decimals),
    targetCurrency: t.targetCurrency,
  };
}

/** Matches backend PricingTemplateService system default — used when template not loaded yet. */
const FALLBACK_FORM: TemplateForm = {
  exchangeRate: "7.2",
  multiplier: "2",
  addend: "0",
  roundingStrategy: "HALF_UP",
  decimals: "2",
  targetCurrency: "USD",
};

export interface PricingTemplateDrawerProps {
  open: boolean;
  template: PricingTemplate | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: {
    exchangeRate: number;
    multiplier: number;
    addend: number;
    roundingStrategy: string;
    decimals: number;
    /** Always persisted as CNY — procurement currency is not user-editable. */
    sourceCurrency: string;
    targetCurrency: string;
  }) => void;
  /** Soft-reset to system default so first-time setup can be experienced again. */
  onClear?: () => void;
  clearing?: boolean;
  /** Highlight the drawer for AI action feedback */
  highlighted?: boolean;
}

function PricingCalculationBreakdown({
  cost,
  rate,
  multiplier,
  addend,
  sale,
  targetCurrency,
  roundingLabel,
}: {
  cost: number;
  rate: number;
  multiplier: number;
  addend: number;
  sale: number | null;
  targetCurrency: string;
  roundingLabel: string;
}) {
  const t = useT();
  const converted = cost / rate;
  const afterMultiplier = converted * multiplier;
  const afterAddend = afterMultiplier + addend;

  return (
    <div className="mt-4 rounded-[var(--radius-control)] border border-hairline bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink">{t("pricingDrawer.calcTitle")}</p>
      <p className="mt-0.5 text-[10px] text-ink-subtle">
        {t("pricingDrawer.calcHint")}
      </p>
      <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
        <li>
          <span className="text-ink-subtle">1. </span>
          {t("pricingDrawer.purchaseLabel")}
          <span className="font-medium text-ink">{cost.toFixed(2)} RMB</span>
        </li>
        <li>
          <span className="text-ink-subtle">2. </span>
          {t("pricingDrawer.fxStep", {
            cost: cost.toFixed(2),
            rate,
            converted: converted.toFixed(2),
          })}{" "}
          <span className="font-medium text-ink">{targetCurrency}</span>
        </li>
        <li>
          <span className="text-ink-subtle">3. </span>
          {t("pricingDrawer.multiplierStep", {
            converted: converted.toFixed(2),
            multiplier,
            afterMul: afterMultiplier.toFixed(2),
          })}{" "}
          <span className="font-medium text-ink">{targetCurrency}</span>
        </li>
        <li>
          <span className="text-ink-subtle">4. </span>
          {t("pricingDrawer.addendStep", {
            afterMul: afterMultiplier.toFixed(2),
            addend,
            afterAdd: afterAddend.toFixed(2),
          })}{" "}
          <span className="font-medium text-ink">{targetCurrency}</span>
        </li>
        <li>
          <span className="text-ink-subtle">5. </span>
          {t("pricingDrawer.roundedResult", { rounding: roundingLabel })}
          <span className="font-semibold text-brand-strong">
            {sale != null ? `${sale.toFixed(2)} ${targetCurrency}` : "—"}
          </span>
        </li>
      </ol>
    </div>
  );
}

/** Side panel editor. Target currency only — procurement FX is always via exchangeRate. */
export function PricingTemplateDrawer({
  open,
  template,
  saving,
  error,
  onClose,
  onSave,
  onClear,
  clearing = false,
  highlighted = false,
}: PricingTemplateDrawerProps) {
  const t = useT();
  const [form, setForm] = useState<TemplateForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(template ? toForm(template) : FALLBACK_FORM);
    setFormError(null);
  }, [open, template]);

  const breakdown = useMemo(() => {
    if (!form) return null;
    const rate = Number(form.exchangeRate);
    const multiplier = Number(form.multiplier);
    const addend = Number(form.addend);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    if (!Number.isFinite(multiplier) || multiplier <= 0) return null;
    if (!Number.isFinite(addend)) return null;
    const sale = calculateSalePrice(SAMPLE_COST, {
      exchangeRate: rate,
      multiplier,
      addend,
      roundingStrategy: form.roundingStrategy,
      decimals: Number.parseInt(form.decimals, 10) || 2,
    });
    return {
      rate,
      multiplier,
      addend,
      sale,
      target: form.targetCurrency,
    };
  }, [form]);

  if (!open) return null;

  const patch = (p: Partial<TemplateForm>) => {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
    setFormError(null);
  };

  const handleSave = () => {
    if (!form || saving) return;
    const exchangeRate = Number(form.exchangeRate);
    const multiplier = Number(form.multiplier);
    const addend = Number(form.addend);
    const decimals = Number.parseInt(form.decimals, 10);

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
      setFormError(t("pricingDrawer.errRate"));
      return;
    }
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      setFormError(t("pricingDrawer.errMultiplier"));
      return;
    }
    if (!Number.isFinite(addend)) {
      setFormError(t("pricingDrawer.errAddend"));
      return;
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
      setFormError(t("pricingDrawer.errDecimals"));
      return;
    }

    onSave({
      exchangeRate,
      multiplier,
      addend,
      roundingStrategy: form.roundingStrategy,
      decimals,
      sourceCurrency: "CNY",
      targetCurrency: form.targetCurrency,
    });
  };

  const roundingOpts = roundingOptions(t);
  const roundingLabel =
    roundingOpts.find((o) => o.value === form?.roundingStrategy)?.label ??
    form?.roundingStrategy ??
    t("pricingDrawer.roundingFallback");

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label={t("pricingDrawer.closeAria")}
        onClick={onClose}
      />
      <aside className={`relative z-10 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-xl transition-all duration-500 ${highlighted ? "ring-2 ring-emerald-400/60" : ""}`}>
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("pricingDrawer.title")}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">
              {t("pricingDrawer.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {template?.isDefault ? (
              <Badge variant="warning">{t("pricingDrawer.badgeDefault")}</Badge>
            ) : (
              <Badge variant="success">{t("pricingDrawer.badgeSaved")}</Badge>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {!form ? (
            <p className="text-xs text-ink-subtle">{t("pricingDrawer.loading")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("pricingDrawer.targetCurrency")} className="col-span-2">
                <Select
                  value={form.targetCurrency}
                  onChange={(e) => patch({ targetCurrency: e.target.value })}
                  disabled={saving}
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("pricingDrawer.exchangeRate")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.exchangeRate}
                  onChange={(e) => patch({ exchangeRate: e.target.value })}
                  disabled={saving}
                />
                <p className="mt-1 text-[10px] leading-relaxed text-ink-subtle">
                  {t("pricingDrawer.rateHint")}
                </p>
              </Field>
              <Field label={t("pricingDrawer.multiplier")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.multiplier}
                  onChange={(e) => patch({ multiplier: e.target.value })}
                  disabled={saving}
                />
              </Field>
              <Field label={t("pricingDrawer.addend")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.addend}
                  onChange={(e) => patch({ addend: e.target.value })}
                  disabled={saving}
                />
                <p className="mt-1 text-[10px] text-ink-subtle">{t("pricingDrawer.addendHint")}</p>
              </Field>
              <Field label={t("pricingDrawer.decimals")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={form.decimals}
                  onChange={(e) => patch({ decimals: e.target.value })}
                  disabled={saving}
                />
                <p className="mt-1 text-[10px] text-ink-subtle">0–4</p>
              </Field>
              <Field label={t("pricingDrawer.roundingStrategy")} className="col-span-2">
                <Select
                  value={form.roundingStrategy}
                  onChange={(e) => patch({ roundingStrategy: e.target.value })}
                  disabled={saving}
                >
                  {roundingOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {breakdown ? (
            <PricingCalculationBreakdown
              cost={SAMPLE_COST}
              rate={breakdown.rate}
              multiplier={breakdown.multiplier}
              addend={breakdown.addend}
              sale={breakdown.sale}
              targetCurrency={breakdown.target}
              roundingLabel={roundingLabel}
            />
          ) : null}

          {(formError || error) && (
            <p className="mt-2 text-[11px] text-red-600">{formError ?? error}</p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <Button onClick={handleSave} disabled={saving || clearing || !form}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? t("pricingDrawer.saving") : t("pricingDrawer.save")}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving || clearing}
          >
            {t("pricingDrawer.cancel")}
          </Button>
          {onClear && template && !template.isDefault ? (
            <button
              type="button"
              onClick={onClear}
              disabled={saving || clearing}
              className="ml-auto text-[11px] text-ink-subtle hover:text-ink hover:underline disabled:opacity-50"
            >
              {clearing ? t("pricingDrawer.clearing") : t("pricingDrawer.restoreDefault")}
            </button>
          ) : null}
        </footer>
      </aside>
    </div>
  );
}
