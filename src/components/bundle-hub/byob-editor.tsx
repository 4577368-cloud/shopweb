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
import { cn } from "@/lib/utils";

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

function roleTitleKey(role: ByobSlot["role"]): string {
  switch (role) {
    case "main":
      return "bundleHub.roleMain";
    case "accessory":
      return "bundleHub.roleAccessory";
    case "gift":
      return "bundleHub.roleGift";
    default:
      return "bundleHub.roleOther";
  }
}

/** Avoid browser number quirks that produce leading zeros like "01". */
function parseQty(raw: string, fallback: number, min: number): number {
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned === "") return fallback;
  const n = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, n);
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

  const isReady = (productId: string) => {
    const b = bindings[productId];
    if (!b?.bound || !b.tangbuyProductId) return false;
    return b.bindStatus == null || b.bindStatus === "ACTIVE";
  };

  const candidates = catalog;

  const togglePool = (slotId: string, productId: string) => {
    if (!isReady(productId)) return;
    setSlots((all) =>
      all.map((s) => {
        if (s.id !== slotId) return s;
        const set = new Set(s.poolProductIds);
        if (set.has(productId)) set.delete(productId);
        else set.add(productId);
        return { ...s, poolProductIds: Array.from(set) };
      })
    );
  };

  const submit = async (status: "DRAFT" | "ACTIVE") => {
    if (!title.trim()) {
      setError(t("bundleHub.errTitle"));
      return;
    }
    const byId = new Map(
      catalog.map((p) => [p.thirdPlatformItemId, p] as const)
    );
    const normalized = slots.map((s) => {
      const poolProductIds = s.poolProductIds;
      const poolProducts = poolProductIds.map((id) => {
        const p = byId.get(id);
        return {
          id,
          handle: p?.handle ?? undefined,
          title: p?.title ?? undefined,
        };
      });
      return {
        ...s,
        min: Math.max(0, s.min),
        max: Math.max(1, s.max),
        title: s.title.trim() || t(roleTitleKey(s.role)),
        poolProductIds,
        poolProducts,
      };
    });
    for (let i = 0; i < normalized.length; i++) {
      const slot = normalized[i];
      if (slot.min > slot.max) {
        setError(t("bundleHub.errSlotMinMax", { index: i + 1 }));
        return;
      }
      // Optional slots (min=0) may stay empty; required slots need a pool.
      if (slot.min > 0 && slot.poolProductIds.length === 0) {
        setError(t("bundleHub.errSlotPoolEmpty", { index: i + 1 }));
        return;
      }
    }
    if (!normalized.some((s) => s.poolProductIds.length > 0)) {
      setError(t("bundleHub.errByobNoPool"));
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
        status,
        rule: { kind: "byob", slots: normalized, label: title.trim() },
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
      <p className="rounded-md border border-hairline bg-canvas/50 px-2.5 py-2 text-[11px] leading-relaxed text-ink">
        {t("bundleHub.byobPublishHint")}
      </p>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        {t("bundleHub.byobHowTo")}
      </p>
      <p className="rounded-md border border-hairline bg-canvas/50 px-2.5 py-2 text-[11px] leading-relaxed text-ink">
        {t("bundleHub.byobEffectExample")}
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-muted">{t("bundleHub.fieldTitle")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
      </label>

      <div className="space-y-3">
        {slots.map((slot, idx) => (
          <div
            key={slot.id}
            className="rounded-lg border border-hairline bg-canvas/40 px-3 py-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-ink">
                {t("bundleHub.slotLabel", {
                  index: idx + 1,
                  role: t(roleTitleKey(slot.role)),
                })}
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

            <label className="mt-2 block space-y-1">
              <span className="text-[11px] text-ink-muted">{t("bundleHub.slotTitle")}</span>
              <Input
                value={slot.title}
                onChange={(e) =>
                  setSlots((all) =>
                    all.map((s) =>
                      s.id === slot.id ? { ...s, title: e.target.value } : s
                    )
                  )
                }
                placeholder={t(roleTitleKey(slot.role))}
                disabled={saving}
              />
            </label>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-[11px] text-ink-muted">{t("bundleHub.slotMin")}</span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(slot.min)}
                  onChange={(e) =>
                    setSlots((all) =>
                      all.map((s) =>
                        s.id === slot.id
                          ? { ...s, min: parseQty(e.target.value, 0, 0) }
                          : s
                      )
                    )
                  }
                  disabled={saving}
                />
                <span className="block text-[10px] text-ink-subtle">
                  {t("bundleHub.slotMinHint")}
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] text-ink-muted">{t("bundleHub.slotMax")}</span>
                <Input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(slot.max)}
                  onChange={(e) =>
                    setSlots((all) =>
                      all.map((s) =>
                        s.id === slot.id
                          ? { ...s, max: parseQty(e.target.value, 1, 1) }
                          : s
                      )
                    )
                  }
                  disabled={saving}
                />
                <span className="block text-[10px] text-ink-subtle">
                  {t("bundleHub.slotMaxHint")}
                </span>
              </label>
            </div>

            <div className="mt-2 overflow-hidden rounded-md border border-hairline">
              <div className="border-b border-hairline px-2.5 py-1.5 text-[11px] font-medium text-ink">
                {t("bundleHub.slotPool", { count: slot.poolProductIds.length })}
              </div>
              <p className="border-b border-hairline px-2.5 py-1.5 text-[10px] text-ink-muted">
                {t("bundleHub.slotPoolHint")}
              </p>
              <div className="max-h-40 overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="px-2.5 py-3 text-[11px] text-ink-muted">
                    {t("bundleHub.poolEmptyCatalog")}
                  </p>
                ) : (
                  candidates.map((p) => {
                    const id = p.thirdPlatformItemId;
                    const ready = isReady(id);
                    const on = slot.poolProductIds.includes(id);
                    return (
                      <label
                        key={id}
                        className={cn(
                          "flex items-center gap-2 border-b border-hairline px-2.5 py-1.5 last:border-b-0",
                          ready ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                          on && "bg-brand-soft/20"
                        )}
                        title={
                          ready
                            ? undefined
                            : t("bundleHub.poolNeedBinding")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePool(slot.id, id)}
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

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t("bundleHub.cancel")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void submit("DRAFT")}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("bundleHub.saveByobDraft")}
        </Button>
        <Button type="button" onClick={() => void submit("ACTIVE")} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t("bundleHub.publishByob")}
        </Button>
      </div>
    </div>
  );
}
