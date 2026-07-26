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
import type {
  LogisticsTemplate,
  LogisticsTemplateUpsert,
  PackagingType,
  LogisticsSpeedPreference,
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

  const speedOptions = useMemo(
    () =>
      [
        {
          value: "ECONOMY" as LogisticsSpeedPreference,
          label: t("logisticsTemplate.speedEconomyLabel"),
          hint: t("logisticsTemplate.speedEconomyHint"),
        },
        {
          value: "FAST" as LogisticsSpeedPreference,
          label: t("logisticsTemplate.speedFastLabel"),
          hint: t("logisticsTemplate.speedFastHint"),
        },
        {
          value: "BALANCED" as LogisticsSpeedPreference,
          label: t("logisticsTemplate.speedBalancedLabel"),
          hint: t("logisticsTemplate.speedBalancedHint"),
        },
      ],
    [t]
  );

  useEffect(() => {
    if (activeTemplate) {
      const single = singleCountryCodeFromMarkets(activeTemplate.markets);
      const normalized = single
        ? { ...activeTemplate, markets: marketSelectionForCountry(single) }
        : activeTemplate;
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
        speedPreference: "BALANCED",
        markets: [],
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

  const handleSave = async () => {
    if (!shopName.trim()) {
      setError(t("logisticsTemplate.errNoShop"));
      return;
    }
    if (!formData.packaging || !formData.speedPreference) {
      setError(t("logisticsTemplate.errPackagingSpeed"));
      return;
    }
    if (!selectedCountry) {
      setError(t("logisticsTemplate.errNoCountry"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const upsertData: LogisticsTemplateUpsert = {
        shopName,
        packaging: formData.packaging,
        speedPreference: formData.speedPreference,
        markets: marketSelectionForCountry(selectedCountry),
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
      speedPreference: "BALANCED",
      markets: [],
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
              <label className="block mb-2 text-xs font-medium text-ink">
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
                            "rounded-[var(--radius-control)] border px-1.5 py-1.5 text-center text-[10px] font-medium transition-colors overflow-hidden truncate",
                            isSelected
                              ? "border-brand bg-brand-soft text-brand-strong"
                              : "border-hairline bg-surface text-ink-subtle hover:border-hairline-strong"
                          )}
                        >
                          {isSelected && <Check className="inline mr-0.5 h-2.5 w-2.5" />}
                          {countryDisplayName(country, locale)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block mb-2 text-xs font-medium text-ink">
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
              <label className="block mb-2 text-xs font-medium text-ink">
                {t("logisticsTemplate.speedLabel")}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {speedOptions.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, speedPreference: o.value }))}
                    className={cn(
                      "rounded-[var(--radius-control)] border px-3 py-2 text-left transition-colors",
                      formData.speedPreference === o.value
                        ? "border-brand bg-brand-soft"
                        : "border-hairline bg-surface hover:border-hairline-strong"
                    )}
                  >
                    <p
                      className={cn(
                        "text-xs font-semibold",
                        formData.speedPreference === o.value ? "text-brand-strong" : "text-ink"
                      )}
                    >
                      {o.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-ink-subtle">{o.hint}</p>
                  </button>
                ))}
              </div>
            </div>
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
