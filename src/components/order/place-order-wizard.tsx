"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, X } from "@/lib/ui/icons";
import { api } from "@/lib/api";
import {
  logisticsTemplateFromVo,
  createDefaultDeclareConfig,
} from "@/lib/logistics/default-template";
import { buildPackageQueryFormFromTemplate } from "@/lib/logistics/template-params";
import type { PackagingType } from "@/lib/types";
import type { OrderSummary } from "@/lib/order/types";
import {
  buildPackageCreateInfoFromDraft,
  isAddressComplete,
  type PlaceOrderConfirmPayload,
  type PlaceWizardDraft,
  type PlaceDeclareMode,
  type PlaceRegistrationType,
} from "@/lib/order/place-order-types";
import {
  clampDeclareToLine,
  fetchAvailableLines,
  getOrderShippingAddress,
  previewPlaceAmount,
  saveOrderShippingAddress,
  sumGoodsAmountUsd,
} from "@/lib/order/place-logistics-api";
import { PlaceOrderStepItems } from "./place-order-step-items";
import { PlaceOrderStepLogistics } from "./place-order-step-logistics";
import type { OrderShippingAddress } from "@/lib/order/place-order-types";

export interface PlaceOrderWizardProps {
  open: boolean;
  order: OrderSummary | null;
  shopName: string;
  onClose: () => void;
  onConfirm: (payload: PlaceOrderConfirmPayload) => Promise<void>;
}

function emptyDraft(address: OrderShippingAddress, packaging: PackagingType): PlaceWizardDraft {
  return {
    step: 1,
    packaging,
    address,
    lines: [],
    selectedLineId: null,
    declareMode: 0,
    registrationType: 0,
    declareCurrency: "USD",
    tax: 0,
    taxNo: "",
    agreed: true,
  };
}

export function PlaceOrderWizard({
  open,
  order,
  shopName,
  onClose,
  onConfirm,
}: PlaceOrderWizardProps) {
  const t = useT();
  const [draft, setDraft] = useState<PlaceWizardDraft | null>(null);
  const [bootLoading, setBootLoading] = useState(false);
  const [addressSaving, setAddressSaving] = useState(false);
  const previewSeq = useRef(0);
  const linesSeq = useRef(0);
  const templatePrefs = useRef<{
    packaging: PackagingType;
    declareMode: PlaceDeclareMode;
    registrationType: PlaceRegistrationType;
    tax: number;
    taxNo: string;
    currency: string;
  } | null>(null);

  // Boot draft when opened
  useEffect(() => {
    if (!open || !order || !shopName) {
      setDraft(null);
      return;
    }
    let alive = true;
    setBootLoading(true);
    (async () => {
      let packaging: PackagingType = "MINIMAL";
      let declareMode: PlaceDeclareMode = 0;
      let registrationType: PlaceRegistrationType = 0;
      let tax = 0;
      let taxNo = "";
      let currency = "USD";
      try {
        const vo = await api.getLogisticsTemplate(shopName);
        const tpl = logisticsTemplateFromVo(vo, shopName);
        packaging = tpl.packaging ?? "MINIMAL";
        const goods = sumGoodsAmountUsd(order);
        const qf = buildPackageQueryFormFromTemplate(tpl, goods);
        declareMode = (qf.declareMode === 1 ? 1 : 0) as PlaceDeclareMode;
        registrationType = (
          qf.registrationType === 3 || qf.registrationType === 4
            ? qf.registrationType
            : 0
        ) as PlaceRegistrationType;
        tax = qf.tax;
        taxNo = qf.taxNo ?? "";
        currency = qf.currency || "USD";
        templatePrefs.current = {
          packaging,
          declareMode,
          registrationType,
          tax,
          taxNo,
          currency,
        };
      } catch {
        const d = createDefaultDeclareConfig();
        templatePrefs.current = {
          packaging: "MINIMAL",
          declareMode: 0,
          registrationType: 0,
          tax: 0,
          taxNo: "",
          currency: d.declareCurrency || "USD",
        };
      }

      const address = await getOrderShippingAddress({
        shopName,
        outerOrderId: order.shopifyOrderId || order.id,
        order,
      });
      if (!alive) return;
      setDraft({
        ...emptyDraft(address, packaging),
        declareMode,
        registrationType,
        tax,
        taxNo,
        declareCurrency: currency,
      });
      setBootLoading(false);
    })().catch(() => {
      if (!alive) return;
      setBootLoading(false);
      setDraft(
        emptyDraft(
          {
            name: "",
            phone: "",
            zip: "",
            countryCode: order.destinationCountry?.code || "US",
            countryName: order.destinationCountry?.name || "US",
            province: "",
            city: "",
            address1: "",
          },
          "MINIMAL"
        )
      );
    });
    return () => {
      alive = false;
    };
  }, [open, order?.id, shopName]);

  const refreshLines = useCallback(
    async (next: PlaceWizardDraft) => {
      if (!order || !shopName) return;
      const seq = ++linesSeq.current;
      setDraft((d) =>
        d
          ? {
              ...d,
              linesLoading: true,
              linesError: null,
              selectedLineId: null,
              preview: null,
            }
          : d
      );
      try {
        const { lines, orderRecalcBanner } = await fetchAvailableLines({
          shopName,
          outerOrderId: order.shopifyOrderId || order.id,
          order,
          packaging: next.packaging,
          countryCode: next.address.countryCode,
        });
        if (seq !== linesSeq.current) return;

        const recommended =
          lines.find((l) => l.recommended) ?? lines[0] ?? null;
        const prefs = templatePrefs.current;
        const goods = sumGoodsAmountUsd(order);
        let declareMode = prefs?.declareMode ?? next.declareMode;
        let registrationType = prefs?.registrationType ?? next.registrationType;
        let tax = prefs?.tax ?? next.tax;
        let taxNo = prefs?.taxNo ?? next.taxNo;
        let declareClamped = false;
        if (recommended) {
          const clamped = clampDeclareToLine({
            preferredMode: declareMode,
            preferredRegistration: registrationType,
            preferredTax: tax,
            preferredTaxNo: taxNo,
            line: recommended,
            goodsAmountUsd: goods,
          });
          declareMode = clamped.declareMode;
          registrationType = clamped.registrationType;
          tax = clamped.tax;
          taxNo = clamped.taxNo;
          declareClamped = clamped.clamped;
        }

        setDraft((d) =>
          d
            ? {
                ...d,
                lines,
                linesLoading: false,
                orderRecalcBanner,
                selectedLineId: recommended?.lineId ?? null,
                declareMode,
                registrationType,
                tax,
                taxNo,
                declareClamped,
              }
            : d
        );
      } catch (err) {
        if (seq !== linesSeq.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setDraft((d) =>
          d
            ? {
                ...d,
                lines: [],
                linesLoading: false,
                linesError: msg,
                selectedLineId: null,
              }
            : d
        );
      }
    },
    [order, shopName]
  );

  // When entering step 2, load lines
  useEffect(() => {
    if (!draft || draft.step !== 2 || !order) return;
    if (draft.linesLoading) return;
    if (draft.lines.length > 0 || draft.linesError) return;
    void refreshLines(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.step]);

  const runPreview = useCallback(
    async (d: PlaceWizardDraft) => {
      if (!order || !shopName) return;
      const pkg = buildPackageCreateInfoFromDraft(d);
      if (!pkg) {
        setDraft((cur) => (cur ? { ...cur, preview: null } : cur));
        return;
      }
      const seq = ++previewSeq.current;
      setDraft((cur) =>
        cur ? { ...cur, previewLoading: true, previewError: null } : cur
      );
      try {
        const preview = await previewPlaceAmount({
          shopName,
          outerOrderId: order.shopifyOrderId || order.id,
          order,
          packageCreateInfo: pkg,
        });
        if (seq !== previewSeq.current) return;
        setDraft((cur) =>
          cur ? { ...cur, preview, previewLoading: false } : cur
        );
      } catch (err) {
        if (seq !== previewSeq.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setDraft((cur) =>
          cur
            ? { ...cur, preview: null, previewLoading: false, previewError: msg }
            : cur
        );
      }
    },
    [order, shopName]
  );

  // Preview when line / declare / packaging selection settles
  useEffect(() => {
    if (!draft || draft.step !== 2) return;
    if (!draft.selectedLineId || draft.linesLoading) return;
    const tmr = setTimeout(() => void runPreview(draft), 200);
    return () => clearTimeout(tmr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft?.selectedLineId,
    draft?.declareMode,
    draft?.registrationType,
    draft?.tax,
    draft?.taxNo,
    draft?.packaging,
    draft?.step,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !draft?.submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, draft?.submitting, onClose]);

  if (!open || !order) return null;

  const applyLineDeclare = (lineId: number, base: PlaceWizardDraft) => {
    const line = base.lines.find((l) => l.lineId === lineId);
    if (!line || !order) {
      return { ...base, selectedLineId: lineId };
    }
    const prefs = templatePrefs.current;
    const clamped = clampDeclareToLine({
      preferredMode: prefs?.declareMode ?? base.declareMode,
      preferredRegistration: prefs?.registrationType ?? base.registrationType,
      preferredTax: prefs?.tax ?? base.tax,
      preferredTaxNo: prefs?.taxNo ?? base.taxNo,
      line,
      goodsAmountUsd: sumGoodsAmountUsd(order),
    });
    return {
      ...base,
      selectedLineId: lineId,
      declareMode: clamped.declareMode,
      registrationType: clamped.registrationType,
      tax: clamped.tax,
      taxNo: clamped.taxNo,
      declareClamped: clamped.clamped,
    };
  };

  const canSubmit =
    draft &&
    draft.step === 2 &&
    isAddressComplete(draft.address) &&
    draft.selectedLineId != null &&
    draft.preview != null &&
    !draft.linesLoading &&
    !draft.previewLoading &&
    !draft.submitting &&
    (draft.registrationType !== 4 || Boolean(draft.taxNo.trim())) &&
    draft.agreed;

  const handleConfirm = async () => {
    if (!draft || !order || !canSubmit) return;
    const pkg = buildPackageCreateInfoFromDraft(draft);
    if (!pkg || !draft.preview) return;
    setDraft((d) => (d ? { ...d, submitting: true, submitError: null } : d));
    try {
      await onConfirm({
        order,
        packageCreateInfo: pkg,
        preview: draft.preview,
        address: draft.address,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDraft((d) =>
        d ? { ...d, submitting: false, submitError: msg } : d
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !draft?.submitting && onClose()}
        aria-hidden="true"
      />
      <div className="relative flex max-h-[min(92vh,820px)] w-[720px] max-w-[calc(100vw-24px)] flex-col rounded-[var(--radius-card)] border border-hairline bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <p className="text-sm font-semibold text-ink">
            {t("order.placeWizard.title")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            title={t("order.drawer.close")}
            aria-label={t("order.drawer.close")}
            onClick={() => !draft?.submitting && onClose()}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center justify-center gap-3 border-b border-hairline px-5 py-3">
          <StepPill
            n={1}
            label={t("order.placeWizard.step1")}
            active={draft?.step === 1}
            done={(draft?.step ?? 1) > 1}
          />
          <div className="h-px w-10 bg-hairline" />
          <StepPill
            n={2}
            label={t("order.placeWizard.step2")}
            active={draft?.step === 2}
            done={false}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {bootLoading || !draft ? (
            <p className="flex items-center gap-2 text-[12px] text-ink-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("order.placeWizard.booting")}
            </p>
          ) : draft.step === 1 ? (
            <PlaceOrderStepItems order={order} />
          ) : (
            <PlaceOrderStepLogistics
              draft={draft}
              addressSaving={addressSaving}
              onSaveAddress={async (addr) => {
                setAddressSaving(true);
                try {
                  const saved = await saveOrderShippingAddress({
                    shopName,
                    outerOrderId: order.shopifyOrderId || order.id,
                    address: addr,
                  });
                  const countryChanged =
                    saved.countryCode.toUpperCase() !==
                    draft.address.countryCode.toUpperCase();
                  const next = { ...draft, address: saved };
                  setDraft(next);
                  if (countryChanged) {
                    await refreshLines(next);
                  }
                } finally {
                  setAddressSaving(false);
                }
              }}
              onPackagingChange={async (packaging) => {
                const next = {
                  ...draft,
                  packaging,
                  selectedLineId: null,
                  lines: [],
                  linesError: null,
                  preview: null,
                };
                setDraft(next);
                await refreshLines(next);
              }}
              onSelectLine={(lineId) => {
                setDraft((d) => (d ? applyLineDeclare(lineId, d) : d));
              }}
              onDeclareMode={(mode) => {
                setDraft((d) => {
                  if (!d || !order) return d;
                  const line = d.lines.find((l) => l.lineId === d.selectedLineId);
                  let tax = d.tax;
                  if (mode === 1) tax = sumGoodsAmountUsd(order);
                  else if (line?.supported.minFuzzyTax != null) {
                    tax = Math.max(tax, line.supported.minFuzzyTax);
                  }
                  return { ...d, declareMode: mode, tax };
                });
              }}
              onRegistrationType={(reg) => {
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        registrationType: reg,
                        taxNo: reg === 4 ? d.taxNo : "",
                      }
                    : d
                );
              }}
              onTaxChange={(tax) => setDraft((d) => (d ? { ...d, tax } : d))}
              onTaxNoChange={(taxNo) =>
                setDraft((d) => (d ? { ...d, taxNo } : d))
              }
            />
          )}
        </div>

        <div className="border-t border-hairline px-5 py-3">
          {draft?.submitError && (
            <p className="mb-2 text-[11px] text-destructive">
              {draft.submitError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[11px] text-ink-subtle">
              <input
                type="checkbox"
                checked={draft?.agreed ?? true}
                onChange={(e) =>
                  setDraft((d) =>
                    d ? { ...d, agreed: e.target.checked } : d
                  )
                }
              />
              {t("order.placeWizard.agreeTerms")}
            </label>
            <div className="flex items-center gap-2">
              {draft?.step === 2 && (
                <Button
                  size="md"
                  variant="secondary"
                  disabled={draft.submitting}
                  onClick={() =>
                    setDraft((d) => (d ? { ...d, step: 1 } : d))
                  }
                >
                  {t("order.placeWizard.back")}
                </Button>
              )}
              {draft?.step === 1 ? (
                <Button
                  size="md"
                  variant="primary"
                  onClick={() =>
                    setDraft((d) => (d ? { ...d, step: 2 } : d))
                  }
                >
                  {t("order.placeWizard.next")}
                </Button>
              ) : (
                <Button
                  size="md"
                  variant="primary"
                  disabled={!canSubmit}
                  onClick={handleConfirm}
                >
                  {draft?.submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("order.placeWizard.submitting")}
                    </>
                  ) : (
                    t("order.placeWizard.confirmPlace")
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPill({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold",
          active || done
            ? "bg-brand text-primary-foreground"
            : "bg-muted text-ink-subtle"
        )}
      >
        {done ? "✓" : n}
      </span>
      <span
        className={cn(
          "text-[12px]",
          active ? "font-semibold text-ink" : "text-ink-subtle"
        )}
      >
        {label}
      </span>
    </div>
  );
}
