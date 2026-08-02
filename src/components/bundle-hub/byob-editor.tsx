"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/LocaleProvider";
import { readableError } from "@/lib/api";
import { saveByobCampaign } from "@/lib/bundle/campaign-api";
import type { BundleCampaign, ByobSlot } from "@/lib/bundle/campaign-types";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import { Loader2, Plus, Trash2 } from "@/lib/ui/icons";

function newSlot(role: ByobSlot["role"]): ByobSlot {
  return {
    id: `slot-${role}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    title: role,
    min: role === "main" ? 1 : 0,
    max: role === "main" ? 1 : 3,
    poolProductIds: [],
  };
}

/** BYOB slot template editor — persists draft; storefront Block reads metafield. */
export function ByobEditor({
  shopName,
  catalog,
  bindings,
  initial,
  onCancel,
  onSaved,
}: {
  shopName: string;
  catalog: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
  initial?: BundleCampaign | null;
  onCancel: () => void;
  onSaved: (c: BundleCampaign) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(
    initial?.title && initial.id !== "byob-placeholder"
      ? initial.title
      : t("bundleHub.byobDefaultTitle")
  );
  const [slots, setSlots] = useState<ByobSlot[]>(() => {
    if (initial?.ruleJson) {
      try {
        const rule = JSON.parse(initial.ruleJson) as { slots?: ByobSlot[] };
        if (rule.slots?.length) return rule.slots;
      } catch {
        /* fallthrough */
      }
    }
    return [newSlot("main"), newSlot("accessory"), newSlot("gift")];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const boundIds = catalog
    .filter((p) => {
      const b = bindings[p.thirdPlatformItemId];
      return b?.bound && b.tangbuyProductId && (b.bindStatus == null || b.bindStatus === "ACTIVE");
    })
    .map((p) => p.thirdPlatformItemId);

  const submit = async () => {
    if (!title.trim()) {
      setError(t("bundleHub.errTitle"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveByobCampaign({
        shopName,
        id:
          initial?.synthetic || initial?.id === "byob-placeholder"
            ? null
            : initial?.id,
        title: title.trim(),
        status: "DRAFT",
        rule: { kind: "byob", slots, label: title.trim() },
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
      <p className="rounded-md border border-amber-200 bg-amber-50/70 px-2.5 py-2 text-[11px] text-amber-950">
        {t("bundleHub.byobDraftHint")}
      </p>
      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
      </label>

      <div className="space-y-2">
        {slots.map((slot, idx) => (
          <div
            key={slot.id}
            className="rounded-lg border border-hairline bg-canvas/40 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-ink">
                {t("bundleHub.slotLabel", { index: idx + 1, role: slot.role })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 w-7 px-0"
                title={t("bundleHub.removeSlot")}
                aria-label={t("bundleHub.removeSlot")}
                disabled={saving || slots.length <= 1}
                onClick={() => setSlots((s) => s.filter((x) => x.id !== slot.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Input
                value={slot.title}
                onChange={(e) =>
                  setSlots((all) =>
                    all.map((s) =>
                      s.id === slot.id ? { ...s, title: e.target.value } : s
                    )
                  )
                }
                placeholder={t("bundleHub.slotTitle")}
                disabled={saving}
              />
              <Input
                type="number"
                min={0}
                value={slot.min}
                onChange={(e) =>
                  setSlots((all) =>
                    all.map((s) =>
                      s.id === slot.id
                        ? { ...s, min: Math.max(0, Number(e.target.value) || 0) }
                        : s
                    )
                  )
                }
                disabled={saving}
              />
              <Input
                type="number"
                min={1}
                value={slot.max}
                onChange={(e) =>
                  setSlots((all) =>
                    all.map((s) =>
                      s.id === slot.id
                        ? { ...s, max: Math.max(1, Number(e.target.value) || 1) }
                        : s
                    )
                  )
                }
                disabled={saving}
              />
            </div>
            <label className="mt-2 block space-y-1">
              <span className="text-[10px] text-ink-muted">{t("bundleHub.slotPool")}</span>
              <select
                multiple
                className="h-24 w-full rounded-md border border-input bg-surface px-2 text-[11px]"
                value={slot.poolProductIds}
                disabled={saving}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(
                    (o) => o.value
                  );
                  setSlots((all) =>
                    all.map((s) =>
                      s.id === slot.id ? { ...s, poolProductIds: selected } : s
                    )
                  );
                }}
              >
                {boundIds.map((id) => {
                  const p = catalog.find((x) => x.thirdPlatformItemId === id);
                  return (
                    <option key={id} value={id}>
                      {p?.title || id}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="w-fit"
        disabled={saving}
        onClick={() => setSlots((s) => [...s, newSlot("accessory")])}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("bundleHub.addSlot")}
      </Button>

      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t("bundleHub.cancel")}
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("bundleHub.saveByobDraft")}
        </Button>
      </div>
    </div>
  );
}
