"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { X, Save, RefreshCw, Check } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import {
  MARKET_GROUPS,
  countryDisplayName,
  marketGroupLabel,
} from "@/lib/logistics/markets";
import {
  marketSelectionForCountry,
  singleCountryCodeFromMarkets,
} from "@/components/logistics/market-multi-select";
import {
  createDefaultDeclareConfig,
  MIN_FUZZY_DECLARE_RATIO,
  normalizeDeclareConfig,
} from "@/lib/logistics/default-template";
import type {
  LogisticsDeclareConfig,
  LogisticsDeclareMode,
  LogisticsRegistrationType,
  LogisticsTemplate,
  LogisticsTemplateUpsert,
  PackagingType,
} from "@/lib/types";

export function LogisticsTemplateDrawer({
  shopName,
  activeTemplate,
  onSave,
  onClose,
}: {
  shopName: string;
  activeTemplate: LogisticsTemplate | null;
  onSave: (template: LogisticsTemplateUpsert) => Promise<LogisticsTemplate>;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LogisticsTemplate>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packagingOptions = useMemo(
    () =>
      [
        {
          value: "MINIMAL" as PackagingType,
          label: t("logisticsTemplate.packMinimalLabel"),
          hint: t("logisticsTemplate.packMinimalHint"),
        },
        {
          value: "CARTON" as PackagingType,
          label: t("logisticsTemplate.packCartonLabel"),
          hint: t("logisticsTemplate.packCartonHint"),
        },
      ],
    [t]
  );

  const taxOptions = useMemo(
    () =>
      [
        {
          value: 0 as LogisticsRegistrationType,
          label: t("logisticsTemplate.taxExemptLabel"),
          hint: t("logisticsTemplate.taxExemptHint"),
        },
        {
          value: 3 as LogisticsRegistrationType,
          label: t("logisticsTemplate.taxPlatformIossLabel"),
          hint: t("logisticsTemplate.taxPlatformIossHint"),
        },
        {
          value: 4 as LogisticsRegistrationType,
          label: t("logisticsTemplate.taxPersonalIossLabel"),
          hint: t("logisticsTemplate.taxPersonalIossHint"),
        },
      ],
    [t]
  );

  const declareModeOptions = useMemo(
    () =>
      [
        {
          value: 0 as LogisticsDeclareMode,
          label: t("logisticsTemplate.declareFuzzyLabel"),
          hint: t("logisticsTemplate.declareFuzzyHint"),
        },
        {
          value: 1 as LogisticsDeclareMode,
          label: t("logisticsTemplate.declareSelfLabel"),
          hint: t("logisticsTemplate.declareSelfHint"),
        },
      ],
    [t]
  );

  const declareConfig: LogisticsDeclareConfig = useMemo(
    () => normalizeDeclareConfig(formData.declareConfig),
    [formData.declareConfig]
  );

  useEffect(() => {
    if (activeTemplate) {
      const single = singleCountryCodeFromMarkets(activeTemplate.markets);
      const normalized = single
        ? {
            ...activeTemplate,
            markets: marketSelectionForCountry(single),
            declareConfig: normalizeDeclareConfig(activeTemplate.declareConfig),
          }
        : {
            ...activeTemplate,
            declareConfig: normalizeDeclareConfig(activeTemplate.declareConfig),
          };
      setFormData(normalized);
      if (single) {
        const group = MARKET_GROUPS.find((g) =>
          g.countries.some((c) => c.code === single)
        );
        setSelectedGroupId(group?.id ?? null);
      } else {
        setSelectedGroupId(null);
      }
    } else {
      setFormData({
        shopName,
        packaging: "MINIMAL",
        markets: [],
        declareConfig: createDefaultDeclareConfig(),
      });
      setSelectedGroupId(null);
    }
  }, [activeTemplate, shopName]);

  const selectedCountry = useMemo(
    () => singleCountryCodeFromMarkets(formData.markets ?? []),
    [formData.markets]
  );

  const selectedGroup = useMemo(() => {
    return MARKET_GROUPS.find((g) => g.id === selectedGroupId);
  }, [selectedGroupId]);

  const selectCountry = useCallback((code: string) => {
    setFormData((prev) => ({
      ...prev,
      markets: marketSelectionForCountry(code),
    }));
  }, []);

  const patchDeclare = useCallback((patch: Partial<LogisticsDeclareConfig>) => {
    setFormData((prev) => ({
      ...prev,
      declareConfig: normalizeDeclareConfig({
        ...createDefaultDeclareConfig(),
        ...prev.declareConfig,
        ...patch,
      }),
    }));
  }, []);

  const handleSave = async () => {
    if (!shopName.trim()) {
      setError(t("logisticsTemplate.errNoShop"));
      return;
    }
    if (!formData.packaging) {
      setError(t("logisticsTemplate.errPackaging"));
      return;
    }
    if (!selectedCountry) {
      setError(t("logisticsTemplate.errNoCountry"));
      return;
    }
    const declare = normalizeDeclareConfig(formData.declareConfig);
    if (declare.registrationType === 4 && !declare.taxNo?.trim()) {
      setError(t("logisticsTemplate.errTaxNo"));
      return;
    }
    if (
      declare.declareMode === 0 &&
      declare.fuzzyRatio < MIN_FUZZY_DECLARE_RATIO
    ) {
      setError(t("logisticsTemplate.errFuzzyRatio"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const upsertData: LogisticsTemplateUpsert = {
        shopName,
        packaging: formData.packaging,
        markets: marketSelectionForCountry(selectedCountry),
        declareConfig: declare,
      };

      await onSave(upsertData);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetForm = () => {
    setFormData({
      shopName,
      packaging: "MINIMAL",
      markets: [],
      declareConfig: createDefaultDeclareConfig(),
    });
    setSelectedGroupId(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-ink/30"
        aria-label={t("logisticsTemplate.closeAria")}
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-xl">
        <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("logisticsTemplate.title")}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">
              {t("logisticsTemplate.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetForm}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
              title={t("logisticsTemplate.resetAria")}
              aria-label={t("logisticsTemplate.resetAria")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
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
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-ink">
                {t("logisticsTemplate.countryLabel")}
                <span className="ml-1 font-normal text-ink-subtle">
                  {t("logisticsTemplate.countryHint")}
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MARKET_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                      selectedGroupId === group.id
                        ? "bg-brand text-white"
                        : "bg-surface-muted text-ink-subtle hover:bg-surface-muted/80"
                    )}
                  >
                    {marketGroupLabel(group, locale)}
                  </button>
                ))}
              </div>

              {selectedGroup && (
                <div className="mt-3">
                  <p className="mb-2 text-[10px] text-ink-subtle">
                    {marketGroupLabel(selectedGroup, locale)}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {selectedGroup.countries.map((country) => {
                      const isSelected = selectedCountry === country.code;
                      return (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => selectCountry(country.code)}
                          className={cn(
                            "overflow-hidden truncate rounded-[var(--radius-control)] border px-1.5 py-1.5 text-center text-[10px] font-medium transition-colors",
                            isSelected
                              ? "border-brand bg-brand-soft text-brand-strong"
                              : "border-hairline bg-surface text-ink-subtle hover:border-hairline-strong"
                          )}
                        >
                          {isSelected && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                          {countryDisplayName(country, locale)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-ink">
                {t("logisticsTemplate.packagingLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {packagingOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, packaging: o.value }))}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                      formData.packaging === o.value
                        ? "border-brand bg-brand-soft"
                        : "border-hairline bg-surface hover:border-hairline-strong"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        formData.packaging === o.value ? "text-brand-strong" : "text-ink"
                      )}
                    >
                      {o.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-ink">
                {t("logisticsTemplate.taxLabel")}
              </label>
              <div className="grid grid-cols-1 gap-2">
                {taxOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => patchDeclare({ registrationType: o.value })}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                      declareConfig.registrationType === o.value
                        ? "border-brand bg-brand-soft"
                        : "border-hairline bg-surface hover:border-hairline-strong"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        declareConfig.registrationType === o.value
                          ? "text-brand-strong"
                          : "text-ink"
                      )}
                    >
                      {o.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                  </button>
                ))}
              </div>
              {declareConfig.registrationType === 4 ? (
                <div className="mt-2">
                  <label className="mb-1 block text-[11px] text-ink-subtle">
                    {t("logisticsTemplate.taxNoLabel")}
                  </label>
                  <input
                    type="text"
                    value={declareConfig.taxNo ?? ""}
                    onChange={(e) => patchDeclare({ taxNo: e.target.value })}
                    placeholder={t("logisticsTemplate.taxNoPlaceholder")}
                    className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-ink">
                {t("logisticsTemplate.declareModeLabel")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {declareModeOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => patchDeclare({ declareMode: o.value })}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                      declareConfig.declareMode === o.value
                        ? "border-brand bg-brand-soft"
                        : "border-hairline bg-surface hover:border-hairline-strong"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        declareConfig.declareMode === o.value
                          ? "text-brand-strong"
                          : "text-ink"
                      )}
                    >
                      {o.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-ink">
                {t("logisticsTemplate.declareCurrencyLabel")}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => patchDeclare({ declareCurrency: "USD" })}
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-1.5 text-xs font-semibold transition-colors",
                    declareConfig.declareCurrency === "USD"
                      ? "border-brand bg-brand-soft text-brand-strong"
                      : "border-hairline bg-surface text-ink-subtle"
                  )}
                >
                  USD
                </button>
              </div>
            </div>

            {declareConfig.declareMode === 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-ink-subtle">
                    {t("logisticsTemplate.fuzzyRatioLabel")}
                  </label>
                  <input
                    type="number"
                    min={MIN_FUZZY_DECLARE_RATIO}
                    max={100}
                    value={declareConfig.fuzzyRatio}
                    onChange={(e) =>
                      patchDeclare({
                        fuzzyRatio: Number(e.target.value) || MIN_FUZZY_DECLARE_RATIO,
                      })
                    }
                    className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                  <p className="mt-1 text-[10px] text-ink-subtle">
                    {t("logisticsTemplate.fuzzyRatioHint")}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-subtle">
                    {t("logisticsTemplate.declareTaxLabel")}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={declareConfig.tax ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      patchDeclare({
                        tax: v === "" ? null : Number(v),
                      });
                    }}
                    placeholder={t("logisticsTemplate.declareTaxPlaceholder")}
                    className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
                  />
                  <p className="mt-1 text-[10px] text-ink-subtle">
                    {t("logisticsTemplate.declareTaxHint")}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] text-ink-subtle">
                  {t("logisticsTemplate.declareTaxLabel")}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={declareConfig.tax ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    patchDeclare({
                      tax: v === "" ? null : Number(v),
                    });
                  }}
                  placeholder={t("logisticsTemplate.declareTaxSelfPlaceholder")}
                  className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand"
                />
                <p className="mt-1 text-[10px] text-ink-subtle">
                  {t("logisticsTemplate.declareTaxSelfHint")}
                </p>
              </div>
            )}
          </div>

          {error ? (
            <p className="mt-2 text-[11px] text-red-600">{error}</p>
          ) : null}
        </div>

        <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("logisticsTemplate.cancel")}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving || !selectedCountry}>
            <Save className="mr-1 h-3 w-3" />
            {isSaving
              ? t("logisticsTemplate.saving")
              : t("logisticsTemplate.saveTemplate")}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
