"use client";

import { useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrderShippingAddress } from "@/lib/order/place-order-types";
import { isAddressComplete } from "@/lib/order/place-order-types";

export interface OrderRecipientEditorProps {
  address: OrderShippingAddress;
  incomplete?: boolean;
  onSave: (next: OrderShippingAddress) => void | Promise<void>;
  saving?: boolean;
}

export function OrderRecipientEditor({
  address,
  incomplete,
  onSave,
  saving,
}: OrderRecipientEditorProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address);

  const startEdit = () => {
    setDraft(address);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(address);
    setEditing(false);
  };

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <p className="text-[13px] font-semibold text-ink">
          {t("order.placeWizard.addressEditTitle")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["name", t("order.placeWizard.fieldName")],
              ["phone", t("order.placeWizard.fieldPhone")],
              ["zip", t("order.placeWizard.fieldZip")],
              ["countryCode", t("order.placeWizard.fieldCountry")],
              ["province", t("order.placeWizard.fieldProvince")],
              ["city", t("order.placeWizard.fieldCity")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-[11px] text-ink-muted">
              {label}
              <input
                className="mt-1 h-8 w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-[12px] text-ink"
                value={draft[key] ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="block text-[11px] text-ink-muted sm:col-span-2">
            {t("order.placeWizard.fieldAddress1")}
            <input
              className="mt-1 h-8 w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-[12px] text-ink"
              value={draft.address1}
              onChange={(e) =>
                setDraft((d) => ({ ...d, address1: e.target.value }))
              }
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
            {t("order.placeWizard.cancel")}
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={save}
            disabled={saving || !isAddressComplete(draft)}
          >
            {t("order.placeWizard.saveAddress")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-card)] border bg-surface p-3",
        incomplete ? "border-destructive/60" : "border-dashed border-brand/40"
      )}
    >
      <p className="text-[13px] font-semibold text-ink">{address.name}</p>
      <p className="mt-1 text-[12px] text-ink-muted">
        {address.phone}
        {address.zip ? ` · ${address.zip}` : ""}
      </p>
      <p className="mt-1 text-[12px] text-ink-muted">
        {[address.countryName || address.countryCode, address.province, address.city]
          .filter(Boolean)
          .join(" / ")}
      </p>
      <p className="mt-1 text-[12px] text-ink">{address.address1}</p>
      {incomplete && (
        <p className="mt-2 text-[11px] text-destructive">
          {t("order.placeWizard.addressIncomplete")}
        </p>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="absolute bottom-2 right-2"
        onClick={startEdit}
      >
        {t("order.placeWizard.editAddress")}
      </Button>
    </div>
  );
}
