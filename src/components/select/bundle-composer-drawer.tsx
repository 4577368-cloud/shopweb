"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThumbImage } from "@/components/ui/thumb-image";
import {
  createShopBundle,
  type BundleCardStatus,
  type BundlesFeature,
} from "@/lib/bundle/api";
import { readableError } from "@/lib/api";
import type { ShopMirrorProduct } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

export function BundleComposerDrawer({
  open,
  shopName,
  contextProduct,
  catalog,
  feature,
  existing,
  onClose,
  onCreated,
}: {
  open: boolean;
  shopName: string;
  contextProduct: ShopMirrorProduct;
  catalog: ShopMirrorProduct[];
  feature: BundlesFeature | null;
  existing?: BundleCardStatus | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    const seed = contextProduct.title?.trim() || t("bundle.untitled");
    setTitle(t("bundle.defaultTitle", { title: seed }));
    setPrice(
      contextProduct.minPrice != null && Number.isFinite(contextProduct.minPrice)
        ? String(contextProduct.minPrice)
        : ""
    );
    setQuery("");
    setSelected({});
    setSaving(false);
    setError(null);
  }, [contextProduct.minPrice, contextProduct.title, t]);

  useEffect(() => {
    if (!open) return;
    reset();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, reset, saving]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => {
      if (p.thirdPlatformItemId === contextProduct.thirdPlatformItemId) return false;
      if (!q) return true;
      return (
        p.title?.toLowerCase().includes(q) ||
        p.handle?.toLowerCase().includes(q) ||
        p.thirdPlatformItemId.includes(q)
      );
    });
  }, [catalog, contextProduct.thirdPlatformItemId, query]);

  const selectedCount = Object.keys(selected).length;
  const eligible = feature?.eligibleForBundles !== false;
  const canSubmit =
    eligible && selectedCount >= 1 && title.trim().length > 0 && !saving;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  };

  const setQty = (id: string, qty: number) => {
    setSelected((prev) => ({
      ...prev,
      [id]: Math.max(1, Math.min(99, qty)),
    }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const components = Object.entries(selected).map(([productId, quantity]) => ({
        productId,
        quantity,
      }));
      const parentPrice = price.trim() ? Number(price) : null;
      await createShopBundle({
        shopName,
        contextProductId: contextProduct.thirdPlatformItemId,
        title: title.trim(),
        parentPrice:
          parentPrice != null && Number.isFinite(parentPrice) ? parentPrice : null,
        components,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t("bundle.close")}
        className="absolute inset-0 bg-ink/30"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-hairline bg-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              {t("bundle.eyebrow")}
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-ink">
              {existing?.status === "ACTIVE"
                ? t("bundle.editTitle")
                : t("bundle.createTitle")}
            </h2>
            <p className="mt-1 text-[11px] leading-4 text-ink-muted">
              {t("bundle.subtitle")}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 shrink-0 px-0"
            onClick={onClose}
            disabled={saving}
            title={t("bundle.close")}
            aria-label={t("bundle.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="space-y-5">
            {!eligible ? (
              <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
                {feature?.ineligibilityReason?.trim() ||
                  t("bundle.ineligibleDefault")}
              </div>
            ) : null}

            <section className="space-y-2">
              <p className="text-[11px] font-medium text-ink-subtle">
                {t("bundle.parentSection")}
              </p>
              <div className="flex gap-3 rounded-[var(--radius-control)] border border-hairline bg-canvas/60 p-2.5">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
                  {contextProduct.primaryImageUrl ? (
                    <ThumbImage
                      src={contextProduct.primaryImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate text-sm font-medium text-ink">
                    {contextProduct.title || t("bundle.untitled")}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {t("bundle.lockedComponent")}
                  </p>
                  <Input
                    className="h-8 text-xs"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={saving}
                    placeholder={t("bundle.titlePlaceholder")}
                    aria-label={t("bundle.titleLabel")}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-8 w-28 text-xs"
                      type="number"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={saving}
                      placeholder={t("bundle.pricePlaceholder")}
                      aria-label={t("bundle.priceLabel")}
                    />
                    <span className="text-[11px] text-ink-subtle">
                      {contextProduct.currency || "USD"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-ink-subtle">
                  {t("bundle.componentsSection")}
                </p>
                <p className="text-[11px] tabular-nums text-ink-muted">
                  {t("bundle.selectedCount", { count: selectedCount })}
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <Input
                  className="h-8 pl-8 text-xs"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={saving}
                  placeholder={t("bundle.searchPlaceholder")}
                />
              </div>
              <ul className="max-h-[18rem] space-y-1 overflow-y-auto rounded-[var(--radius-control)] border border-hairline p-1">
                {candidates.length === 0 ? (
                  <li className="px-2 py-6 text-center text-xs text-ink-muted">
                    {t("bundle.noCandidates")}
                  </li>
                ) : (
                  candidates.map((p) => {
                    const id = p.thirdPlatformItemId;
                    const on = Boolean(selected[id]);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => toggle(id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left transition-colors",
                            on
                              ? "bg-brand-soft/70 ring-1 ring-brand/15"
                              : "hover:bg-surface-muted/80"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                              on
                                ? "border-[#325BE6] bg-[#325BE6] text-white"
                                : "border-hairline bg-surface text-transparent"
                            )}
                            aria-hidden
                          >
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-hairline bg-surface-muted">
                            {p.primaryImageUrl ? (
                              <ThumbImage
                                src={p.primaryImageUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-ink">
                              {p.title || id}
                            </span>
                            <span className="block text-[10px] text-ink-subtle">
                              {p.minPrice != null
                                ? `${p.currency || "USD"} ${p.minPrice}`
                                : "—"}
                            </span>
                          </span>
                          {on ? (
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={selected[id]}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                setQty(id, Number(e.target.value) || 1)
                              }
                              className="h-7 w-12 rounded border border-hairline bg-surface px-1 text-center text-xs tabular-nums"
                              aria-label={t("bundle.qtyAria")}
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <p className="text-[11px] leading-4 text-ink-subtle">
                {t("bundle.inventoryHint")}
              </p>
            </section>

            {error ? (
              <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={saving}
            onClick={onClose}
          >
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("bundle.syncing")}
              </>
            ) : (
              t("bundle.syncCta")
            )}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
