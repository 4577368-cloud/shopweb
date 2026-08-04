"use client";

/**
 * Shopify recipient panel — opened from order detail via text link (not inline).
 * Merchants can supplement incomplete fields required for international logistics.
 * Saves to plugin draft address when shop is bound; otherwise localStorage fallback.
 */

import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  isRecipientIncomplete,
  mapShippingAddress,
} from "@/lib/order/api";
import type { OrderRecipient, OrderSummary } from "@/lib/order/types";

const STORAGE_PREFIX = "tangbuy.orderRecipient.";

function loadLocalSupplement(orderId: string): Partial<OrderRecipient> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + orderId);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<OrderRecipient>;
  } catch {
    return null;
  }
}

function saveLocalSupplement(orderId: string, r: OrderRecipient) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + orderId, JSON.stringify(r));
  } catch {
    /* ignore quota */
  }
}

function mergeRecipient(
  base: OrderRecipient | undefined,
  local: Partial<OrderRecipient> | null
): OrderRecipient {
  const merged: OrderRecipient = { ...(base ?? {}), ...(local ?? {}) };
  merged.incomplete = isRecipientIncomplete(merged);
  return merged;
}

const FIELDS: {
  key: keyof OrderRecipient;
  labelKey: string;
  required?: boolean;
}[] = [
  { key: "name", labelKey: "order.recipient.fields.name", required: true },
  { key: "firstName", labelKey: "order.recipient.fields.firstName" },
  { key: "lastName", labelKey: "order.recipient.fields.lastName" },
  { key: "email", labelKey: "order.recipient.fields.email" },
  { key: "phone", labelKey: "order.recipient.fields.phone", required: true },
  { key: "company", labelKey: "order.recipient.fields.company" },
  { key: "address1", labelKey: "order.recipient.fields.address1", required: true },
  { key: "address2", labelKey: "order.recipient.fields.address2" },
  { key: "city", labelKey: "order.recipient.fields.city", required: true },
  { key: "province", labelKey: "order.recipient.fields.province" },
  { key: "zip", labelKey: "order.recipient.fields.zip" },
  { key: "countryCode", labelKey: "order.recipient.fields.countryCode", required: true },
  { key: "country", labelKey: "order.recipient.fields.country" },
];

export interface OrderRecipientPanelProps {
  order: OrderSummary;
  shopName: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (recipient: OrderRecipient) => void;
}

export function OrderRecipientPanel({
  order,
  shopName,
  open,
  onClose,
  onSaved,
}: OrderRecipientPanelProps) {
  const t = useT();
  const [draft, setDraft] = useState<OrderRecipient>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(mergeRecipient(order.recipient, loadLocalSupplement(order.id)));
    setError(null);
    setSavedHint(false);
  }, [open, order.id, order.recipient]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const incomplete = isRecipientIncomplete(draft);

  function setField(key: keyof OrderRecipient, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      next.incomplete = isRecipientIncomplete(next);
      return next;
    });
    setSavedHint(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = {
        email: draft.email ?? null,
        firstName: draft.firstName ?? null,
        lastName: draft.lastName ?? null,
        name: draft.name ?? null,
        company: draft.company ?? null,
        phone: draft.phone ?? null,
        address1: draft.address1 ?? null,
        address2: draft.address2 ?? null,
        city: draft.city ?? null,
        province: draft.province ?? null,
        zip: draft.zip ?? null,
        country: draft.country ?? null,
        countryCode: draft.countryCode ?? null,
      };
      let next = { ...draft, incomplete: isRecipientIncomplete(draft) };
      if (shopName) {
        try {
          const saved = await api.updateOrderShippingAddress(
            shopName,
            order.shopifyOrderId || order.id,
            body
          );
          next = {
            ...(mapShippingAddress(saved) ?? next),
            incomplete: isRecipientIncomplete(mapShippingAddress(saved) ?? next),
          };
        } catch {
          // Backend may be unavailable / draft missing — keep local supplement.
          saveLocalSupplement(order.id, next);
        }
      } else {
        saveLocalSupplement(order.id, next);
      }
      onSaved?.(next);
      setDraft(next);
      setSavedHint(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("order.recipient.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {t("order.recipient.title")}
            </p>
            <p className="text-[11px] text-ink-subtle">
              {order.shopOrderNo} · {t("order.recipient.subtitle")}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 px-0"
            onClick={onClose}
            title={t("order.drawer.close")}
            aria-label={t("order.drawer.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {incomplete ? (
            <p className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-ink">
              {t("order.recipient.incompleteHint")}
            </p>
          ) : (
            <p className="text-[11px] text-ink-subtle">{t("order.recipient.completeHint")}</p>
          )}

          <div className="space-y-2.5">
            {FIELDS.map((f) => {
              const value = (draft[f.key] as string | undefined) ?? "";
              const missing = Boolean(f.required && !String(value).trim());
              return (
                <label key={f.key} className="block space-y-1">
                  <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                    {t(f.labelKey)}
                    {f.required ? (
                      <span className="text-danger">*</span>
                    ) : null}
                  </span>
                  <Input
                    value={value}
                    onChange={(e) => setField(f.key, e.target.value)}
                    className={cn(
                      "h-8 text-xs",
                      missing && "border-warning focus-visible:ring-warning/30"
                    )}
                    autoComplete="off"
                  />
                </label>
              );
            })}
          </div>

          {error ? (
            <p className="text-[11px] text-danger">{error}</p>
          ) : null}
          {savedHint ? (
            <p className="text-[11px] text-ink-subtle">{t("order.recipient.saved")}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t("order.recipient.close")}
          </Button>
          <Button size="sm" variant="primary" disabled={saving} onClick={() => void handleSave()}>
            {saving ? t("order.recipient.saving") : t("order.recipient.save")}
          </Button>
        </div>
      </aside>
    </div>
  );
}
