"use client";

import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { Loader2 } from "@/lib/ui/icons";
import type { PackagingType } from "@/lib/types";
import type { PlaceWizardDraft } from "@/lib/order/place-order-types";
import { isAddressComplete } from "@/lib/order/place-order-types";
import { OrderRecipientEditor } from "./order-recipient-editor";
import type { OrderShippingAddress } from "@/lib/order/place-order-types";

export interface PlaceOrderStepLogisticsProps {
  draft: PlaceWizardDraft;
  addressSaving?: boolean;
  onSaveAddress: (addr: OrderShippingAddress) => void | Promise<void>;
  onPackagingChange: (packaging: PackagingType) => void;
  onSelectLine: (lineId: number) => void;
  onDeclareMode: (mode: 0 | 1) => void;
  onRegistrationType: (reg: 0 | 3 | 4) => void;
  onTaxChange: (tax: number) => void;
  onTaxNoChange: (taxNo: string) => void;
}

export function PlaceOrderStepLogistics({
  draft,
  addressSaving,
  onSaveAddress,
  onPackagingChange,
  onSelectLine,
  onDeclareMode,
  onRegistrationType,
  onTaxChange,
  onTaxNoChange,
}: PlaceOrderStepLogisticsProps) {
  const t = useT();
  const selected = draft.lines.find((l) => l.lineId === draft.selectedLineId);
  const addrOk = isAddressComplete(draft.address);

  return (
    <div className="space-y-5">
      {draft.orderRecalcBanner && (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          {t("order.placeWizard.orderRecalcBanner")}
        </div>
      )}

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">
          {t("order.placeWizard.addressSection")}
        </h3>
        <OrderRecipientEditor
          address={draft.address}
          incomplete={!addrOk}
          saving={addressSaving}
          onSave={onSaveAddress}
        />
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">
          <span className="text-destructive">*</span>{" "}
          {t("order.placeWizard.packagingSection")}
        </h3>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["MINIMAL", t("order.placeWizard.packagingMinimal")],
              ["CARTON", t("order.placeWizard.packagingCarton")],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[var(--radius-card)] border px-3 py-2 text-[12px]",
                draft.packaging === value
                  ? "border-brand bg-surface-selected"
                  : "border-hairline"
              )}
            >
              <input
                type="radio"
                name="packaging"
                checked={draft.packaging === value}
                onChange={() => onPackagingChange(value)}
              />
              <span className="font-medium text-ink">{label}</span>
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700">
                {t("order.placeWizard.freeTag")}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">
          {t("order.placeWizard.linesSection")}
        </h3>
        {draft.linesLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("order.placeWizard.linesLoading")}
          </p>
        ) : draft.linesError ? (
          <p className="text-[12px] text-destructive">{draft.linesError}</p>
        ) : draft.lines.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-3 py-4 text-[12px] text-ink-muted">
            {t("order.placeWizard.linesEmpty")}
          </div>
        ) : (
          <div className="space-y-2">
            {draft.lines.map((line) => {
              const active = draft.selectedLineId === line.lineId;
              return (
                <button
                  key={line.lineId}
                  type="button"
                  onClick={() => onSelectLine(line.lineId)}
                  className={cn(
                    "w-full rounded-[var(--radius-card)] border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-brand bg-surface-selected"
                      : "border-hairline hover:border-brand/40"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[13px] font-semibold text-ink">
                          {line.lineName}
                        </p>
                        {line.recommended && (
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] text-brand">
                            {t("order.placeWizard.recommended")}
                          </span>
                        )}
                        {(line.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      {line.restrictionSummary && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-ink-subtle">
                          {line.restrictionSummary}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {line.estimateFeeUsd != null && (
                        <p className="text-[13px] font-semibold tabular-nums text-ink">
                          ${line.estimateFeeUsd.toFixed(2)}
                        </p>
                      )}
                      {line.deliveryTime && (
                        <p className="mt-0.5 text-[11px] text-ink-subtle">
                          {line.deliveryTime}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {selected && (
        <section className="space-y-3">
          {draft.declareClamped && (
            <p className="text-[11px] text-amber-800">
              {t("order.placeWizard.declareClamped")}
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink">
              {t("order.placeWizard.registrationLabel")}
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.supported.registrationTypes.map((reg) => (
                <label
                  key={reg}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]",
                    draft.registrationType === reg
                      ? "border-brand bg-surface-selected"
                      : "border-hairline"
                  )}
                >
                  <input
                    type="radio"
                    name="registration"
                    checked={draft.registrationType === reg}
                    onChange={() => onRegistrationType(reg)}
                  />
                  {reg === 0
                    ? t("order.placeWizard.regSelf")
                    : reg === 3
                      ? t("order.placeWizard.regPlatformIoss")
                      : t("order.placeWizard.regPersonalIoss")}
                </label>
              ))}
            </div>
            {draft.registrationType === 4 && (
              <input
                className="mt-2 h-8 w-full max-w-xs rounded-[var(--radius-control)] border border-hairline px-2 text-[12px]"
                placeholder={t("order.placeWizard.taxNoPlaceholder")}
                value={draft.taxNo}
                onChange={(e) => onTaxNoChange(e.target.value)}
              />
            )}
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink">
              {t("order.placeWizard.declareModeLabel")}
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.supported.declareModes.map((mode) => (
                <label
                  key={mode}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px]",
                    draft.declareMode === mode
                      ? "border-brand bg-surface-selected"
                      : "border-hairline"
                  )}
                >
                  <input
                    type="radio"
                    name="declareMode"
                    checked={draft.declareMode === mode}
                    onChange={() => onDeclareMode(mode)}
                  />
                  {mode === 0
                    ? t("order.placeWizard.declareFuzzy")
                    : t("order.placeWizard.declareSelf")}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12px] font-medium text-ink">
              {t("order.placeWizard.declareCurrencyLabel")}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-brand bg-surface-selected px-2.5 py-1.5 text-[12px]">
              <span className="h-2 w-2 rounded-full bg-brand" />
              {draft.declareCurrency || "USD"}
            </span>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-ink">
              {t("order.placeWizard.declareTaxLabel", {
                currency: draft.declareCurrency || "USD",
              })}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              disabled={draft.declareMode === 1}
              className="h-8 w-40 rounded-[var(--radius-control)] border border-hairline px-2 text-[12px] tabular-nums disabled:opacity-60"
              value={Number.isFinite(draft.tax) ? draft.tax : 0}
              onChange={(e) => onTaxChange(Number(e.target.value) || 0)}
            />
            {draft.declareMode === 0 && selected.supported.minFuzzyTax != null && (
              <p className="mt-1 text-[11px] text-ink-subtle">
                {t("order.placeWizard.minFuzzyTax", {
                  min: selected.supported.minFuzzyTax.toFixed(2),
                })}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted px-3 py-3">
        <p className="mb-2 text-[13px] font-semibold text-ink">
          {t("order.placeWizard.feeSummary")}
        </p>
        {draft.previewLoading ? (
          <p className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("order.placeWizard.previewLoading")}
          </p>
        ) : draft.previewError ? (
          <p className="text-[12px] text-destructive">{draft.previewError}</p>
        ) : draft.preview ? (
          <div className="grid grid-cols-2 gap-y-1 text-[12px] text-ink-muted">
            <span>{t("order.placeWizard.goodsAmount")}</span>
            <span className="text-right tabular-nums text-ink">
              ${draft.preview.goodsAmountUsd.toFixed(2)}
            </span>
            <span>{t("order.placeWizard.packageAmount")}</span>
            <span className="text-right tabular-nums text-ink">
              ${draft.preview.packageAmountUsd.toFixed(2)}
            </span>
            <span className="font-semibold text-ink">
              {t("order.placeWizard.payableTotal")}
            </span>
            <span className="text-right text-[14px] font-bold tabular-nums text-ink">
              ${draft.preview.totalUsd.toFixed(2)}
            </span>
          </div>
        ) : (
          <p className="text-[12px] text-ink-subtle">
            {t("order.placeWizard.previewHint")}
          </p>
        )}
      </section>
    </div>
  );
}
