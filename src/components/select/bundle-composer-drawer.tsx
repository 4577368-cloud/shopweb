"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "@/lib/ui/icons";
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
import { SameProductComboPanel } from "@/components/select/same-product-combo-panel";
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

const CATALOG_PAGE_SIZE = 8;
const TITLE_MAX = 100;

type BundleTrack = "pick" | "cross" | "same";

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

/** Map Shopify Fixed Bundle nesting errors to operator-facing copy. */
function mapBundleCreateError(
  message: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const m = message || "";
  if (
    /componentized products|invalid as components|can't be componentized/i.test(
      m
    )
  ) {
    const ids = m.match(/\[([^\]]+)\]/)?.[1]?.trim();
    return ids
      ? t("bundle.errorComponentizedWithIds", { ids })
      : t("bundle.errorComponentized");
  }
  return m;
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

function CardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline bg-surface shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function QtyStepper({
  value,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-hairline bg-surface">
      <button
        type="button"
        disabled={disabled || value <= 1}
        className="w-7 text-[14px] text-ink-muted transition-colors hover:bg-canvas disabled:opacity-40"
        aria-label="−"
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <input
        type="number"
        min={1}
        max={99}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
        className="w-9 border-x border-hairline bg-transparent text-center text-[12px] tabular-nums text-ink outline-none"
      />
      <button
        type="button"
        disabled={disabled || value >= 99}
        className="w-7 text-[14px] text-ink-muted transition-colors hover:bg-canvas disabled:opacity-40"
        aria-label="+"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

function variantLabel(v: ShopMirrorSku): string {
  return (
    v.title ||
    [v.option1, v.option2, v.option3].filter(Boolean).join(" / ") ||
    v.sku ||
    v.thirdPlatformSkuId
  );
}

/** Variant picker under product title — not a clipped table column. */
function VariantPicker({
  variants,
  value,
  disabled,
  ariaLabel,
  placeholder,
  needsPick,
  onChange,
}: {
  variants: ShopMirrorSku[];
  value: string | null;
  disabled?: boolean;
  ariaLabel: string;
  placeholder: string;
  needsPick?: boolean;
  onChange: (id: string | null) => void;
}) {
  if (variants.length > 1) {
    return (
      <select
        className={cn(
          "mt-1 h-8 w-full max-w-full rounded-md border bg-surface px-2 text-[12px] text-ink outline-none",
          needsPick
            ? "border-amber-500 ring-1 ring-amber-400/40"
            : "border-input"
        )}
        value={value ?? ""}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">{placeholder}</option>
        {variants.map((v) => (
          <option key={v.thirdPlatformSkuId} value={v.thirdPlatformSkuId}>
            {variantLabel(v)}
          </option>
        ))}
      </select>
    );
  }
  if (variants[0]) {
    return (
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">
        {variantLabel(variants[0])}
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-[11px] text-ink-subtle">—</p>
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
  onComboSaved,
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
  /** Track B same-product combo saved (no new parent). */
  onComboSaved?: (message: string) => void;
  onDissolved?: () => void;
}) {
  const t = useT();
  const searchRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Record<string, SelectedComponent>>(
    {}
  );
  const [contextVariantId, setContextVariantId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variantOptions, setVariantOptions] = useState<
    Record<string, ShopMirrorSku[]>
  >({});
  const [track, setTrack] = useState<BundleTrack>("pick");

  const currency = contextProduct.currency || "USD";
  const contextId = contextProduct.thirdPlatformItemId;
  const contextBundleId = existing?.bundleId ?? null;
  /** Only ACTIVE/STALE can productBundleUpdate; FAILED must create a new row. */
  const editing =
    existing?.status === "ACTIVE" || existing?.status === "STALE";
  const retryFromFailed = existing?.status === "FAILED";
  const busy = saving || dissolving || loadingBundle;
  const showTrackPicker = !editing && !retryFromFailed && track === "pick";
  const showSameProduct = !editing && !retryFromFailed && track === "same";
  const showCrossProduct = editing || retryFromFailed || track === "cross";

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
    setPage(1);
    setSelected({});
    setContextVariantId(null);
    setSaving(false);
    setDissolving(false);
    setLoadingBundle(false);
    setError(null);
    setVariantOptions({});
    setTrack(editing || retryFromFailed ? "cross" : "pick");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open/context gate
  }, [open, contextId]);

  // Load variants for context + selected components (edited in left table, not clipped list).
  useEffect(() => {
    if (!open) return;
    const ids = [contextId, ...Object.keys(selected)];
    let cancelled = false;
    void (async () => {
      for (const id of ids) {
        if (variantOptions[id]) continue;
        try {
          const detail = await api.getShopProductDetail(shopName, id);
          if (cancelled) return;
          const variants = detail.variants ?? [];
          setVariantOptions((prev) => ({ ...prev, [id]: variants }));
          if (id === contextId && variants.length === 1 && !contextVariantId) {
            setContextVariantId(variants[0].thirdPlatformSkuId);
          } else if (
            id !== contextId &&
            variants.length === 1 &&
            !selected[id]?.variantId
          ) {
            setSelected((prev) => {
              const cur = prev[id];
              if (!cur) return prev;
              return {
                ...prev,
                [id]: { ...cur, variantId: variants[0].thirdPlatformSkuId },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopName, contextId, Object.keys(selected).sort().join(",")]);

  // Prefill from existing ACTIVE/STALE (edit) or FAILED (retry create with defaults).
  useEffect(() => {
    if (!open) return;
    if ((!editing && !retryFromFailed) || contextBundleId == null) return;
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
          Number.isFinite(bundle.discountPercent) &&
          bundle.discountPercent > 0
        ) {
          setDiscountPercent(String(bundle.discountPercent));
        } else {
          setDiscountPercent("");
        }
        const next: Record<string, SelectedComponent> = {};
        for (const c of bundle.components ?? []) {
          if (!c.productId) continue;
          if (c.productId === contextId) {
            setContextVariantId(c.variantId ?? null);
            continue;
          }
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
  }, [open, contextBundleId, editing, retryFromFailed, shopName, contextId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, busy]);

  useEffect(() => {
    setPage(1);
  }, [query]);

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

  /** Shopify Fixed Kit parents cannot be nested as components. */
  const isKitParentBlocked = useCallback(
    (productId: string) => {
      const card = statusMap?.byProductId?.[productId];
      if (!card?.asParent) return false;
      if (contextBundleId != null && card.bundleId === contextBundleId) {
        return false;
      }
      return (
        card.status === "ACTIVE" ||
        card.status === "STALE" ||
        card.status === "CREATING"
      );
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

  const totalPages = Math.max(1, Math.ceil(candidates.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = candidates.slice(
    (safePage - 1) * CATALOG_PAGE_SIZE,
    safePage * CATALOG_PAGE_SIZE
  );

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
  const eligible = feature?.eligibleForBundles !== false;
  const contextNeedsVariant =
    (variantOptions[contextId]?.length ?? 0) > 1 && !contextVariantId;
  const componentNeedsVariant = selectedEntries.some(({ productId, variantId }) => {
    const opts = variantOptions[productId];
    return (opts?.length ?? 0) > 1 && !variantId;
  });
  const canSubmit =
    eligible &&
    contextBound &&
    selectedCount >= 1 &&
    title.trim().length > 0 &&
    !contextNeedsVariant &&
    !componentNeedsVariant &&
    !busy;

  const submitBlockedReason = !eligible
    ? feature?.ineligibilityReason?.trim() || t("bundle.ineligibleDefault")
    : !contextBound
      ? t("bundle.needBinding")
      : selectedCount < 1
        ? t("bundle.needOneMore")
        : !title.trim()
          ? t("bundle.needTitle")
          : contextNeedsVariant || componentNeedsVariant
            ? t("bundle.needVariant")
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

  const costCtx = useMemo(
    () => resolvePurchaseCostDisplayContext(currency, pricingTemplate),
    [currency, pricingTemplate]
  );

  const unitCost = useCallback(
    (productId: string) => {
      const cny = parseGatewayPrice(bindings[productId]?.offerPrice);
      if (cny == null) return null;
      return costInPurchaseDisplayCurrency(cny, costCtx);
    },
    [bindings, costCtx]
  );

  const marginInfo = useMemo(() => {
    const cnyOf = (productId: string, qty: number): number | null => {
      const cny = parseGatewayPrice(bindings[productId]?.offerPrice);
      if (cny == null) return null;
      return cny * qty;
    };
    const contextCny = cnyOf(contextId, 1);
    let componentsCny = 0;
    let anyComponentCost = false;
    for (const [id, row] of Object.entries(selected)) {
      const line = cnyOf(id, row.quantity);
      if (line == null) continue;
      anyComponentCost = true;
      componentsCny += line;
    }
    const anyCost = contextCny != null || anyComponentCost;
    const totalCny =
      (contextCny ?? 0) + (anyComponentCost ? componentsCny : 0);
    const contextCost =
      contextCny != null
        ? costInPurchaseDisplayCurrency(contextCny, costCtx)
        : null;
    const componentsCost = anyComponentCost
      ? costInPurchaseDisplayCurrency(componentsCny, costCtx)
      : null;
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
    const discountPct =
      Number.isFinite(discountRaw) && discountRaw > 0
        ? Math.min(100, Math.max(0, discountRaw))
        : 0;
    const dealPrice =
      parentPriceNum != null
        ? parentPriceNum * (1 - discountPct / 100)
        : null;
    const marginAbs =
      estimatedCost != null && dealPrice != null
        ? dealPrice - estimatedCost
        : null;
    const marginPct =
      marginAbs != null && dealPrice != null && dealPrice > 0
        ? (marginAbs / dealPrice) * 100
        : null;
    return {
      contextCost,
      componentsCost,
      estimatedCost,
      missingContextCost: contextCny == null,
      parentPriceNum,
      dealPrice,
      discountPct,
      marginAbs,
      marginPct,
    };
  }, [bindings, contextId, costCtx, discountPercent, price, selected]);

  const toggle = (id: string) => {
    if (isKitParentBlocked(id) || isOccupiedElsewhere(id)) return;
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

  const setVariant = (id: string, variantId: string | null) => {
    setSelected((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      return { ...prev, [id]: { ...cur, variantId } };
    });
  };

  const removeSelected = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const focusCatalog = () => {
    searchRef.current?.focus();
    searchRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const submit = async () => {
    if (!canSubmit) return;
    const nestedKit = Object.keys(selected).find((id) => isKitParentBlocked(id));
    if (nestedKit || isKitParentBlocked(contextId)) {
      setError(
        t("bundle.errorComponentizedWithIds", {
          ids: nestedKit || contextId,
        })
      );
      return;
    }
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
        discountRaw != null && Number.isFinite(discountRaw)
          ? Math.min(100, Math.max(0, discountRaw))
          : 0;
      const payload = {
        shopName,
        title: title.trim().slice(0, TITLE_MAX),
        parentPrice:
          parentPrice != null &&
          Number.isFinite(parentPrice) &&
          parentPrice > 0
            ? parentPrice
            : null,
        discountPercent: discount,
        ...(contextVariantId ? { contextVariantId } : {}),
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
      setError(mapBundleCreateError(readableError(err), t));
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

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const start = Math.max(
      1,
      Math.min(safePage - 2, totalPages - maxButtons + 1)
    );
    return Array.from({ length: maxButtons }, (_, i) => start + i);
  }, [safePage, totalPages]);

  if (!open) return null;

  const alertMessage = !eligible
    ? feature?.ineligibilityReason?.trim() || t("bundle.ineligibleDefault")
    : !contextBound
      ? t("bundle.needBinding")
      : error
        ? error
        : existing?.status === "STALE"
          ? t("bundle.staleHint")
          : existing?.status === "FAILED"
            ? t("bundle.failedRetryHint")
            : null;

  const marginEstimateLabel =
    marginInfo.marginAbs != null && marginInfo.marginPct != null
      ? `${marginInfo.marginAbs.toFixed(2)} ${currency} (${marginInfo.marginPct.toFixed(0)}%)`
      : "—";
  const formatCostLine = (amount: number | null | undefined) =>
    amount != null
      ? formatPurchaseCostMoney(amount, costCtx.currency)
      : "—";
  const marginCostLabel = formatCostLine(marginInfo.estimatedCost);
  const contextCostLabel = formatCostLine(marginInfo.contextCost);
  const componentsCostLabel = formatCostLine(marginInfo.componentsCost);

  const contextVariants = variantOptions[contextId] ?? [];
  const contextCost = unitCost(contextId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bundle-composer-title"
    >
      <button
        type="button"
        aria-label={t("bundle.close")}
        className="absolute inset-0 cursor-default"
        onClick={() => {
          if (!busy) onClose();
        }}
      />

      <div className="relative z-10 flex h-[min(86vh,700px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-hairline bg-canvas shadow-card">
        {/* Header — compact */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-hairline bg-surface px-3.5 py-2.5 sm:px-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-accent">
            <Package className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h2
                id="bundle-composer-title"
                className="truncate text-[14px] font-semibold tracking-tight text-ink"
              >
                {showSameProduct
                  ? t("bundle.comboTitle")
                  : showTrackPicker
                    ? t("bundle.pickTrackTitle")
                    : editing
                      ? t("bundle.editTitle")
                      : retryFromFailed
                        ? t("bundle.retryTitle")
                        : t("bundle.createComboTitle")}
              </h2>
              <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                {showSameProduct
                  ? t("bundle.comboEyebrow")
                  : t("bundle.eyebrow")}
              </span>
              {adminUrl && showCrossProduct ? (
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
            <p className="mt-0.5 truncate text-[11px] text-ink-muted">
              {showSameProduct
                ? t("bundle.comboTrackHint")
                : showTrackPicker
                  ? t("bundle.pickTrackHint")
                  : t("bundle.outcomeShort")}
            </p>
          </div>
          {showCrossProduct && track === "cross" && !editing && !retryFromFailed ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 px-2 text-[11px]"
              disabled={busy}
              onClick={() => setTrack("pick")}
            >
              {t("bundle.backToTracks")}
            </Button>
          ) : null}
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
        </header>

        {showTrackPicker ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
            <button
              type="button"
              className="flex flex-col rounded-lg border border-hairline bg-surface p-4 text-left transition-colors hover:border-brand-accent/40 hover:bg-brand-soft/30"
              onClick={() => setTrack("cross")}
            >
              <span className="text-[13px] font-semibold text-ink">
                {t("bundle.trackCrossTitle")}
              </span>
              <span className="mt-1.5 text-[11px] leading-4 text-ink-muted">
                {t("bundle.trackCrossBody")}
              </span>
            </button>
            <button
              type="button"
              className="flex flex-col rounded-lg border border-hairline bg-surface p-4 text-left transition-colors hover:border-brand-accent/40 hover:bg-brand-soft/30"
              onClick={() => setTrack("same")}
            >
              <span className="text-[13px] font-semibold text-ink">
                {t("bundle.trackSameTitle")}
              </span>
              <span className="mt-1.5 text-[11px] leading-4 text-ink-muted">
                {t("bundle.trackSameBody")}
              </span>
            </button>
          </div>
        ) : null}

        {showSameProduct ? (
          <SameProductComboPanel
            shopName={shopName}
            productId={contextId}
            currency={currency}
            busy={busy}
            onCancel={() => setTrack("pick")}
            onSaved={(message) => {
              onComboSaved?.(message);
              onClose();
            }}
          />
        ) : null}

        {showCrossProduct ? (
        <>
        {alertMessage || loadingBundle ? (
          <div className="shrink-0 border-b border-hairline bg-surface px-3.5 py-1.5 sm:px-4">
            {loadingBundle ? (
              <div className="flex items-center gap-2 text-[11px] text-ink-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("bundle.syncing")}
              </div>
            ) : (
              <p
                className={cn(
                  "text-[11px] leading-4",
                  error ? "text-red-700" : "text-amber-800"
                )}
              >
                {alertMessage}
              </p>
            )}
          </div>
        ) : null}

        {/*
          Body scrolls as one column on mobile; on lg each pane scrolls independently
          with explicit min-h-0 so footer never clips content.
        */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.85fr)] lg:gap-3 lg:overflow-hidden lg:p-3.5">
          {/* LEFT */}
          <div className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:overscroll-contain lg:pr-0.5">
            <CardShell className="shrink-0 p-3">
              <p className="text-[12px] font-semibold text-ink">
                {t("bundle.infoSection")}
              </p>

              <label className="mt-2 block space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.titleLabel")}
                  </span>
                  <span className="text-[10px] tabular-nums text-ink-subtle">
                    {Math.min(title.length, TITLE_MAX)}/{TITLE_MAX}
                  </span>
                </div>
                <Input
                  className="h-8 text-[13px]"
                  value={title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={busy}
                  placeholder={t("bundle.titlePlaceholder")}
                />
              </label>

              {/* Pricing: list price + checkout discount % + cost / margin */}
              <div className="mt-3 space-y-0 border-t border-hairline pt-3">
                <p className="mb-2 text-[12px] font-semibold text-ink">
                  {t("bundle.pricingSection")}
                </p>

                <label className="block space-y-1">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.listPriceLabel")}
                    <span className="ml-1 font-normal text-ink-subtle">
                      · {t("bundle.listPriceHintShort")}
                    </span>
                  </span>
                  <div className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-surface">
                    <span className="border-r border-hairline px-2.5 text-[11px] font-medium text-ink-subtle">
                      {currency}
                    </span>
                    <input
                      className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] tabular-nums text-ink outline-none"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      disabled={busy}
                      placeholder={t("bundle.pricePlaceholder")}
                      aria-label={t("bundle.listPriceLabel")}
                    />
                  </div>
                </label>

                <label className="mt-2.5 block space-y-1">
                  <span className="text-[11px] text-ink-muted">
                    {t("bundle.discountLabel")}
                  </span>
                  <div className="flex h-9 items-center overflow-hidden rounded-md border border-input bg-surface">
                    <input
                      className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] tabular-nums text-ink outline-none"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="1"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      disabled={busy}
                      placeholder="0"
                      aria-label={t("bundle.discountLabel")}
                    />
                    <span className="border-l border-hairline px-2.5 text-[11px] font-medium text-ink-subtle">
                      %
                    </span>
                  </div>
                  <p className="text-[10px] leading-snug text-ink-subtle">
                    {t("bundle.discountHint")}
                  </p>
                </label>

                <dl className="mt-3 divide-y divide-hairline rounded-md border border-hairline bg-canvas/40">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-[11px] text-ink-muted">
                      {t("bundle.costContextLabel")}
                    </dt>
                    <dd
                      className={cn(
                        "text-[12px] tabular-nums",
                        marginInfo.missingContextCost
                          ? "text-ink-subtle"
                          : "font-medium text-ink"
                      )}
                    >
                      {contextCostLabel}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-[11px] text-ink-muted">
                      {t("bundle.costComponentsLabel")}
                    </dt>
                    <dd className="text-[12px] font-medium tabular-nums text-ink">
                      {componentsCostLabel}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <dt className="text-[11px] font-medium text-ink">
                      {t("bundle.costTotalLabel")}
                      <span className="ml-1 font-normal text-ink-subtle">
                        ({t("bundle.costTotalHintShort")})
                      </span>
                    </dt>
                    <dd className="text-[12px] font-semibold tabular-nums text-ink">
                      {marginCostLabel}
                    </dd>
                  </div>
                  {marginInfo.missingContextCost ? (
                    <div className="px-3 py-1.5">
                      <p className="text-[10px] leading-snug text-amber-700">
                        {t("bundle.costContextMissing")}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 bg-surface px-3 py-2.5">
                    <dt className="text-[11px] font-medium text-ink">
                      {t("bundle.profitLabel")}
                      <span className="ml-1 font-normal text-ink-subtle">
                        ({t("bundle.profitHintShort")})
                      </span>
                    </dt>
                    <dd
                      className={cn(
                        "text-[14px] font-semibold tabular-nums",
                        marginInfo.marginAbs != null && marginInfo.marginAbs < 0
                          ? "text-red-600"
                          : "text-ink"
                      )}
                    >
                      {marginEstimateLabel}
                    </dd>
                  </div>
                </dl>
              </div>
            </CardShell>

            <CardShell className="flex shrink-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
                <p className="text-[12px] font-semibold text-ink">
                  {t("bundle.productsSection")}
                </p>
                <span className="text-[11px] tabular-nums text-ink-muted">
                  {t("bundle.previewParts", { count: 1 + selectedCount })}
                </span>
              </div>

              <div className="max-h-[min(280px,36vh)] space-y-0 overflow-y-auto overscroll-contain">
                <div
                  className={cn(
                    "border-b border-hairline bg-canvas/40 px-3 py-2.5",
                    contextNeedsVariant && "bg-amber-50/80"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <ProductThumb
                      url={contextProduct.primaryImageUrl}
                      className="mt-0.5 h-9 w-9 shrink-0 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-ink">
                            {contextProduct.title || t("bundle.untitled")}
                          </p>
                          <p className="text-[9px] font-medium text-ink-subtle">
                            {t("bundle.currentBadge")}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="inline-flex h-7 items-center rounded border border-hairline bg-canvas px-2 text-[11px] tabular-nums text-ink-muted">
                            ×1
                          </span>
                          <p className="mt-0.5 text-[10px] tabular-nums text-ink-muted">
                            {contextCost != null
                              ? formatPurchaseCostMoney(
                                  contextCost,
                                  costCtx.currency
                                )
                              : "—"}
                          </p>
                        </div>
                      </div>
                      <VariantPicker
                        variants={contextVariants}
                        value={contextVariantId}
                        disabled={busy}
                        ariaLabel={t("bundle.variantLabel")}
                        placeholder={t("bundle.pickVariant")}
                        needsPick={contextNeedsVariant}
                        onChange={setContextVariantId}
                      />
                    </div>
                  </div>
                </div>

                {selectedEntries.map(
                  ({ productId, product, quantity, variantId }) => {
                    const variants = variantOptions[productId] ?? [];
                    const cost = unitCost(productId);
                    const lineCost = cost != null ? cost * quantity : null;
                    const needsPick =
                      variants.length > 1 && !variantId;
                    return (
                      <div
                        key={productId}
                        className={cn(
                          "border-b border-hairline px-3 py-2.5 last:border-b-0",
                          needsPick && "bg-amber-50/80"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <ProductThumb
                            url={product?.primaryImageUrl}
                            className="mt-0.5 h-9 w-9 shrink-0 rounded"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                                {product?.title || productId}
                              </p>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 w-7 shrink-0 px-0 text-ink-muted hover:text-red-600"
                                disabled={busy}
                                title={t("bundle.removeComponent")}
                                aria-label={t("bundle.removeComponent")}
                                onClick={() => removeSelected(productId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <VariantPicker
                              variants={variants}
                              value={variantId ?? null}
                              disabled={busy}
                              ariaLabel={t("bundle.variantLabel")}
                              placeholder={t("bundle.pickVariant")}
                              needsPick={needsPick}
                              onChange={(id) => setVariant(productId, id)}
                            />
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              <QtyStepper
                                value={quantity}
                                disabled={busy}
                                ariaLabel={t("bundle.qtyAria")}
                                onChange={(n) => setQty(productId, n)}
                              />
                              <span className="text-[10px] tabular-nums text-ink-muted">
                                {lineCost != null
                                  ? formatPurchaseCostMoney(
                                      lineCost,
                                      costCtx.currency
                                    )
                                  : "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              <div className="border-t border-hairline px-3 py-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={focusCatalog}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-hairline-strong bg-canvas/50 py-1.5 text-[12px] font-medium text-brand-accent transition-colors hover:border-brand-accent/40 hover:bg-brand-soft/50 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("bundle.addMoreProducts")}
                </button>
              </div>
            </CardShell>
          </div>

          {/* RIGHT — catalog pane with own scroll */}
          <CardShell className="flex min-h-[280px] flex-col overflow-hidden lg:min-h-0">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
              <p className="text-[12px] font-semibold text-ink">
                {t("bundle.selectProducts")}
              </p>
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  selectedCount >= 1
                    ? "font-medium text-amber-700"
                    : "text-ink-muted"
                )}
              >
                {t("bundle.pickedCount", { count: selectedCount })}
              </span>
            </div>

            <div className="shrink-0 px-3 pt-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                <Input
                  ref={searchRef}
                  className="h-8 pl-7 text-[13px]"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  disabled={busy}
                  placeholder={t("bundle.searchPlaceholder")}
                />
              </div>
            </div>

            <ul className="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5">
              {pageRows.length === 0 ? (
                <li className="px-2 py-8 text-center text-[11px] text-ink-muted">
                  {query.trim()
                    ? t("bundle.noSearchMatches")
                    : t("bundle.noCandidates")}
                </li>
              ) : (
                pageRows.map((p) => {
                  const id = p.thirdPlatformItemId;
                  const on = Boolean(selected[id]);
                  const occupied = isOccupiedElsewhere(id);
                  const kitParent = isKitParentBlocked(id);
                  const unbound = !isBindingReady(bindings, id);
                  const blocked = occupied || kitParent || unbound;
                  const priceLabel = formatShopPrice(p.currency, p.minPrice);
                  return (
                    <li key={id} className="px-0.5 py-0.5">
                      <button
                        type="button"
                        disabled={busy || blocked}
                        onClick={() => toggle(id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                          blocked
                            ? "cursor-not-allowed opacity-45"
                            : on
                              ? "bg-brand-soft ring-1 ring-brand-accent/25"
                              : "hover:bg-canvas"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            blocked
                              ? "border-hairline bg-surface-muted text-transparent"
                              : on
                                ? "border-brand-accent bg-brand-accent text-white"
                                : "border-hairline-strong bg-surface text-transparent"
                          )}
                          aria-hidden
                        >
                          <Check className="h-2.5 w-2.5" />
                        </span>
                        <ProductThumb
                          url={p.primaryImageUrl}
                          className="h-8 w-8 rounded"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-ink">
                            {p.title || id}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-ink-subtle">
                            {kitParent
                              ? t("bundle.occupiedKitParent")
                              : occupied
                              ? t("bundle.occupiedElsewhere")
                              : unbound
                                ? t("bundle.needBinding")
                                : (priceLabel ?? t("bundle.priceUnset"))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {totalPages > 1 ? (
              <div className="flex shrink-0 items-center justify-center gap-0.5 border-t border-hairline px-2 py-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 w-7 px-0"
                  disabled={busy || safePage <= 1}
                  title={t("shopProducts.prevPage")}
                  aria-label={t("shopProducts.prevPage")}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={busy}
                    onClick={() => setPage(n)}
                    className={cn(
                      "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-[11px] tabular-nums transition-colors",
                      n === safePage
                        ? "bg-brand-accent font-semibold text-white"
                        : "text-ink-muted hover:bg-canvas"
                    )}
                  >
                    {n}
                  </button>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 w-7 px-0"
                  disabled={busy || safePage >= totalPages}
                  title={t("shopProducts.nextPage")}
                  aria-label={t("shopProducts.nextPage")}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}
          </CardShell>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface px-3.5 py-2.5 sm:px-4">
          <div className="flex min-w-0 max-w-[55%] items-start gap-1.5 text-[11px] leading-4 text-ink-muted">
            {submitBlockedReason && !busy ? (
              <>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-amber-800">{submitBlockedReason}</span>
              </>
            ) : (
              <span className="truncate">{t("bundle.inventoryHint")}</span>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
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
              className="min-w-[9rem]"
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
        </>
        ) : null}
      </div>
    </div>
  );
}
