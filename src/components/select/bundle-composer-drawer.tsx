"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ExternalLink, Loader2, Search, X } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThumbImage } from "@/components/ui/thumb-image";
import {
  createShopBundle,
  dissolveShopBundle,
  getShopBundle,
  updateShopBundle,
  type BundleCardStatus,
  type BundleStatusMap,
  type BundlesFeature,
} from "@/lib/bundle/api";
import { api, readableError } from "@/lib/api";
import { openExternal } from "@/host/adapters/external-link";
import { shopifyProductAdminUrl } from "@/lib/shop-product-external-link";
import type {
  ImageBindingView,
  PricingTemplate,
  ShopMirrorProduct,
  ShopMirrorSku,
} from "@/lib/types";
import {
  costInPurchaseDisplayCurrency,
  formatPurchaseCostMoney,
  resolvePurchaseCostDisplayContext,
} from "@/lib/purchase-cost-display";
import { parseGatewayPrice } from "@/lib/agents/products/match-rank";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";

type SelectedComponent = {
  quantity: number;
  variantId?: string | null;
};

function formatShopPrice(
  currency: string | null | undefined,
  price: number | null | undefined
): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const cur = (currency || "USD").trim() || "USD";
  return `${cur} ${price}`;
}

function isBindingReady(
  bindings: Record<string, ImageBindingView>,
  productId: string
): boolean {
  const b = bindings[productId];
  if (!b?.bound || !b.tangbuyProductId) return false;
  return b.bindStatus == null || b.bindStatus === "ACTIVE";
}

function ProductThumb({
  url,
  className,
}: {
  url?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative shrink-0 overflow-hidden border border-hairline bg-surface-muted",
        className
      )}
    >
      {url ? (
        <ThumbImage src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

function StepLabel({
  n,
  children,
  trailing,
}: {
  n: number;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white">
          {n}
        </span>
        <p className="truncate text-[12px] font-semibold text-ink">{children}</p>
      </div>
      {trailing}
    </div>
  );
}

export function BundleComposerDrawer({
  open,
  shopName,
  shopDomain,
  contextProduct,
  catalog,
  feature,
  existing,
  statusMap,
  bindings,
  pricingTemplate = null,
  onClose,
  onCreated,
  onDissolved,
}: {
  open: boolean;
  shopName: string;
  shopDomain?: string | null;
  contextProduct: ShopMirrorProduct;
  catalog: ShopMirrorProduct[];
  feature: BundlesFeature | null;
  existing?: BundleCardStatus | null;
  statusMap?: BundleStatusMap | null;
  bindings: Record<string, ImageBindingView>;
  pricingTemplate?: PricingTemplate | null;
  onClose: () => void;
  onCreated: () => void;
  onDissolved?: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, SelectedComponent>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantOptions, setVariantOptions] = useState<
    Record<string, ShopMirrorSku[]>
  >({});

  const currency = contextProduct.currency || "USD";
  const contextId = contextProduct.thirdPlatformItemId;
  const contextBundleId = existing?.bundleId ?? null;
  const editing =
    existing?.status === "ACTIVE" || existing?.status === "STALE";
  const busy = saving || dissolving || loadingBundle;

  useEffect(() => {
    if (!open) return;
    const seed = contextProduct.title?.trim() || t("bundle.untitled");
    setTitle(t("bundle.defaultTitle", { title: seed }));
    setPrice(
      contextProduct.minPrice != null &&
        Number.isFinite(contextProduct.minPrice) &&
        contextProduct.minPrice > 0
        ? String(contextProduct.minPrice)
        : ""
    );
    setDiscountPercent("");
    setQuery("");
    setSelected({});
    setSaving(false);
    setDissolving(false);
    setLoadingBundle(false);
    setError(null);
    setVariantOptions({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/context gate
  }, [open, contextId]);

  // Load variant matrices for selected components (multi-SKU picker).
  useEffect(() => {
    if (!open) return;
    const ids = Object.keys(selected);
    if (ids.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const id of ids) {
        if (variantOptions[id]) continue;
        try {
          const detail = await api.getShopProductDetail(shopName, id);
          if (cancelled) return;
          const variants = detail.variants ?? [];
          setVariantOptions((prev) => ({ ...prev, [id]: variants }));
          if (variants.length === 1 && !selected[id]?.variantId) {
            setSelected((prev) => {
              const cur = prev[id];
              if (!cur) return prev;
              return {
                ...prev,
                [id]: {
                  ...cur,
                  variantId: variants[0].thirdPlatformSkuId,
                },
              };
            });
          }
        } catch {
          /* optional */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per newly selected id
  }, [open, shopName, Object.keys(selected).sort().join(",")]);

  useEffect(() => {
    if (!open) return;
    if (!editing || contextBundleId == null) return;
    let cancelled = false;
    setLoadingBundle(true);
    setError(null);
    void (async () => {
      try {
        const bundle = await getShopBundle(shopName, contextBundleId);
        if (cancelled) return;
        if (bundle.parentTitle?.trim()) {
          setTitle(bundle.parentTitle.trim());
        }
        if (
          bundle.parentPrice != null &&
          Number.isFinite(bundle.parentPrice) &&
          bundle.parentPrice > 0
        ) {
          setPrice(String(bundle.parentPrice));
        }
        if (
          bundle.discountPercent != null &&
          Number.isFinite(bundle.discountPercent)
        ) {
          setDiscountPercent(String(bundle.discountPercent));
        } else {
          setDiscountPercent("");
        }
        const next: Record<string, SelectedComponent> = {};
        for (const c of bundle.components ?? []) {
          if (!c.productId || c.productId === contextId) continue;
          next[c.productId] = {
            quantity: Math.max(1, Math.min(99, c.quantity || 1)),
            variantId: c.variantId ?? null,
          };
        }
        setSelected(next);
      } catch (err) {
        if (!cancelled) setError(readableError(err));
      } finally {
        if (!cancelled) setLoadingBundle(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contextBundleId, editing, shopName, contextId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  const catalogById = useMemo(() => {
    const map = new Map<string, ShopMirrorProduct>();
    for (const p of catalog) map.set(p.thirdPlatformItemId, p);
    return map;
  }, [catalog]);

  const isOccupiedElsewhere = useCallback(
    (productId: string) => {
      const card = statusMap?.byProductId?.[productId];
      if (!card) return false;
      if (!card.asParent && !card.asComponent) return false;
      if (contextBundleId != null && card.bundleId === contextBundleId) {
        return false;
      }
      return true;
    },
    [contextBundleId, statusMap]
  );

  const contextBound = isBindingReady(bindings, contextId);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = catalog.filter((p) => {
      if (p.thirdPlatformItemId === contextId) return false;
      if (!q) return true;
      return (
        p.title?.toLowerCase().includes(q) ||
        p.handle?.toLowerCase().includes(q) ||
        p.thirdPlatformItemId.includes(q)
      );
    });
    return rows.sort((a, b) => {
      const aId = a.thirdPlatformItemId;
      const bId = b.thirdPlatformItemId;
      const aSel = selected[aId] ? 0 : isOccupiedElsewhere(aId) ? 2 : 1;
      const bSel = selected[bId] ? 0 : isOccupiedElsewhere(bId) ? 2 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [catalog, contextId, isOccupiedElsewhere, query, selected]);

  const selectedEntries = useMemo(
    () =>
      Object.entries(selected).map(([productId, row]) => ({
        productId,
        quantity: row.quantity,
        variantId: row.variantId,
        product: catalogById.get(productId) ?? null,
      })),
    [catalogById, selected]
  );

  const selectedCount = selectedEntries.length;
  const totalComponentCount = 1 + selectedCount;
  const eligible = feature?.eligibleForBundles !== false;
  const canSubmit =
    eligible &&
    contextBound &&
    selectedCount >= 1 &&
    title.trim().length > 0 &&
    !busy;

  const submitBlockedReason = !eligible
    ? feature?.ineligibilityReason?.trim() || t("bundle.ineligibleDefault")
    : !contextBound
      ? t("bundle.needBinding")
      : selectedCount < 1
        ? t("bundle.needOneMore")
        : !title.trim()
          ? t("bundle.needTitle")
          : null;

  const adminUrl = useMemo(() => {
    const parentId = existing?.parentProductId;
    if (!parentId) return null;
    if (
      existing?.status !== "ACTIVE" &&
      existing?.status !== "STALE" &&
      existing?.status !== "FAILED"
    ) {
      return null;
    }
    return shopifyProductAdminUrl(parentId, shopDomain);
  }, [existing?.parentProductId, existing?.status, shopDomain]);

  const displayPrice =
    price.trim() && Number.isFinite(Number(price)) && Number(price) > 0
      ? `${currency} ${price.trim()}`
      : t("bundle.priceUnset");

  const costCtx = useMemo(
    () => resolvePurchaseCostDisplayContext(currency, pricingTemplate),
    [currency, pricingTemplate]
  );

  const marginInfo = useMemo(() => {
    let totalCny = 0;
    let anyCost = false;
    const addCost = (productId: string, qty: number) => {
      const cny = parseGatewayPrice(bindings[productId]?.offerPrice);
      if (cny == null) return;
      anyCost = true;
      totalCny += cny * qty;
    };
    addCost(contextId, 1);
    for (const [id, row] of Object.entries(selected)) {
      addCost(id, row.quantity);
    }
    const estimatedCost = anyCost
      ? costInPurchaseDisplayCurrency(totalCny, costCtx)
      : null;
    const parentPriceNum =
      price.trim() && Number.isFinite(Number(price)) && Number(price) > 0
        ? Number(price)
        : null;
    const discountRaw = discountPercent.trim()
      ? Number(discountPercent)
      : 0;
    const discount =
      Number.isFinite(discountRaw) && discountRaw > 0
        ? Math.min(100, Math.max(0, discountRaw))
        : 0;
    const effectivePrice =
      parentPriceNum != null
        ? parentPriceNum * (1 - discount / 100)
        : null;
    const marginAbs =
      estimatedCost != null && effectivePrice != null
        ? effectivePrice - estimatedCost
        : null;
    const marginPct =
      marginAbs != null && effectivePrice != null && effectivePrice > 0
        ? (marginAbs / effectivePrice) * 100
        : null;
    return { estimatedCost, parentPriceNum, discount, marginAbs, marginPct };
  }, [
    bindings,
    contextId,
    costCtx,
    discountPercent,
    price,
    selected,
  ]);

  const toggle = (id: string) => {
    if (isOccupiedElsewhere(id)) return;
    if (!isBindingReady(bindings, id)) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { quantity: 1, variantId: null };
      return next;
    });
  };

  const setQty = (id: string, qty: number) => {
    setSelected((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return {
        ...prev,
        [id]: {
          ...cur,
          quantity: Math.max(1, Math.min(99, qty)),
        },
      };
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const components = Object.entries(selected).map(
        ([productId, row]) => ({
          productId,
          quantity: row.quantity,
          ...(row.variantId ? { variantId: row.variantId } : {}),
        })
      );
      const parentPrice = price.trim() ? Number(price) : null;
      const discountRaw = discountPercent.trim()
        ? Number(discountPercent)
        : null;
      const discount =
        discountRaw != null &&
        Number.isFinite(discountRaw) &&
        discountRaw >= 0
          ? Math.min(100, discountRaw)
          : null;
      const payload = {
        shopName,
        title: title.trim(),
        parentPrice:
          parentPrice != null &&
          Number.isFinite(parentPrice) &&
          parentPrice > 0
            ? parentPrice
            : null,
        discountPercent: discount,
        components,
      };
      if (editing && contextBundleId != null) {
        await updateShopBundle({
          ...payload,
          bundleId: contextBundleId,
        });
      } else {
        await createShopBundle({
          ...payload,
          contextProductId: contextId,
        });
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  const dissolve = async () => {
    if (!editing || contextBundleId == null || !existing?.managedByApp) return;
    if (!window.confirm(t("bundle.dissolveConfirm"))) return;
    setDissolving(true);
    setError(null);
    try {
      await dissolveShopBundle(shopName, contextBundleId);
      onDissolved?.();
      onClose();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setDissolving(false);
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
          if (!busy) onClose();
        }}
      />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-card sm:max-w-lg">
        {/* Header */}
        <header className="shrink-0 border-b border-hairline px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-subtle">
                {t("bundle.eyebrow")}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <h2 className="truncate text-[17px] font-semibold tracking-tight text-ink">
                  {editing ? t("bundle.editTitle") : t("bundle.createTitle")}
                </h2>
                {adminUrl ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 w-7 shrink-0 px-0"
                    title={t("bundle.openInShopify")}
                    aria-label={t("bundle.openInShopify")}
                    disabled={busy}
                    onClick={() => openExternal(adminUrl, { newTab: true })}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[12px] leading-5 text-ink-muted">
                {t("bundle.outcomeShort")}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-7 shrink-0 px-0"
              onClick={onClose}
              disabled={busy}
              title={t("bundle.close")}
              aria-label={t("bundle.close")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 px-5 py-5">
            {!eligible ? (
              <div className="rounded-[var(--radius-control)] border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-950">
                {feature?.ineligibilityReason?.trim() ||
                  t("bundle.ineligibleDefault")}
              </div>
            ) : null}

            {!contextBound ? (
              <div className="rounded-[var(--radius-control)] border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-950">
                {t("bundle.needBinding")}
              </div>
            ) : null}

            {existing?.status === "STALE" ? (
              <div className="rounded-[var(--radius-control)] border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-950">
                {t("bundle.staleHint")}
              </div>
            ) : null}

            {loadingBundle ? (
              <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("bundle.syncing")}
              </div>
            ) : null}

            {/* Step 1 — name & price */}
            <section className="space-y-3">
              <StepLabel n={1}>{t("bundle.stepName")}</StepLabel>
              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.titleLabel")}
                  </span>
                  <Input
                    className="h-10 text-sm"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={busy}
                    placeholder={t("bundle.titlePlaceholder")}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.priceLabel")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-10 w-32 text-sm tabular-nums"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={busy}
                      placeholder={t("bundle.pricePlaceholder")}
                    />
                    <span className="text-[12px] font-medium text-ink-subtle">
                      {currency}
                    </span>
                  </div>
                  <p className="text-[11px] leading-4 text-ink-subtle">
                    {t("bundle.priceHint")}
                  </p>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.discountLabel")}
                  </span>
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-10 w-24 text-sm tabular-nums"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="1"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      disabled={busy}
                      placeholder="0"
                    />
                    <span className="text-[12px] font-medium text-ink-subtle">
                      %
                    </span>
                  </div>
                  <p className="text-[11px] leading-4 text-ink-subtle">
                    {t("bundle.discountHint")}
                  </p>
                </label>

                <div className="rounded-[var(--radius-control)] border border-hairline bg-canvas/50 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-ink-muted">
                    {t("bundle.marginSection")}
                  </p>
                  <dl className="mt-2 space-y-1 text-[12px] tabular-nums">
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">
                        {t("bundle.marginCost")}
                      </dt>
                      <dd className="font-medium text-ink">
                        {marginInfo.estimatedCost != null
                          ? formatPurchaseCostMoney(
                              marginInfo.estimatedCost,
                              costCtx.currency
                            )
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">
                        {t("bundle.marginPrice")}
                      </dt>
                      <dd className="font-medium text-ink">
                        {marginInfo.parentPriceNum != null
                          ? `${marginInfo.parentPriceNum.toFixed(2)} ${currency}`
                          : t("bundle.priceUnset")}
                        {marginInfo.discount > 0
                          ? ` (−${marginInfo.discount}%)`
                          : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-ink-subtle">
                        {t("bundle.marginEstimate")}
                      </dt>
                      <dd className="font-semibold text-ink">
                        {marginInfo.marginAbs != null &&
                        marginInfo.marginPct != null
                          ? `${marginInfo.marginAbs.toFixed(2)} ${currency} (${marginInfo.marginPct.toFixed(0)}%)`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </section>

            <div className="h-px bg-hairline" />

            {/* Step 2 — components */}
            <section className="space-y-3">
              <StepLabel
                n={2}
                trailing={
                  <span
                    className={cn(
                      "text-[11px] tabular-nums",
                      selectedCount >= 1
                        ? "text-ink-muted"
                        : "font-medium text-amber-700"
                    )}
                  >
                    {t("bundle.previewParts", { count: totalComponentCount })}
                    {selectedCount < 1 ? (
                      <span className="ml-1.5">· {t("bundle.needOneMore")}</span>
                    ) : null}
                  </span>
                }
              >
                {t("bundle.stepComponents")}
              </StepLabel>

              {/* Locked base */}
              <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-hairline bg-canvas/60 px-3 py-2.5">
                <ProductThumb
                  url={contextProduct.primaryImageUrl}
                  className="h-11 w-11 rounded-[var(--radius-control)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {contextProduct.title || t("bundle.untitled")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {t("bundle.lockedComponent")}
                    {!contextBound ? (
                      <span className="ml-1.5 text-amber-700">
                        · {t("bundle.unboundBadge")}
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold tabular-nums text-ink-subtle ring-1 ring-hairline">
                  ×1
                </span>
              </div>

              {/* Search + catalog */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <Input
                    className="h-10 pl-9 pr-9 text-sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={busy}
                    placeholder={t("bundle.searchPlaceholder")}
                  />
                  {query ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 px-0"
                      title={t("bundle.clearSearch")}
                      aria-label={t("bundle.clearSearch")}
                      disabled={busy}
                      onClick={() => setQuery("")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>

                <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-control)] border border-hairline">
                  {candidates.length === 0 ? (
                    <li className="px-3 py-10 text-center text-[12px] text-ink-muted">
                      {query.trim()
                        ? t("bundle.noSearchMatches")
                        : t("bundle.noCandidates")}
                    </li>
                  ) : (
                    candidates.map((p) => {
                      const id = p.thirdPlatformItemId;
                      const on = Boolean(selected[id]);
                      const occupied = isOccupiedElsewhere(id);
                      const unbound = !isBindingReady(bindings, id);
                      const blocked = occupied || unbound;
                      const priceLabel = formatShopPrice(
                        p.currency,
                        p.minPrice
                      );
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            disabled={busy || blocked}
                            onClick={() => toggle(id)}
                            className={cn(
                              "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                              blocked
                                ? "cursor-not-allowed bg-canvas/40 opacity-55"
                                : on
                                  ? "bg-brand-soft/80"
                                  : "bg-surface hover:bg-canvas/70 active:bg-canvas"
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                                blocked
                                  ? "border-hairline bg-surface-muted text-transparent"
                                  : on
                                    ? "border-brand-accent bg-brand-accent text-white"
                                    : "border-hairline-strong bg-surface text-transparent"
                              )}
                              aria-hidden
                            >
                              <Check className="h-3 w-3" />
                            </span>
                            <ProductThumb
                              url={p.primaryImageUrl}
                              className="h-10 w-10 rounded-[var(--radius-control)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-ink">
                                {p.title || id}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-ink-subtle">
                                {occupied
                                  ? t("bundle.occupiedElsewhere")
                                  : unbound
                                    ? t("bundle.needBinding")
                                    : priceLabel ?? t("bundle.priceUnset")}
                              </span>
                            </span>
                            {on && !blocked ? (
                              <div
                                className="flex shrink-0 flex-col items-end gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="number"
                                  min={1}
                                  max={99}
                                  value={selected[id]?.quantity ?? 1}
                                  onChange={(e) =>
                                    setQty(id, Number(e.target.value) || 1)
                                  }
                                  className="h-8 w-12 rounded-[var(--radius-control)] border border-hairline bg-surface px-1 text-center text-[12px] tabular-nums text-ink"
                                  aria-label={t("bundle.qtyAria")}
                                />
                                {(variantOptions[id]?.length ?? 0) > 1 ? (
                                  <select
                                    className="h-8 max-w-[9rem] rounded-[var(--radius-control)] border border-hairline bg-surface px-1 text-[11px] text-ink"
                                    value={selected[id]?.variantId ?? ""}
                                    aria-label={t("bundle.variantLabel")}
                                    onChange={(e) => {
                                      const variantId = e.target.value || null;
                                      setSelected((prev) => {
                                        const cur = prev[id];
                                        if (!cur) return prev;
                                        return {
                                          ...prev,
                                          [id]: { ...cur, variantId },
                                        };
                                      });
                                    }}
                                  >
                                    <option value="">
                                      {t("bundle.variantLabel")}
                                    </option>
                                    {(variantOptions[id] ?? []).map((v) => (
                                      <option
                                        key={v.thirdPlatformSkuId}
                                        value={v.thirdPlatformSkuId}
                                      >
                                        {v.title ||
                                          [v.option1, v.option2, v.option3]
                                            .filter(Boolean)
                                            .join(" / ") ||
                                          v.sku ||
                                          v.thirdPlatformSkuId}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                              </div>
                            ) : !blocked ? (
                              <span className="shrink-0 text-[11px] font-medium text-brand-accent">
                                {t("bundle.tapToAdd")}
                              </span>
                            ) : unbound ? (
                              <span className="shrink-0 text-[10px] font-medium text-amber-700">
                                {t("bundle.unboundBadge")}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              <p className="text-[11px] leading-4 text-ink-subtle">
                {t("bundle.inventoryHint")}
              </p>
            </section>

            {error ? (
              <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        {/* Sticky summary footer */}
        <footer className="shrink-0 border-t border-hairline bg-surface px-5 py-3.5">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex -space-x-1.5">
              <ProductThumb
                url={contextProduct.primaryImageUrl}
                className="h-8 w-8 rounded-full ring-2 ring-surface"
              />
              {selectedEntries.slice(0, 3).map(({ productId, product }) => (
                <ProductThumb
                  key={productId}
                  url={product?.primaryImageUrl}
                  className="h-8 w-8 rounded-full ring-2 ring-surface"
                />
              ))}
              {selectedCount > 3 ? (
                <span className="relative z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-ink-muted ring-2 ring-surface">
                  +{selectedCount - 3}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">
                {title.trim() || t("bundle.untitled")}
              </p>
              <p className="mt-0.5 truncate text-[11px] tabular-nums text-ink-muted">
                {displayPrice}
                <span className="mx-1 text-ink-subtle">·</span>
                {t("bundle.previewParts", { count: totalComponentCount })}
              </p>
            </div>
          </div>
          {submitBlockedReason && !busy ? (
            <p className="mb-2.5 text-[11px] leading-4 text-amber-700">
              {submitBlockedReason}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 sm:flex-none"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
            {editing && existing?.managedByApp ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                disabled={busy}
                onClick={() => void dissolve()}
              >
                {dissolving ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("bundle.dissolving")}
                  </>
                ) : (
                  t("bundle.dissolve")
                )}
              </Button>
            ) : null}
            <Button
              size="sm"
              className="min-w-[9.5rem] flex-1 sm:flex-none"
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("bundle.syncing")}
                </>
              ) : editing ? (
                t("bundle.updateCta")
              ) : (
                t("bundle.syncCta")
              )}
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
