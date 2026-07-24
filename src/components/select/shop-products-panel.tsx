"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  MoveRight,
  RefreshCw,
  Search,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { ShopProductDetailDrawer } from "@/components/select/shop-product-detail-drawer";
import {
  EditedFieldValue,
  EditedProfitLine,
  useAiFieldEditPhases,
} from "@/components/ui/edited-field-value";
import { ImageZoomOverlay } from "@/components/ui/image-zoom-overlay";
import { ThumbImage } from "@/components/ui/thumb-image";
import { CatalogIngestingBadge } from "@/components/ui/catalog-ingesting-badge";
import { useCatalogIngestStatus } from "@/hooks/use-catalog-ingest-status";
import { useOnboarding } from "@/context/onboarding-context";
import {
  AI_BEFORE_AFTER_MS,
  AI_EDIT_DISPLAY_HOLD_MS,
  aiFieldEditKey,
  mirrorReflectsListingPriceEdit,
  resolveListingPriceDisplay,
  type AiFieldEditRecord,
  type AiFieldId,
} from "@/lib/ai-field-edit-feedback";
import { api, ApiError, readableError } from "@/lib/api";
import {
  peekMirrorCache,
  productsMirrorShopKey,
  setMirrorCache,
} from "@/lib/products/mirror-cache";
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  OfferDetail,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import type { Locale } from "@/i18n/config";

type ShopProductsT = ReturnType<typeof useT>;
import {
  buildShopProductMinis,
  type ShopProductMini,
} from "@/lib/agents/products/shop-minis";
import {
  costInPurchaseDisplayCurrency,
  formatPurchaseCostMoney,
  resolvePurchaseCostDisplayContext,
} from "@/lib/purchase-cost-display";
import {
  normalizeMatchScore,
  parseGatewayPrice,
  profitPerOrderPurchaseDisplay,
} from "@/lib/agents/products/match-rank";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";
import { buildTrayInlineReasons } from "@/lib/agents/products/candidate-tray-explain";
import {
  fetchItemGetProcurementPrice,
  resolveSkuDetailUrl,
} from "@/lib/source-sku-matrix";
import { ManualMatchDrawer } from "@/components/select/manual-match-drawer";
import { SourceSupplierConfirmCard } from "@/components/select/source-supplier-confirm-card";
import { isManualImageBinding } from "@/lib/manual-image-match";
import { fetchItemDetail, isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import {
  applyBatchAckToBindings,
  batchAckPendingBindings,
  listPendingAckProductIds,
} from "@/lib/batch-link/batch-ack-pending";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import { rerankForShopMirrorProduct } from "@/lib/sku-align/image-search-sku-rank";
import { sortProductsForBatchLink } from "@/lib/batch-link/sort-products";
import type { BatchLinkCardDrive, BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import { INITIAL_BATCH_LINK_PROGRESS } from "@/lib/batch-link/types";
import {
  loadVariantReadyIds,
  preflightBatchLinkScope,
} from "@/lib/batch-link/preflight";
import { confirmCandidateBinding } from "@/lib/batch-link/confirm-binding";
import {
  ackAutoLinkedBinding,
  autoAckHighConfidencePendingBindings,
  isHighConfidencePendingBinding,
} from "@/lib/batch-link/auto-ack-binding";
import { classifyMatchConfidence } from "@/lib/batch-link/confidence";
import {
  confidenceTierLabel,
  formatBatchCardQueueLine,
} from "@/lib/batch-link/confidence-display";
import type { MatchConfidenceTier } from "@/lib/batch-link/confidence";
import {
  allowPoolIngestOnConfirm,
  requiresSupplierConfirmBeforePool,
  resolveCandidateConfidence,
  type CandidateConfidence,
} from "@/lib/batch-link/candidate-confidence";
import { buildImageSearchRecoveryHints } from "@/lib/batch-link/search-recovery-hints";
import {
  mapImageMatchConfirmError,
  mapImageSearchError,
} from "@/lib/batch-link/match-errors";
import {
  isAlreadySourcedProduct,
  isEligibleForImageBatchLink,
  isPublishSourcedBinding,
} from "@/lib/batch-link/publish-source";
import {
  candidateStorageKey,
  formatImageMatchLabel,
  formatTitleMatchLabel,
  imageGateBlockedHint,
} from "@/lib/batch-link/image-match";
import {
  filterLinkableProducts,
  SHOP_PRODUCTS_PAGE_SIZE,
} from "@/lib/batch-link/scope";
import {
  offerDetailCountryForLocale,
  resolveImageSearchDisplayTitle,
} from "@/lib/batch-link/1688-title-locale";
import {
  resolveBoundSourceDisplayTitle,
  snapTitleNeedsItemGetFallback,
} from "@/lib/batch-link/source-display-title";
import { backfillProductSourceIdentity } from "@/lib/logistics/resolve-estimate-goods-id";
import {
  isPoolIngestPending,
  isTerminalPoolIngestStatus,
} from "@/lib/logistics/estimate-goods-block";
import {
  mergeIdentityIntoBinding,
  mergeStoredIdentityIntoBinding,
  readProductSourceIdentity,
} from "@/lib/product-source-identity";
import { useBatchLinkQueue } from "@/hooks/use-batch-link-queue";
import { usePublishLinkReveal } from "@/hooks/use-publish-link-reveal";
import {
  readPublishDisplaySnapshot,
  readPublishRevealQueue,
} from "@/lib/batch-link/publish-reveal";
import { isInternalGoodsId, resolveSourceDetailHref } from "@/lib/catalog-product-resolve";
import { resolveManualHeroImage } from "@/lib/manual-image-match";

export interface AgentIntentRequest {
  intent: ProductsIntentId;
  productId: string;
  focusCandidateId?: string | null;
  focusCandidates?: CandidateSummary[];
}

/** Resolve 0–100 match score: binding snapshot first, then live tray candidate. */
function resolveCardMatchScore(
  binding: ImageBindingView | undefined,
  current: ImageSearchProduct | null | undefined,
  matchScores: Record<string, number>
): number | null {
  const fromBinding = normalizeMatchScore(binding?.matchScore);
  if (fromBinding != null) return fromBinding;
  if (current) {
    const fromTray =
      matchScores[current.productId] ??
      normalizeMatchScore(current.similarityScore);
    if (fromTray != null) return fromTray;
  }
  return null;
}

function resolveCandidateTitleScore(
  c: ImageSearchProduct,
  scores: Record<string, number>
): number | null {
  const key = candidateStorageKey(c);
  return scores[c.productId] ?? scores[key] ?? normalizeMatchScore(c.similarityScore);
}

function resolveCandidateImageScore(
  c: ImageSearchProduct,
  scores: Record<string, number | null>
): number | null {
  const key = candidateStorageKey(c);
  return scores[c.productId] ?? scores[key] ?? null;
}

function middleMatchHeadline(
  t: ShopProductsT,
  cardState: "matched" | "pending" | "unbound",
  hasCurrent: boolean,
  titleScore: number | null,
  imageScore: number | null
): string {
  if (cardState === "unbound" && !hasCurrent) return t("shopProducts.noReliableMatch");
  if (cardState === "pending") {
    if (titleScore != null && imageScore != null) {
      return t("shopProducts.pendingTitleImage", {
        title: titleScore,
        image: imageScore,
      });
    }
    if (titleScore != null) {
      return t("shopProducts.pendingTitleOnly", { title: titleScore });
    }
    return t("shopProducts.pending");
  }
  if (cardState === "matched") {
    if (titleScore != null && imageScore != null) {
      return t("shopProducts.scoresTitleImage", {
        title: titleScore,
        image: imageScore,
      });
    }
    if (titleScore != null) {
      return t("shopProducts.scoresTitleOnly", { title: titleScore });
    }
    return t("shopProducts.autoMatched");
  }
  if (hasCurrent) {
    if (titleScore != null && imageScore != null) {
      return t("shopProducts.scoresTitleImage", {
        title: titleScore,
        image: imageScore,
      });
    }
    if (titleScore != null) {
      return t("shopProducts.scoresTitleOnly", { title: titleScore });
    }
    return t("shopProducts.clickFindCandidates");
  }
  return t("shopProducts.noReliableMatch");
}

function publishLinkHeadline(
  t: ShopProductsT,
  state: BatchLinkCardDrive["state"],
  titleScore: number | null,
  imageScore: number | null
): string {
  if (state === "searching") return t("shopProducts.searchingSource");
  if (state === "binding" || state === "auto_selecting") return t("shopProducts.linking");
  if (titleScore != null && imageScore != null) {
    return t("shopProducts.scoresTitleImage", {
      title: titleScore,
      image: imageScore,
    });
  }
  if (titleScore != null) {
    return t("shopProducts.scoresTitleOnly", { title: titleScore });
  }
  return t("shopProducts.matchComplete");
}

/**
 * Map backend image-search errors to a readable, category-specific message.
 */
function imageSearchError(err: unknown): string {
  return mapImageSearchError(err);
}

/** Map backend confirm (A3-2b) errors to a readable message by machine-code prefix. */
function imageMatchError(err: unknown): string {
  return mapImageMatchConfirmError(err);
}

function formatSimilarity(score?: number | null): string | null {
  if (score == null || Number.isNaN(score) || score <= 0) return null;
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return `${Math.round(Math.min(score, 100))}%`;
}

function formatSold(t: ShopProductsT, n?: number | null): string | null {
  if (n == null || Number.isNaN(n) || n <= 0) return null;
  if (n >= 10000) {
    return t("shopProducts.monthlySalesWan", {
      count: (n / 10000).toFixed(1),
    });
  }
  return t("shopProducts.monthlySales", { count: n });
}

/** Short confidence signals for a candidate: monthly sales + repurchase rate. */
function candidateSignals(t: ShopProductsT, c: ImageSearchProduct): string[] {
  const out: string[] = [];
  const sold = formatSold(t, c.soldCount);
  if (sold) out.push(sold);
  const rate = (c.repurchaseRate ?? "").trim();
  if (rate) out.push(t("shopProducts.repurchase", { rate }));
  return out;
}

function formatCny(price?: string | null): string {
  const trimmed = (price ?? "").trim();
  if (!trimmed) return "—";
  return `¥${trimmed}`;
}

function shortProductId(id: string): string {
  const m = id.match(/Product\/(\d+)/i);
  if (m) return m[1]!;
  if (id.length > 18) return `${id.slice(0, 8)}…${id.slice(-6)}`;
  return id;
}

/** Best available source image for a bound offer: white-bg image, else the first per-SKU image. */
function offerImage(offer: OfferDetail | null): string | null {
  if (offer?.whiteImageUrl) return offer.whiteImageUrl;
  for (const sku of offer?.skus ?? []) {
    for (const attr of sku.skuAttributes ?? []) {
      if (attr.skuImageUrl) return attr.skuImageUrl;
    }
  }
  return null;
}

/** Representative price of a bound offer, derived from its real SKU matrix (min–max). */
function offerPriceText(offer: OfferDetail | null): string | null {
  const prices = (offer?.skus ?? [])
    .map((s) => Number.parseFloat((s.price ?? "").trim()))
    .filter((n) => !Number.isNaN(n));
  if (!prices.length) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${min}` : `¥${min}–${max}`;
}

/** Parse a gateway price string ("12.00" or "12–15") to a representative (min) number, else null. */
function parsePrice(raw?: string | null): number | null {
  const nums = (raw ?? "")
    .split(/[^\d.]+/)
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : null;
}

function formatPurchaseCostLabel(
  t: ShopProductsT,
  costCny: number | null,
  shopCurrency: string | null | undefined,
  fallbackRaw?: string | null,
  pricingTemplate?: PricingTemplate | null
): string {
  const ctx = resolvePurchaseCostDisplayContext(shopCurrency, pricingTemplate);
  const inTarget = costInPurchaseDisplayCurrency(costCny, ctx);
  if (inTarget != null) {
    return t("shopProducts.purchaseCost", {
      price: formatPurchaseCostMoney(inTarget, ctx.currency),
    });
  }
  if (fallbackRaw) {
    return t("shopProducts.purchaseCost", { price: formatCny(fallbackRaw) });
  }
  if (costCny != null) {
    return t("shopProducts.purchaseCost", { price: `¥${costCny}` });
  }
  return t("shopProducts.purchaseCostPending");
}

function fmtMoney(n: number, currency?: string): string {
  const v = n.toFixed(2);
  return currency ? `${v} ${currency}` : v;
}

function matchReasons(
  t: ShopProductsT,
  opts: {
  imageSource?: string | null;
  querySource?: string | null;
  appliedQuery?: string | null;
  matchScore?: number | null;
  signals?: string[];
}
): string[] {
  const out: string[] = [];
  if (opts.imageSource === "ORIGINAL") out.push(t("shopProducts.reasonOriginalImage"));
  else if (opts.imageSource === "SHOPIFY") out.push(t("shopProducts.reasonShopImage"));
  else out.push(t("shopProducts.reasonImageHit"));
  const q = (opts.appliedQuery ?? "").trim();
  if (opts.querySource === "TITLE" && q) {
    out.push(t("shopProducts.reasonTitleCal", { query: q }));
  } else if (opts.querySource === "LLM" && q) {
    out.push(t("shopProducts.reasonAiCal", { query: q }));
  }
  if (opts.matchScore != null && opts.matchScore > 0) {
    out.push(
      t("shopProducts.reasonComposite", {
        score: formatSimilarity(opts.matchScore) ?? "",
      })
    );
  }
  for (const s of opts.signals ?? []) out.push(s);
  return out.slice(0, 4);
}

/** Short evidence pills for the Match column — real fields only. */
function evidenceTags(
  t: ShopProductsT,
  opts: {
  unbound?: boolean;
  pending?: boolean;
  imageSource?: string | null;
  querySource?: string | null;
  matchScore?: number | null;
  signals?: string[];
  marginPct?: number | null;
}
): { label: string; tone: "ok" | "warn" | "neutral" }[] {
  if (opts.unbound) {
    return [
      { label: t("shopProducts.tagSuggestSearch"), tone: "neutral" },
      { label: t("shopProducts.tagRelaxFilters"), tone: "neutral" },
    ];
  }
  const tags: { label: string; tone: "ok" | "warn" | "neutral" }[] = [];
  if (opts.imageSource === "ORIGINAL" || opts.imageSource === "SHOPIFY") {
    tags.push({ label: t("shopProducts.tagShopImageSearch"), tone: "ok" });
  } else if (!opts.unbound) {
    tags.push({ label: t("shopProducts.tagImageHit"), tone: "ok" });
  }
  if (opts.querySource === "TITLE" || opts.querySource === "LLM") {
    tags.push({ label: t("shopProducts.tagCalibrated"), tone: "ok" });
  }
  if (opts.marginPct != null && opts.marginPct >= 15) {
    tags.push({ label: t("shopProducts.tagBetterCost"), tone: "ok" });
  }
  for (const s of (opts.signals ?? []).slice(0, 1)) {
    tags.push({ label: s, tone: "neutral" });
  }
  return tags.slice(0, 3);
}

export type ShopFilter =
  | "all"
  | "new_arrivals"
  | "pending"
  | "confirmed"
  | "unbound";

export function ShopProductsPanel({
  onActivity,
  filter: filterProp,
  onFilterChange,
  focusProductId = null,
  scrollToProductId = null,
  onScrollToConsumed,
  searchModeProductId = null,
  rematchUnboundSignal = 0,
  batchLinkRequest = null,
  mirrorRefreshSignal = 0,
  onSearchModeConsumed,
  onBatchLinkProgressChange,
  onBatchLinkFinished,
  onPageLinkableScopeChange,
  onProductFocus,
  onMinisChange,
  onBindingsChange,
  onShopProductsChange,
  onCandidateContextChange,
  pendingNewAnalysisIds,
  onMirrorAnalysisCommitted,
  aiFieldEdits,
  onAiFieldEditConsumed,
  linkingLocked = false,
  searchQuery = "",
  highlighted = false,
  pricingTemplate = null,
}: {
  onActivity?: () => void;
  /** Optional controlled filter — lets the page's top CTA jump straight to e.g. 待确认. */
  filter?: ShopFilter;
  onFilterChange?: (f: ShopFilter) => void;
  focusProductId?: string | null;
  scrollToProductId?: string | null;
  onScrollToConsumed?: () => void;
  searchModeProductId?: string | null;
  /** Increment to force re-image-search all unbound products (never touches existing binds). */
  rematchUnboundSignal?: number;
  /** Start client-side batch link (shared by 一键关联 + 自动/手动新入库关联). */
  batchLinkRequest?: BatchLinkRequest | null;
  /** Increment after out-of-panel binding changes (auto queue / page-level match). */
  mirrorRefreshSignal?: number;
  onSearchModeConsumed?: () => void;
  onBatchLinkProgressChange?: (progress: BatchLinkProgress) => void;
  onBatchLinkFinished?: (progress: BatchLinkProgress) => void;
  /** Current page linkable product ids — for scoped「一键关联」. */
  onPageLinkableScopeChange?: (scope: {
    ids: string[];
    page: number;
    totalPages: number;
    pageSize: number;
  }) => void;
  onProductFocus?: (productId: string) => void;
  onMinisChange?: (minis: {
    pending: ShopProductMini[];
    unbound: ShopProductMini[];
  }) => void;
  onBindingsChange?: (bindings: Record<string, ImageBindingView>) => void;
  onShopProductsChange?: (
    products: ShopMirrorProduct[],
    bindings: Record<string, ImageBindingView>
  ) => void;
  onCandidateContextChange?: (
    productId: string,
    ctx: { candidateId: string | null; candidates: CandidateSummary[] }
  ) => void;
  /** Item ids flagged as new mirror rows pending first analysis. */
  pendingNewAnalysisIds?: Set<string>;
  /** Called after scan/sync commits the mirror into the analysis baseline. */
  onMirrorAnalysisCommitted?: (products: ShopMirrorProduct[]) => void;
  /** Transient AI field-edit highlights keyed by productId:field */
  aiFieldEdits?: Record<string, AiFieldEditRecord>;
  onAiFieldEditConsumed?: (productId: string, field: AiFieldId) => void;
  /** True while batch link is running — locks sync / ack / per-card actions. */
  linkingLocked?: boolean;
  /** Search query from parent component */
  searchQuery?: string;
  /** Highlight filter tabs (for AI action feedback) */
  highlighted?: boolean;
  /** Saved pricing template — purchase cost display follows its FX when configured. */
  pricingTemplate?: PricingTemplate | null;
}) {
  const { shop, showToast } = useOnboarding();
  const t = useT();
  const locale = useLocale();
  const shopName = shop.name;
  const shopMirrorKey = productsMirrorShopKey(shop.name, shop.domain);

  const [loading, setLoading] = useState(() => {
    const cached = peekMirrorCache(
      productsMirrorShopKey(shop.name, shop.domain)
    );
    return !cached;
  });
  const [error, setError] = useState<string | null>(null);
  const [batchAcking, setBatchAcking] = useState(false);
  const [products, setProducts] = useState<ShopMirrorProduct[]>(() => {
    return (
      peekMirrorCache(productsMirrorShopKey(shop.name, shop.domain))?.items ??
      []
    );
  });
  const [internalFilter, setInternalFilter] = useState<ShopFilter>("all");
  const minisFpRef = useRef("");
  const filter = filterProp ?? internalFilter;
  const setFilter = useCallback(
    (f: ShopFilter) => {
      if (onFilterChange) onFilterChange(f);
      else setInternalFilter(f);
    },
    [onFilterChange]
  );
  // 回显: itemId -> ACTIVE binding. Server is the source of truth; refreshed on load/sync.
  const [bindings, setBindings] = useState<Record<string, ImageBindingView>>(
    () =>
      peekMirrorCache(productsMirrorShopKey(shop.name, shop.domain))?.bindings ??
      {}
  );
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (opts?: { silent?: boolean; retryPoolBackfill?: boolean }): Promise<ShopMirrorProduct[] | null> => {
    const silent = opts?.silent ?? false;
    const retryPoolBackfill = opts?.retryPoolBackfill ?? !silent;
    if (!silent) {
      // 有缓存（含刷新后 sessionStorage）先展示，再后台静默拉新，避免整页空白。
      const cached = peekMirrorCache(shopMirrorKey);
      if (cached) {
        setProducts(cached.items);
        setBindings(cached.bindings);
        onShopProductsChange?.(cached.items, cached.bindings);
        setLoading(false);
        void load({ silent: true });
        return cached.items;
      }
      setLoading(true);
      setError(null);
    }
    try {
      const [items, bound] = await Promise.all([
        api.getShopProducts(shopName),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
      ]);
      setProducts(items);
      const map: Record<string, ImageBindingView> = {};
      for (const b of bound) {
        if (!b.thirdPlatformItemId) continue;
        map[b.thirdPlatformItemId] = mergeStoredIdentityIntoBinding(
          shopName,
          b.thirdPlatformItemId,
          b
        );
      }
      const ackedMap = await autoAckHighConfidencePendingBindings(shopName, map);
      setBindings(ackedMap);
      onShopProductsChange?.(items, ackedMap);
      setMirrorCache(shopMirrorKey, { items, bindings: ackedMap });

      void (async () => {
        try {
          const productById = new Map(
            items.map((p) => [p.thirdPlatformItemId, p] as const)
          );
          const updates: Record<string, ImageBindingView> = {};
          let backfillAttempts = 0;
          const backfillLimit = 8;

          for (const [itemId, binding] of Object.entries(ackedMap)) {
            if (backfillAttempts >= backfillLimit) break;
            if (!binding.bound || !binding.tangbuyProductId) continue;
            if (isPublishSourcedBinding(binding)) continue;
            if (binding.sourceIdentity?.internalGoodsId?.trim()) continue;

            const storedIdentity = readProductSourceIdentity(shopName, itemId);
            if (storedIdentity?.internalGoodsId?.trim()) continue;
            const poolStatus =
              storedIdentity?.poolIngestStatus ??
              binding.sourceIdentity?.poolIngestStatus;
            if (!retryPoolBackfill) {
              if (isTerminalPoolIngestStatus(poolStatus)) continue;
              if (isPoolIngestPending(poolStatus)) continue;
            }

            backfillAttempts += 1;
            try {
              const product = productById.get(itemId);
              const identity = await backfillProductSourceIdentity({
                shopName,
                thirdPlatformItemId: itemId,
                tangbuyProductId: binding.tangbuyProductId,
                tangbuySkuId: binding.tangbuySkuId,
                detailUrl: binding.detailUrl,
                titleHint: product?.title ?? binding.offerTitle,
                skipPoolRetry: !retryPoolBackfill,
                retryPoolSubmit: retryPoolBackfill,
              });
              if (identity) {
                updates[itemId] = mergeIdentityIntoBinding(binding, identity);
              }
            } catch {
              // Best-effort — gateway may be offline during dev.
            }
          }

          if (Object.keys(updates).length > 0) {
            setBindings((prev) => ({ ...prev, ...updates }));
          }
        } catch {
          // Background enrichment must never break the product list.
        }
      })();
      return items;
    } catch (err) {
      if (!silent) setError(readableError(err));
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shopName, shopMirrorKey, onShopProductsChange]);

  const batchLinkBusyRef = useRef(false);
  const batchWasActiveRef = useRef(false);
  const markCardResolvedRef = useRef<(productId: string) => void>(() => {});

  const handleBound = useCallback(
    (itemId: string, view: ImageBindingView) => {
      setBindings((prev) => ({ ...prev, [itemId]: view }));
      if (view.bound || view.bindStatus === "ACTIVE") {
        markCardResolvedRef.current(itemId);
      }
      // Avoid full-list skeleton reload between per-card steps — sync at batch end.
      if (!batchLinkBusyRef.current) onActivity?.();
    },
    [onActivity]
  );

  const scrollToBatchLinkProduct = useCallback(
    (productId: string) => {
      onProductFocus?.(productId);
      requestAnimationFrame(() => {
        const el = document.querySelector(
          `[data-product-id="${CSS.escape(productId)}"]`
        );
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const topInset = 96;
        const bottomInset = 48;
        const inView =
          rect.top >= topInset && rect.bottom <= window.innerHeight - bottomInset;
        if (inView) return;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [onProductFocus]
  );

  const {
    progress: batchLinkProgress,
    start: startBatchLink,
    isRunning: batchLinkRunning,
    markCardResolved,
  } = useBatchLinkQueue({
    shopName,
    locale,
    onBound: handleBound,
    onScrollToProduct: scrollToBatchLinkProduct,
  });
  markCardResolvedRef.current = markCardResolved;

  const {
    cardStates: publishRevealStates,
    start: startPublishReveal,
    isRunning: publishRevealRunning,
  } = usePublishLinkReveal({
    shopName,
    onScrollToProduct: scrollToBatchLinkProduct,
    onRevealComplete: () => {
      void load({ silent: true });
      onActivity?.();
    },
  });

  useEffect(() => {
    if (loading || batchLinkRunning || publishRevealRunning) return;
    const queue = readPublishRevealQueue(shopName);
    if (!queue.length) return;
    const productIds = new Set(products.map((p) => p.thirdPlatformItemId));
    const pending = queue.filter((e) => productIds.has(e.thirdPlatformItemId));
    if (!pending.length) return;
    void startPublishReveal(pending);
  }, [
    loading,
    products,
    shopName,
    batchLinkRunning,
    publishRevealRunning,
    startPublishReveal,
  ]);

  useEffect(() => {
    const busy = batchLinkProgress.active || batchLinkRunning || publishRevealRunning;
    batchLinkBusyRef.current = busy;
    onBatchLinkProgressChange?.(batchLinkProgress);

    if (batchWasActiveRef.current && !batchLinkProgress.active && batchLinkProgress.done) {
      onBatchLinkFinished?.(batchLinkProgress);
    }
    batchWasActiveRef.current = batchLinkProgress.active;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- progress edge only
  }, [batchLinkProgress, batchLinkRunning]);

  const runBatchLink = useCallback(
    async (scope: ShopMirrorProduct[], source: BatchLinkRequest["source"]) => {
      if (batchLinkRunning) return;
      const pendingSet = pendingNewAnalysisIds ?? new Set<string>();

      const eligibleScope = scope.filter((p) =>
        isEligibleForImageBatchLink({
          thirdPlatformItemId: p.thirdPlatformItemId,
          primaryImageUrl: p.primaryImageUrl,
          binding: bindings[p.thirdPlatformItemId],
          shopName,
        })
      );

      if (eligibleScope.length === 0) {
        if (source !== "auto") showToast(t("productsPage.toastNoLinkable"));
        onBatchLinkFinished?.({ ...INITIAL_BATCH_LINK_PROGRESS, source, done: true });
        return;
      }

      const variantReady = await loadVariantReadyIds(
        shopName,
        eligibleScope.map((p) => p.thirdPlatformItemId)
      );
      const preflight = preflightBatchLinkScope(eligibleScope, pendingSet, variantReady);

      if (preflight.readyProducts.length === 0) {
        if (source === "auto") {
          onBatchLinkFinished?.({
            ...INITIAL_BATCH_LINK_PROGRESS,
            source,
            deferredIds: preflight.deferredIds,
            done: true,
          });
          return;
        }
        showToast(
          preflight.deferredIds.length > 0
            ? t("shopProducts.toastImageNotReady")
            : t("shopProducts.toastNoLinkableProducts")
        );
        onBatchLinkFinished?.({
          ...INITIAL_BATCH_LINK_PROGRESS,
          source,
          deferredIds: preflight.deferredIds,
          done: true,
        });
        return;
      }

      setFilter("all");
      if (source === "manual") {
        showToast(
          t("shopProducts.toastBatchLinkStart", {
            count: preflight.readyProducts.length,
          })
        );
      }

      void startBatchLink(preflight.readyProducts, {
        source,
        deferredIds: preflight.deferredIds,
      });
    },
    [
      batchLinkRunning,
      bindings,
      onBatchLinkFinished,
      pendingNewAnalysisIds,
      setFilter,
      shopName,
      showToast,
      startBatchLink,
      t,
    ]
  );

  const runBatchLinkForUnbound = useCallback(
    (scope: ShopMirrorProduct[]) => {
      void runBatchLink(scope, "manual");
    },
    [runBatchLink]
  );

  // Propagate binding map to the page after local state commits — never inside a setState updater.
  useEffect(() => {
    if (loading) return;
    onBindingsChange?.(bindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- parent often passes an inline fn
  }, [bindings, loading]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / shop change only
  }, [shopName]);

  const mirrorRefreshSeen = useRef(0);
  useEffect(() => {
    if (!mirrorRefreshSignal || mirrorRefreshSignal === mirrorRefreshSeen.current) {
      return;
    }
    mirrorRefreshSeen.current = mirrorRefreshSignal;
    if (batchLinkBusyRef.current) return;
    void load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal edge only
  }, [mirrorRefreshSignal]);

  // null = unbound; "pending" = needs manual ack; "confirmed" = active binding.
  const stateOf = useCallback(
    (p: ShopMirrorProduct): "pending" | "confirmed" | null => {
      const b = bindings[p.thirdPlatformItemId];
      if (isAlreadySourcedProduct(b, shopName, p.thirdPlatformItemId)) {
        if (!b?.bound) return null;
        if (b.bindStatus !== "PENDING") return "confirmed";
        return isHighConfidencePendingBinding(b) ? "confirmed" : "pending";
      }
      if (!b?.bound) return null;
      if (b.bindStatus !== "PENDING") return "confirmed";
      return isHighConfidencePendingBinding(b) ? "confirmed" : "pending";
    },
    [bindings, shopName]
  );

  const manualAckPendingCount = useMemo(() => {
    let n = 0;
    for (const p of products) {
      const b = bindings[p.thirdPlatformItemId];
      if (!b?.bound || b.bindStatus !== "PENDING") continue;
      if (isHighConfidencePendingBinding(b)) continue;
      n += 1;
    }
    return n;
  }, [products, bindings]);

  const counts = useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    for (const p of products) {
      const s = stateOf(p);
      if (s === "pending") pending += 1;
      else if (s === "confirmed") confirmed += 1;
    }
    const newArrivalsInList = pendingNewAnalysisIds
      ? products.filter((p) => pendingNewAnalysisIds.has(p.thirdPlatformItemId)).length
      : 0;
    return {
      all: products.length,
      new_arrivals: Math.max(pendingNewAnalysisIds?.size ?? 0, newArrivalsInList),
      pending,
      confirmed,
      unbound: products.length - pending - confirmed,
    };
  }, [products, stateOf, pendingNewAnalysisIds]);

  // Empty pending tab is not useful — return to「全部」after the last ack/unbind.
  useEffect(() => {
    if (loading) return;
    if (filter !== "pending") return;
    if (counts.pending > 0) return;
    setFilter("all");
  }, [loading, filter, counts.pending, setFilter]);

  const pendingNewAnalysisKey = useMemo(
    () =>
      pendingNewAnalysisIds
        ? Array.from(pendingNewAnalysisIds).sort().join(",")
        : "",
    [pendingNewAnalysisIds]
  );

  const pendingNewAnalysisKeySeen = useRef("");
  useEffect(() => {
    if (!pendingNewAnalysisKey) return;
    if (pendingNewAnalysisKey === pendingNewAnalysisKeySeen.current) return;
    pendingNewAnalysisKeySeen.current = pendingNewAnalysisKey;
    if (batchLinkBusyRef.current) return;
    void load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when awareness ids change
  }, [pendingNewAnalysisKey]);

  const newArrivalsAwaitingList =
    filter === "new_arrivals" &&
    (pendingNewAnalysisIds?.size ?? 0) > 0 &&
    products.filter((p) => pendingNewAnalysisIds?.has(p.thirdPlatformItemId)).length === 0;

  const handleBatchAck = async () => {
    if (batchAcking) return;
    const pendingIds = listPendingAckProductIds(products, bindings);
    if (pendingIds.length === 0) {
      showToast(t("shopProducts.toastNoPending"));
      return;
    }
    setBatchAcking(true);
    try {
      const result = await batchAckPendingBindings(shopName, pendingIds);
      setBindings((prev) => applyBatchAckToBindings(prev, pendingIds, result.failed));
      onActivity?.();
      showToast(
        result.failed.length > 0
          ? t("shopProducts.toastBatchAckPartial", {
              ok: result.ok,
              failed: result.failed.length,
            })
          : t("shopProducts.toastBatchAckDone", { ok: result.ok })
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setBatchAcking(false);
    }
  };

  const filtered = useMemo(() => {
    let result = products;
    if (filter === "new_arrivals") {
      result = products.filter((p) =>
        pendingNewAnalysisIds?.has(p.thirdPlatformItemId)
      );
    } else if (filter === "pending") {
      result = products.filter((p) => stateOf(p) === "pending");
    } else if (filter === "confirmed") {
      result = products.filter((p) => stateOf(p) === "confirmed");
    } else if (filter === "unbound") {
      result = products.filter((p) => stateOf(p) === null);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.title?.toLowerCase().includes(query) ||
          p.handle?.toLowerCase().includes(query) ||
          p.thirdPlatformItemId.toLowerCase().includes(query)
      );
    }

    return result;
  }, [products, filter, stateOf, pendingNewAnalysisIds, searchQuery]);

  // Rail「重搜候选」+ page「一键关联」: client-side per-card batch link.
  const rematchSignalSeen = useRef(0);
  useEffect(() => {
    if (linkingLocked) return;
    if (!rematchUnboundSignal || rematchUnboundSignal === rematchSignalSeen.current) {
      return;
    }
    rematchSignalSeen.current = rematchUnboundSignal;
    const unboundProducts = products.filter((p) => stateOf(p) === null);
    runBatchLinkForUnbound(unboundProducts);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal edge only
  }, [rematchUnboundSignal]);

  const batchLinkSessionActive =
    batchLinkProgress.sessionOrder.length > 0 &&
    (batchLinkProgress.active || batchLinkProgress.done);

  useEffect(() => {
    setPage(1);
  }, [filter, searchQuery]);

  const displayProducts = useMemo(() => {
    const usePagedBatchSort =
      batchLinkProgress.active &&
      filter === "all" &&
      filtered.length <= SHOP_PRODUCTS_PAGE_SIZE;
    if (usePagedBatchSort) {
      return sortProductsForBatchLink(filtered, batchLinkProgress);
    }
    if (batchLinkSessionActive && filter === "all" && filtered.length <= SHOP_PRODUCTS_PAGE_SIZE) {
      return sortProductsForBatchLink(filtered, batchLinkProgress);
    }
    return filtered;
  }, [batchLinkProgress, batchLinkSessionActive, filter, filtered]);

  const totalPages = Math.max(
    1,
    Math.ceil(displayProducts.length / SHOP_PRODUCTS_PAGE_SIZE)
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * SHOP_PRODUCTS_PAGE_SIZE;
    let slice = displayProducts.slice(start, start + SHOP_PRODUCTS_PAGE_SIZE);
    if (
      batchLinkSessionActive &&
      filter === "all" &&
      displayProducts.length > SHOP_PRODUCTS_PAGE_SIZE
    ) {
      slice = sortProductsForBatchLink(slice, batchLinkProgress);
    }
    return slice;
  }, [batchLinkProgress, batchLinkSessionActive, displayProducts, filter, page]);

  const pageLinkableProducts = useMemo(
    () => filterLinkableProducts(paginatedProducts, bindings, shopName),
    [paginatedProducts, bindings, shopName]
  );

  useEffect(() => {
    onPageLinkableScopeChange?.({
      ids: pageLinkableProducts.map((p) => p.thirdPlatformItemId),
      page,
      totalPages,
      pageSize: SHOP_PRODUCTS_PAGE_SIZE,
    });
  }, [pageLinkableProducts, page, totalPages, onPageLinkableScopeChange]);

  const batchLinkRequestSeen = useRef(0);
  useEffect(() => {
    if (!batchLinkRequest?.signal || batchLinkRequest.signal === batchLinkRequestSeen.current) {
      return;
    }
    batchLinkRequestSeen.current = batchLinkRequest.signal;
    const scope = batchLinkRequest.productIds?.length
      ? products.filter((p) =>
          batchLinkRequest.productIds!.includes(p.thirdPlatformItemId)
        )
      : pageLinkableProducts;
    void runBatchLink(scope, batchLinkRequest.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal edge only
  }, [batchLinkRequest, pageLinkableProducts, products, runBatchLink]);

  useEffect(() => {
    if (!onMinisChange) return;
    const all = buildShopProductMinis(products, bindings, shopName);
    const pending = all.filter((m) => m.state === "pending");
    const unbound = all.filter((m) => m.state === "unbound");
    const fp = `${pending.map((m) => m.productId).join(",")}|${unbound
      .map((m) => m.productId)
      .join(",")}`;
    if (fp === minisFpRef.current) return;
    minisFpRef.current = fp;
    onMinisChange({ pending, unbound });
    // Intentionally omit onMinisChange from deps — parent often passes an inline fn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, bindings]);

  useEffect(() => {
    if (!scrollToProductId) return;
    const el = document.querySelector(
      `[data-product-id="${CSS.escape(scrollToProductId)}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    onScrollToConsumed?.();
  }, [scrollToProductId, paginatedProducts, onScrollToConsumed]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          variant="chip"
          tabs={[
            { id: "all", label: t("shopProducts.filterAll"), count: counts.all },
            { id: "pending", label: t("shopProducts.filterPending"), count: counts.pending },
            { id: "confirmed", label: t("shopProducts.filterConfirmed"), count: counts.confirmed },
            { id: "unbound", label: t("shopProducts.filterUnbound"), count: counts.unbound },
          ]}
          value={filter}
          onValueChange={(id) => {
            setFilter(id as ShopFilter);
          }}
          highlighted={highlighted}
        />
        <div className="flex items-center gap-2">
          {manualAckPendingCount > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleBatchAck()}
              disabled={batchAcking || linkingLocked}
            >
              {batchAcking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {batchAcking ? t("shopProducts.batchAcking") : t("shopProducts.batchAck", { count: manualAckPendingCount })}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Card className="mb-3 border-red-200">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span>{t("shopProducts.loadFailed")}{error}</span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              {t("shopProducts.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <FadeSwap
        loading={loading || newArrivalsAwaitingList}
        minHeightClass="min-h-[420px]"
        skeleton={
          <Card>
            <TableSkeleton rows={newArrivalsAwaitingList ? 3 : 5} />
          </Card>
        }
      >
        {products.length === 0 ? (
          <EmptyState
            title={t("shopProducts.emptyNoProducts")}
            description={t("shopProducts.emptyNoProductsDesc")}
          />
        ) : displayProducts.length === 0 ? (
          <EmptyState
            title={
              filter === "new_arrivals"
                ? t("shopProducts.emptyNoNewArrivals")
                : t("shopProducts.emptyFilterTitle")
            }
            description={
              filter === "new_arrivals"
                ? t("shopProducts.emptyNewArrivalsDesc")
                : t("shopProducts.emptyFilterDesc")
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {paginatedProducts.map((p) => (
              <ShopProductCard
                key={p.id}
                item={p}
                shopName={shopName}
                binding={bindings[p.thirdPlatformItemId] ?? null}
                pricingTemplate={pricingTemplate}
                isNewArrival={pendingNewAnalysisIds?.has(p.thirdPlatformItemId) ?? false}
                listingPriceEdit={
                  aiFieldEdits?.[
                    aiFieldEditKey(p.thirdPlatformItemId, "listingPrice")
                  ] ?? null
                }
                titleEdit={
                  aiFieldEdits?.[aiFieldEditKey(p.thirdPlatformItemId, "title")] ??
                  null
                }
                onListingPriceEditConsumed={() =>
                  onAiFieldEditConsumed?.(p.thirdPlatformItemId, "listingPrice")
                }
                onTitleEditConsumed={() =>
                  onAiFieldEditConsumed?.(p.thirdPlatformItemId, "title")
                }
                onBound={handleBound}
                onOpenDetail={() => setDetailItemId(p.thirdPlatformItemId)}
                focused={focusProductId === p.thirdPlatformItemId}
                searchModeRequested={searchModeProductId === p.thirdPlatformItemId}
                onSearchModeConsumed={onSearchModeConsumed}
                onFocus={() => onProductFocus?.(p.thirdPlatformItemId)}
                onCandidateContextChange={onCandidateContextChange}
                batchLinkDrive={
                  batchLinkProgress.cardStates[p.thirdPlatformItemId] ??
                  publishRevealStates[p.thirdPlatformItemId]
                }
                linkingLocked={linkingLocked}
                locale={locale}
              />
            ))}
          </div>
        )}
      </FadeSwap>

      {!loading &&
      !newArrivalsAwaitingList &&
      displayProducts.length > SHOP_PRODUCTS_PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || linkingLocked}
            title={t("shopProducts.prevPage")}
            aria-label={t("shopProducts.prevPage")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5.5rem] text-center text-xs text-ink-subtle tabular-nums">
            {t("shopProducts.pageOf", { page, total: totalPages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || linkingLocked}
            title={t("shopProducts.nextPage")}
            aria-label={t("shopProducts.nextPage")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <ShopProductDetailDrawer
        open={detailItemId != null}
        shopName={shopName}
        itemId={detailItemId}
        onClose={() => setDetailItemId(null)}
        onSaved={() => {
          void load({ silent: true });
          onActivity?.();
        }}
      />
    </>
  );
}

function ShopProductCard({
  item,
  shopName,
  binding,
  onBound,
  onOpenDetail,
  focused = false,
  searchModeRequested = false,
  onSearchModeConsumed,
  onFocus,
  onCandidateContextChange,
  isNewArrival = false,
  listingPriceEdit = null,
  onListingPriceEditConsumed,
  titleEdit = null,
  onTitleEditConsumed,
  batchLinkDrive = undefined,
  linkingLocked = false,
  pricingTemplate = null,
  locale = "zh",
}: {
  item: ShopMirrorProduct;
  shopName: string;
  binding: ImageBindingView | null;
  onBound: (itemId: string, view: ImageBindingView) => void;
  onOpenDetail: () => void;
  focused?: boolean;
  searchModeRequested?: boolean;
  onSearchModeConsumed?: () => void;
  onFocus?: () => void;
  onCandidateContextChange?: (
    productId: string,
    ctx: { candidateId: string | null; candidates: CandidateSummary[] }
  ) => void;
  isNewArrival?: boolean;
  listingPriceEdit?: AiFieldEditRecord | null;
  onListingPriceEditConsumed?: () => void;
  titleEdit?: AiFieldEditRecord | null;
  onTitleEditConsumed?: () => void;
  batchLinkDrive?: BatchLinkCardDrive;
  linkingLocked?: boolean;
  pricingTemplate?: PricingTemplate | null;
  locale?: Locale;
}) {
  const { showToast } = useOnboarding();
  const t = useT();
  const listingPriceEditPhases = useAiFieldEditPhases(listingPriceEdit);
  const titleEditPhases = useAiFieldEditPhases(titleEdit, onTitleEditConsumed);
  const listingPriceLabel = resolveListingPriceDisplay(item, listingPriceEdit);
  const displayTitle = titleEdit?.nextDisplay ?? item.title ?? t("shopProducts.noTitle");
  const hasImage = Boolean(item.primaryImageUrl);

  useEffect(() => {
    if (!listingPriceEdit || !onListingPriceEditConsumed) return;

    if (mirrorReflectsListingPriceEdit(item, listingPriceEdit)) {
      const id = setTimeout(onListingPriceEditConsumed, AI_BEFORE_AFTER_MS);
      return () => clearTimeout(id);
    }

    const id = setTimeout(onListingPriceEditConsumed, AI_EDIT_DISPLAY_HOLD_MS);
    return () => clearTimeout(id);
  }, [
    item.minPrice,
    item.maxPrice,
    listingPriceEdit,
    onListingPriceEditConsumed,
  ]);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageSearchResult | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [trayOpen, setTrayOpen] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; alt: string } | null>(
    null
  );
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const [matchScores, setMatchScores] = useState<Record<string, number>>({});
  const [imageScores, setImageScores] = useState<Record<string, number | null>>({});
  const [recommendedIdx, setRecommendedIdx] = useState(0);
  const topCandidateRef = useRef<HTMLDivElement>(null);
  const prevTrayOpenRef = useRef(false);

  useEffect(() => {
    if (!batchLinkDrive) return;
    const { state, searchResult, matchScores, imageScores: driveImageScores } =
      batchLinkDrive;
    if (state === "searching" || state === "queued") {
      setSearchError(null);
    }
    if (
      searchResult &&
      [
        "candidates_ready",
        "auto_selecting",
        "binding",
        "failed",
        "done",
      ].includes(state)
    ) {
      setResult(searchResult);
      setMatchScores(matchScores ?? {});
      setImageScores(driveImageScores ?? {});
      setRecommendedIdx(0);
      setCurrentIdx(0);
      setTrayOpen(true);
    }
    if (state === "done") {
      setTrayOpen(false);
    }
  }, [batchLinkDrive]);

  useEffect(() => {
    if (!batchLinkDrive?.highlightTopCandidate) return;
    const t = window.setTimeout(() => {
      topCandidateRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }, 120);
    return () => clearTimeout(t);
  }, [
    batchLinkDrive?.highlightTopCandidate,
    batchLinkDrive?.state,
    trayOpen,
  ]);

  // External request: enter Search Mode + run image search (real API).
  useEffect(() => {
    if (!searchModeRequested) return;
    setTrayOpen(true);
    onFocus?.();
    void (async () => {
      await runSearchWithPhases();
      onSearchModeConsumed?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchModeRequested]);

  // The panel owns binding truth (回显 map); the card renders the prop and reports confirms upward.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [supplierConfirm, setSupplierConfirm] = useState<{
    candidate: ImageSearchProduct;
    confidence: CandidateConfidence;
  } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);

  const boundOfferId =
    binding?.bound && binding.tangbuyProductId ? binding.tangbuyProductId : null;
  const bindPending = Boolean(binding?.bound) && binding?.bindStatus === "PENDING";
  const [autoAcking, setAutoAcking] = useState(false);

  // High-confidence auto-links: silently promote PENDING → ACTIVE (no extra tap).
  useEffect(() => {
    if (!bindPending || !binding?.bound || autoAcking || acking) return;
    if (!isHighConfidencePendingBinding(binding)) return;
    let cancelled = false;
    setAutoAcking(true);
    void (async () => {
      try {
        const acked = await ackAutoLinkedBinding(
          shopName,
          item.thirdPlatformItemId,
          binding
        );
        if (!cancelled) onBound(item.thirdPlatformItemId, acked);
      } finally {
        if (!cancelled) setAutoAcking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    acking,
    autoAcking,
    bindPending,
    binding,
    item.thirdPlatformItemId,
    onBound,
    shopName,
  ]);

  const needsManualAck =
    bindPending && binding && !isHighConfidencePendingBinding(binding);

  useEffect(() => {
    const justOpened = trayOpen && !prevTrayOpenRef.current;
    prevTrayOpenRef.current = trayOpen;
    if (!justOpened || !result?.items?.length || !boundOfferId) return;
    const top = result.items[0];
    if (top && top.productId !== boundOfferId) {
      setRecommendedIdx(0);
      setCurrentIdx(0);
    }
  }, [trayOpen, result, boundOfferId]);
  const bindConfirmed = Boolean(binding?.bound) && !bindPending;
  // Published from the Tangbuy catalog → already a 1:1 source link; no matching needed.
  const fromPublish =
    isPublishSourcedBinding(binding) ||
    isAlreadySourcedProduct(binding, shopName, item.thirdPlatformItemId);
  const fromManual = isManualImageBinding(binding);

  // Snapshot captured at confirm time: the exact candidate image/price the user matched. Preferred for
  // 回显 so we don't depend on (and don't re-hit) offer-detail, whose cross-border payload often has a
  // null white image and an empty SKU matrix.
  const snapImage = binding?.bound ? (binding.offerImageUrl ?? null) : null;
  const snapPrice = binding?.bound ? (binding.offerPrice ?? null) : null;
  const snapTitle = binding?.bound ? (binding.offerTitle ?? null) : null;
  const hasSnapshot = Boolean(snapImage && snapPrice);

  // Bound cards lazily fetch the real offer detail only when there's no snapshot, so the right tile can
  // still show 货源图/价 for legacy bindings (route B). New bindings skip this call entirely.
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [itemGetCostCny, setItemGetCostCny] = useState<number | null>(null);
  const [itemGetCostLoading, setItemGetCostLoading] = useState(false);
  const [itemGetTitle, setItemGetTitle] = useState<string | null>(null);
  const [itemGetHeroImage, setItemGetHeroImage] = useState<string | null>(null);

  const publishDisplaySnapshot = useMemo(
    () => readPublishDisplaySnapshot(shopName, item.thirdPlatformItemId),
    [shopName, item.thirdPlatformItemId]
  );

  const boundDetailUrl = resolveSkuDetailUrl(
    binding?.detailUrl,
    binding?.tangbuyProductId
  );

  useEffect(() => {
    if (!boundOfferId || !boundDetailUrl) {
      setItemGetCostCny(null);
      return;
    }
    let cancelled = false;
    setItemGetCostLoading(true);
    void fetchItemGetProcurementPrice(boundDetailUrl, binding?.tangbuySkuId)
      .then((price) => {
        if (!cancelled) setItemGetCostCny(price);
      })
      .catch(() => {
        if (!cancelled) setItemGetCostCny(null);
      })
      .finally(() => {
        if (!cancelled) setItemGetCostLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boundOfferId, boundDetailUrl, binding?.tangbuySkuId]);

  useEffect(() => {
    if (!boundOfferId || !boundDetailUrl || !snapTitleNeedsItemGetFallback(snapTitle)) {
      setItemGetTitle(null);
      return;
    }
    let cancelled = false;
    setItemGetTitle(null);
    void fetchItemDetail(boundDetailUrl)
      .then((detail) => {
        if (cancelled || !detail) return;
        const title =
          detail.itemNameTrans?.trim() || detail.itemName?.trim() || null;
        setItemGetTitle(title);
      })
      .catch(() => {
        if (!cancelled) setItemGetTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boundOfferId, boundDetailUrl, snapTitle]);

  useEffect(() => {
    if (!boundOfferId || !boundDetailUrl || snapImage?.trim()) {
      setItemGetHeroImage(null);
      return;
    }
    let cancelled = false;
    setItemGetHeroImage(null);
    void fetchItemDetail(boundDetailUrl)
      .then((detail) => {
        if (cancelled || !detail) return;
        const image = resolveManualHeroImage(detail, null);
        if (image) setItemGetHeroImage(image);
      })
      .catch(() => {
        if (!cancelled) setItemGetHeroImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [boundOfferId, boundDetailUrl, snapImage]);

  useEffect(() => {
    if (!boundOfferId) {
      setOffer(null);
      return;
    }
    if (hasSnapshot) {
      setOffer(null);
      setOfferLoading(false);
      return;
    }
    if (isInternalGoodsId(boundOfferId)) {
      setOffer(null);
      setOfferLoading(false);
      return;
    }
    let cancelled = false;
    // Legacy bindings without snapshot: lazy-fetch offer detail for 货源图/价 fallback.
    setOfferLoading(true);
    api
      .getOfferDetail(boundOfferId, offerDetailCountryForLocale(locale))
      .then((d) => {
        if (!cancelled) setOffer(d);
      })
      .catch(() => {
        if (!cancelled) setOffer(null);
      })
      .finally(() => {
        if (!cancelled) setOfferLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boundOfferId, hasSnapshot, locale]);

  const runSearchWithPhases = async () => {
    if (searching) return;
    if (fromPublish) {
      setSearchError(t("shopProducts.publishSourcedNoSearch"));
      return;
    }
    setSearching(true);
    setSearchError(null);
    setTrayOpen(true);
    const phases = [
      t("shopProducts.phaseAnalyze"),
      t("shopProducts.phaseMatch"),
      t("shopProducts.phaseCompare"),
    ];
    let i = 0;
    setSearchPhase(phases[0]!);
    const timer = window.setInterval(() => {
      i = Math.min(i + 1, phases.length - 1);
      setSearchPhase(phases[i]!);
    }, 450);
    try {
      const pipeline = await runImageSearchPipeline(
        shopName,
        item,
        5,
        { binding, locale }
      );
      if (pipeline.error || !pipeline.result) {
        setResult(null);
        setMatchScores({});
        setImageScores({});
        setSearchError(
          pipeline.error ??
            imageSearchError(new Error(t("shopProducts.imageSearchFailed")))
        );
        return;
      }
      setMatchScores(pipeline.matchScores);
      setImageScores(pipeline.imageScores);
      let ordered = pipeline.rankedItems;
      try {
        const reranked = await rerankForShopMirrorProduct(
          shopName,
          item.thirdPlatformItemId,
          pipeline.rankedItems,
          pipeline.imageScores,
          { maxProbe: 5 }
        );
        ordered = reranked.orderedCandidates;
      } catch {
        /* keep image-search order */
      }
      setRecommendedIdx(0);
      setResult(
        pipeline.result
          ? { ...pipeline.result, items: ordered }
          : null
      );
      setCurrentIdx(0);
    } catch (err) {
      setResult(null);
      setMatchScores({});
      setImageScores({});
      setSearchError(imageSearchError(err));
    } finally {
      window.clearInterval(timer);
      setSearchPhase(null);
      setSearching(false);
    }
  };

  /** Open existing tray, or run a fresh search. */
  const openOrRunSearch = async (forceRefresh: boolean) => {
    onFocus?.();
    if (!forceRefresh && result && result.items.length > 0) {
      setTrayOpen(true);
      return;
    }
    await runSearchWithPhases();
  };

  const runSearch = async () => {
    await openOrRunSearch(true);
  };

  const executeBinding = async (
    candidate: ImageSearchProduct,
    opts?: { allowPoolIngest?: boolean }
  ) => {
    if (!result) return;
    const wasRebind = Boolean(boundOfferId);
    setConfirmingId(candidate.productId);
    setConfirmError(null);
    showToast(wasRebind ? t("shopProducts.toastRebinding") : t("shopProducts.toastBinding"));
    try {
      const confidence = resolveCandidateConfidence(
        candidate,
        matchScores,
        imageScores
      );
      const allowPoolIngest =
        opts?.allowPoolIngest ??
        allowPoolIngestOnConfirm({
          tier: confidence.tier,
          catalogSource: Boolean(
            candidate.catalogSource || candidate.internalGoodsId?.trim()
          ),
        });
      const merged = await confirmCandidateBinding(shopName, item, candidate, result, {
        imageScores,
        titleScores: matchScores,
        allowPoolIngest,
        locale,
      });
      onBound(item.thirdPlatformItemId, merged);
      if (merged.offerTitle?.trim()) {
        setItemGetTitle(merged.offerTitle.trim());
      }
      setSupplierConfirm(null);
      setTrayOpen(false);
      showToast(wasRebind ? t("shopProducts.toastRebound") : t("shopProducts.toastBound"));
    } catch (err) {
      const msg = imageMatchError(err);
      setConfirmError(msg);
      showToast(msg);
    } finally {
      setConfirmingId(null);
    }
  };

  const confirmMatch = async (candidate: ImageSearchProduct) => {
    if (confirmingId || !result) return;
    const confidence = resolveCandidateConfidence(
      candidate,
      matchScores,
      imageScores
    );
    const catalogSource = Boolean(
      candidate.catalogSource || candidate.internalGoodsId?.trim()
    );
    if (requiresSupplierConfirmBeforePool(confidence.tier, catalogSource)) {
      setSupplierConfirm({ candidate, confidence });
      setConfirmError(null);
      return;
    }
    await executeBinding(candidate, { allowPoolIngest: true });
  };

  // "确认无误": promote the AI-suggested (PENDING) binding to confirmed (ACTIVE).
  const ackBinding = async () => {
    if (acking || !binding?.bound) return;
    setAcking(true);
    setConfirmError(null);
    try {
      await api.ackImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { ...binding, bindStatus: "ACTIVE" });
      showToast(t("shopProducts.toastConfirmed"));
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setAcking(false);
    }
  };

  // "取消关联": soft-unbind; the card returns to the unmatched state (can re-search).
  const unbindBinding = async () => {
    if (unbinding || !binding?.bound) return;
    const ok = window.confirm(t("shopProducts.confirmUnbind"));
    if (!ok) return;
    setUnbinding(true);
    setConfirmError(null);
    try {
      await api.unbindImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { bound: false });
      setResult(null);
      setCurrentIdx(0);
      showToast(t("shopProducts.toastUnbound"));
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setUnbinding(false);
    }
  };

  // "驳回": unbind the AI suggestion and enqueue a single-item rematch.
  const rejectBinding = async () => {
    if (rejecting || !binding?.bound || !bindPending) return;
    const ok = window.confirm(t("shopProducts.confirmReject"));
    if (!ok) return;
    setRejecting(true);
    setConfirmError(null);
    try {
      await api.unbindImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { bound: false });
      setResult(null);
      setCurrentIdx(0);
      await api.startMatchQueue(shopName, item.thirdPlatformItemId);
      showToast(t("shopProducts.toastRejected"));
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setRejecting(false);
    }
  };

  const handleManualBound = (view: ImageBindingView) => {
    onBound(item.thirdPlatformItemId, view);
    if (view.offerTitle?.trim()) {
      setItemGetTitle(view.offerTitle.trim());
    }
    setResult(null);
    setCurrentIdx(0);
    setTrayOpen(false);
  };

  const candidates = result?.items ?? null;
  const current = candidates?.[currentIdx] ?? null;

  const searchRecoveryHints = useMemo(
    () =>
      buildImageSearchRecoveryHints({
        result,
        hasImage,
        errorMessage: searchError,
      }),
    [result, hasImage, searchError]
  );

  useEffect(() => {
    if (!supplierConfirm || !current) return;
    if (supplierConfirm.candidate.productId !== current.productId) {
      setSupplierConfirm(null);
    }
  }, [current?.productId, supplierConfirm]);

  const candidateSummaries = useMemo((): CandidateSummary[] => {
    if (!candidates?.length) return [];
    return candidates.map((c, idx) => ({
      productId: c.productId,
      title: resolveImageSearchDisplayTitle(c, locale),
      priceCny: parseGatewayPrice(c.price),
      matchScore:
        matchScores[c.productId] ??
        matchScores[candidateStorageKey(c)] ??
        normalizeMatchScore(c.similarityScore),
      imageScore: resolveCandidateImageScore(c, imageScores),
      rank: idx,
      soldCount: c.soldCount,
      repurchaseRate: c.repurchaseRate,
      inventory: c.inventory,
    }));
  }, [candidates, matchScores, imageScores, locale]);

  const shopPrice = item.minPrice ?? item.maxPrice ?? null;
  const shopCurrency = item.currency;
  const effectiveShopPrice =
    listingPriceEdit?.field === "listingPrice" &&
    listingPriceEdit.nextValue != null
      ? listingPriceEdit.nextValue
      : shopPrice;

  const trayInlineReasons = useMemo(() => {
    if (candidateSummaries.length === 0) return {};
    return buildTrayInlineReasons(candidateSummaries, {
      shopPrice: effectiveShopPrice,
      shopCurrency: shopCurrency ?? null,
      recommendedProductId:
        candidates?.[recommendedIdx]?.productId ?? null,
      currentCandidateId: current?.productId ?? null,
      boundOfferId,
      bindPending,
    }, t);
  }, [
    candidateSummaries,
    effectiveShopPrice,
    shopCurrency,
    candidates,
    recommendedIdx,
    current?.productId,
    boundOfferId,
    bindPending,
    t,
  ]);

  useEffect(() => {
    if (!onCandidateContextChange) return;
    onCandidateContextChange(item.thirdPlatformItemId, {
      candidateId: current?.productId ?? null,
      candidates: candidateSummaries,
    });
  }, [
    candidateSummaries,
    current?.productId,
    item.thirdPlatformItemId,
    onCandidateContextChange,
  ]);

  // Right tile: preview a tray candidate only while the tray is open; otherwise show bound source.
  const rightMode: "candidate" | "bound" | "empty" = trayOpen && current
    ? "candidate"
    : boundOfferId
      ? "bound"
      : current
        ? "candidate"
        : "empty";
  const isBoundHere =
    current != null && boundOfferId != null && boundOfferId === current.productId;
  const isRebind =
    current != null && boundOfferId != null && boundOfferId !== current.productId;

  // —— 货源采购价（成本展示；与右侧定价策略无关） ——
  const boundImage =
    snapImage ??
    itemGetHeroImage ??
    publishDisplaySnapshot?.imageUrl ??
    offerImage(offer);
  const boundCandidate =
    candidates?.find((c) => c.productId === boundOfferId) ?? null;
  const boundTitle = resolveBoundSourceDisplayTitle({
    locale,
    snapTitle,
    itemGetTitle,
    offerSubjectTrans: offer?.subjectTrans,
    offerSubject: offer?.subject,
    candidateTitle: boundCandidate?.title,
    candidateTitleTrans: boundCandidate?.titleTrans,
    candidateEnglishTitle: boundCandidate?.englishTitle,
  });
  const boundCostCny =
    itemGetCostCny ??
    parseGatewayPrice(snapPrice) ??
    parseGatewayPrice(publishDisplaySnapshot?.price) ??
    parseGatewayPrice((offerPriceText(offer) ?? "").replace(/¥/g, ""));

  const formatOfferCost = (cny: number | null, fallbackRaw?: string | null) =>
    formatPurchaseCostLabel(t, cny, shopCurrency, fallbackRaw, pricingTemplate);

  const reco =
    rightMode === "candidate" && current
      ? {
          image: current.imageUrl ?? null,
          title: resolveImageSearchDisplayTitle(current, locale),
          costCny: parseGatewayPrice(current.price),
          priceText: formatOfferCost(
            parseGatewayPrice(current.price),
            current.price
          ),
        }
      : rightMode === "bound"
        ? {
            image: boundImage,
            title: boundTitle,
            costCny: boundCostCny,
            priceText: formatOfferCost(boundCostCny, snapPrice),
          }
        : null;

  const profit = reco
    ? profitPerOrderPurchaseDisplay(
        effectiveShopPrice,
        shopCurrency,
        reco.costCny,
        pricingTemplate
      )
    : null;
  const previousProfit =
    listingPriceEdit?.field === "listingPrice" &&
    listingPriceEdit.previousValue != null &&
    reco
      ? profitPerOrderPurchaseDisplay(
          listingPriceEdit.previousValue,
          shopCurrency,
          reco.costCny,
          pricingTemplate
        )
      : null;
  const boundLoading =
    rightMode === "bound" &&
    !boundImage &&
    itemGetCostCny == null &&
    (itemGetCostLoading || (!hasSnapshot && offerLoading && !offer));

  const cardState: "matched" | "pending" | "unbound" = needsManualAck
    ? "pending"
    : boundOfferId || fromPublish
      ? "matched"
      : "unbound";

  const catalogIngesting = useCatalogIngestStatus(
    shopName,
    item.thirdPlatformItemId,
    binding,
    {
      poll: Boolean(boundOfferId || bindPending),
      titleHint: item.title,
      tangbuySkuId: binding?.tangbuySkuId,
    }
  );

  const batchLinking =
    batchLinkDrive != null &&
    ["searching", "candidates_ready", "auto_selecting", "binding"].includes(
      batchLinkDrive.state
    );
  const batchQueued = batchLinkDrive?.state === "queued";
  const batchCardActive =
    batchLinkDrive != null &&
    ["queued", "searching", "candidates_ready", "auto_selecting", "binding"].includes(
      batchLinkDrive.state
    );
  const cardActionsLocked = linkingLocked && !batchCardActive;

  const headerBadge = useMemo(() => {
    if (batchQueued) {
      return { label: t("shopProducts.statusQueued"), variant: "linking" as const };
    }
    if (batchLinking) {
      return { label: t("shopProducts.statusLinking"), variant: "linking" as const };
    }
    if (boundOfferId || bindConfirmed) {
      if (needsManualAck) {
        return { label: t("shopProducts.pending"), variant: "pending" as const };
      }
      return {
        label: fromPublish
          ? t("shopProducts.statusPublishLink")
          : fromManual
            ? t("shopProducts.statusManual")
            : t("shopProducts.autoMatched"),
        variant: "matched" as const,
      };
    }
    if (batchLinkDrive?.state === "needs_review") {
      return { label: t("shopProducts.statusPendingSource"), variant: "pending" as const };
    }
    if (batchLinkDrive?.state === "failed") {
      return { label: t("shopProducts.statusFailed"), variant: "unbound" as const };
    }
    if (needsManualAck) {
      return { label: t("shopProducts.pending"), variant: "pending" as const };
    }
    if (current) {
      return { label: t("shopProducts.statusSelected"), variant: "selected" as const };
    }
    return { label: t("shopProducts.statusUnmatched"), variant: "unbound" as const };
  }, [
    batchLinkDrive?.state,
    batchLinking,
    batchQueued,
    bindConfirmed,
    needsManualAck,
    boundOfferId,
    fromPublish,
    fromManual,
    current,
    t,
  ]);

  const displayTitleScore =
    batchLinkDrive?.titleScore ??
    resolveCardMatchScore(binding ?? undefined, current, matchScores);
  const displayImageScore =
    batchLinkDrive?.imageScore ??
    (current ? resolveCandidateImageScore(current, imageScores) : null);
  const linkAnimating =
    batchLinkDrive != null &&
    ["searching", "candidates_ready", "auto_selecting", "binding"].includes(
      batchLinkDrive.state
    );
  const batchQueueLine =
    batchLinkDrive && batchLinkDrive.state !== "idle"
      ? formatBatchCardQueueLine(t, batchLinkDrive)
      : null;
  const showBatchQueueFeedback =
    Boolean(batchQueueLine) &&
    !boundOfferId &&
    !bindConfirmed &&
    batchLinkDrive?.state !== "done";

  const matchHeadline = linkAnimating
    ? publishLinkHeadline(
        t,
        batchLinkDrive!.state,
        displayTitleScore,
        displayImageScore
      )
    : middleMatchHeadline(
        t,
        cardState,
        Boolean(current),
        displayTitleScore,
        displayImageScore
      );

  const displayConfidenceTier = useMemo((): MatchConfidenceTier | null => {
    if (batchLinkDrive?.confidenceTier) {
      return batchLinkDrive.confidenceTier;
    }
    if (current) {
      const tier = resolveCandidateConfidence(
        current,
        matchScores,
        imageScores
      ).tier;
      if (tier !== "none") return tier;
    }
    if (binding?.matchScore != null) {
      const tier = classifyMatchConfidence(
        normalizeMatchScore(binding.matchScore)
      );
      if (tier !== "none") return tier;
    }
    return null;
  }, [
    batchLinkDrive?.confidenceTier,
    binding?.matchScore,
    current,
    imageScores,
    matchScores,
  ]);
  const confidenceTierText =
    displayConfidenceTier != null
      ? confidenceTierLabel(displayConfidenceTier, t)
      : null;
  const tags = evidenceTags(t, {
    unbound: cardState === "unbound" && !current,
    pending: cardState === "pending",
    imageSource:
      rightMode === "candidate" ? result?.imageSource : binding?.imageSource,
    querySource:
      rightMode === "candidate" ? result?.querySource : binding?.querySource,
    matchScore: displayTitleScore,
    signals:
      rightMode === "candidate" && current
        ? candidateSignals(t, current)
        : undefined,
    marginPct: null,
  });

  const storedSourceIdentity = useMemo(
    () => readProductSourceIdentity(shopName, item.thirdPlatformItemId),
    [shopName, item.thirdPlatformItemId]
  );

  const sourceDetailUrl = useMemo(
    () =>
      resolveSourceDetailHref({
        binding,
        candidate: current ?? null,
        identity: binding?.sourceIdentity ?? storedSourceIdentity,
      }),
    [binding, current, storedSourceIdentity]
  );

  const recoInventory =
    rightMode === "candidate" && current?.inventory != null
      ? String(current.inventory).trim()
      : null;
  const detailUrl = sourceDetailUrl;

  const primaryLabel =
    cardState === "unbound" && !current
      ? t("shopProducts.findCandidates")
      : current && !isBoundHere
        ? isRebind
          ? t("shopProducts.rebind")
          : t("shopProducts.confirm")
        : cardState === "pending"
          ? t("shopProducts.confirm")
          : null;

  const onPrimary = () => {
    if (cardState === "unbound" && !current) {
      void openOrRunSearch(true);
      return;
    }
    if (current && !isBoundHere) {
      void confirmMatch(current);
      return;
    }
    if (cardState === "pending") {
      void ackBinding();
    }
  };

  const openImageZoom = (
    event: React.MouseEvent,
    src: string | null | undefined,
    alt: string
  ) => {
    if (!src) return;
    event.stopPropagation();
    setZoomImage({ src, alt });
  };

  return (
    <article
      data-product-id={item.thirdPlatformItemId}
      onClick={() => {
        if (listingPriceEditPhases.pill) onListingPriceEditConsumed?.();
        onFocus?.();
      }}
      className={cn(
        "relative flex flex-col p-4",
        batchLinking
          ? "rounded-[var(--radius-card)] border border-info bg-info-soft/30 shadow-md ring-2 ring-info/25"
          : batchQueued
            ? "rounded-[var(--radius-card)] border border-surface-border bg-surface shadow-card ring-1 ring-ring/20"
            : focused
              ? selectableCardClassName({
                  selected: true,
                  interactive: false,
                  className: "shadow-md",
                })
              : listingPriceEditPhases.cardRing
                ? "rounded-[var(--radius-card)] border border-info/30 bg-surface shadow-card ai-card-edit-highlight"
                : selectableCardClassName({ interactive: true }),
        batchLinkDrive?.doneFlash ? "batch-link-done-flash" : null,
        trayOpen &&
          !focused &&
          !listingPriceEditPhases.cardRing &&
          !batchLinking &&
          !batchQueued
          ? "ring-1 ring-ring/25"
          : null
      )}
    >
      {/* Three-column body — fixed center rail keeps dividers aligned across cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_9.5rem_minmax(0,1fr)] md:items-stretch md:gap-0">
        {/* A. Shopify */}
        <div className="min-w-0 md:pr-4">
          <div className="mb-1 flex w-full items-center justify-between gap-2">
            <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("shopProducts.shopifyProduct")}
            </p>
            <span
              className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
              title={item.thirdPlatformItemId}
            >
              ID {shortProductId(item.thirdPlatformItemId)}
            </span>
          </div>
          <div className="flex min-w-0 gap-3">
            <button
              type="button"
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-surface-border bg-muted sm:h-[4.5rem] sm:w-[4.5rem]",
                hasImage && "cursor-zoom-in"
              )}
              disabled={!hasImage}
              aria-label={hasImage ? t("shopProducts.zoomProductImage") : undefined}
              onClick={(e) =>
                openImageZoom(
                  e,
                  item.primaryImageUrl,
                  item.title ?? t("shopProducts.shopifyProduct")
                )
              }
            >
              {hasImage ? (
                <ThumbImage
                  src={item.primaryImageUrl!}
                  alt={item.title ?? ""}
                  fill
                  sizes="72px"
                  pixelWidth={144}
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                  {t("shopProducts.noImage")}
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <EditedFieldValue
                edit={titleEdit}
                phases={titleEditPhases}
                className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900"
              >
                <span>{displayTitle}</span>
              </EditedFieldValue>
              <EditedFieldValue
                edit={listingPriceEdit}
                phases={listingPriceEditPhases}
                className="text-sm font-semibold text-slate-800"
              >
                <span className="tabular-nums transition-opacity duration-300">
                  {listingPriceLabel}
                </span>
              </EditedFieldValue>
            </div>
          </div>
        </div>

        {/* B. AI Match */}
        <div className="flex w-full min-w-0 flex-col items-center justify-center rounded-lg bg-brand-soft/40 border-y border-brand-accent/10 py-2 md:border-x md:border-y-0 md:px-3 md:py-0">
          {cardState === "unbound" && !current ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {t("shopProducts.aiMatch")}
              </p>
              <p className="mt-1 text-center text-xs font-semibold text-slate-600">
                {t("shopProducts.noReliableMatch")}
              </p>
              <p className="mt-1 max-w-[9rem] text-center text-[10px] leading-4 text-slate-400">
                {t("shopProducts.suggestImageSearch")}
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "text-[10px] font-medium uppercase tracking-wide",
                  linkAnimating ? "text-sky-600/80" : cardState === "matched" ? "text-emerald-700/90" : cardState === "pending" ? "text-amber-700/90" : "text-slate-500"
                )}
              >
                {t("shopProducts.aiMatch")}
              </p>
              <MoveRight
                className={cn(
                  "my-1 h-5 w-5",
                  linkAnimating
                    ? "text-sky-500"
                    : cardState === "pending"
                      ? "text-amber-500"
                      : cardState === "matched"
                        ? "text-emerald-600"
                        : current
                          ? "text-sky-600"
                          : "text-slate-400"
                )}
              />
              <p
                className={cn(
                  "text-center text-xs font-bold",
                  linkAnimating
                    ? "text-sky-700"
                    : cardState === "pending"
                      ? "text-amber-700"
                      : cardState === "matched"
                        ? "text-emerald-800"
                        : current
                          ? "text-sky-700"
                          : "text-slate-700"
                )}
              >
                {matchHeadline}
              </p>
              <div className="mt-1.5 flex w-full flex-wrap justify-center gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag.label}
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      tag.tone === "ok"
                        ? "bg-emerald-50 text-emerald-700"
                        : tag.tone === "warn"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* C. Source */}
        <div className="min-w-0 md:pl-4">
          {boundLoading ? (
            <>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {t("shopProducts.recommendedSource")}
              </p>
              <div className="flex min-w-0 gap-3">
                <div className="flex flex-1 items-center gap-2 text-[11px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("shopProducts.loadingSource")}
                </div>
              </div>
            </>
          ) : reco ? (
            <>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {t("shopProducts.recommendedSource")}
              </p>
              <div className="flex min-w-0 gap-3">
                <button
                  type="button"
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-surface-border bg-muted sm:h-[4.5rem] sm:w-[4.5rem]",
                    reco.image && "cursor-zoom-in"
                  )}
                  disabled={!reco.image}
                  aria-label={reco.image ? t("shopProducts.zoomSourceImage") : undefined}
                  onClick={(e) =>
                    openImageZoom(
                      e,
                      reco.image,
                      reco.title ?? t("shopProducts.recommendedSource")
                    )
                  }
                >
                  {reco.image ? (
                    <ThumbImage
                      src={reco.image}
                      alt={reco.title ?? ""}
                      fill
                      sizes="72px"
                      pixelWidth={144}
                      className="object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                      {t("shopProducts.noImage")}
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                    {reco.title && !/^货源\s/.test(reco.title)
                      ? reco.title
                      : reco.title ?? t("shopProducts.sourceTitlePending")}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-800">
                    <span>{reco.priceText}</span>
                    {profit ? (
                      <EditedProfitLine
                        inline
                        label={t("shopProducts.profitPerOrder")}
                        previous={previousProfit}
                        next={profit}
                        phases={listingPriceEditPhases}
                      />
                    ) : recoInventory ? (
                      <span className="text-[11px] font-normal text-slate-500">
                        {t("shopProducts.stock", { count: recoInventory })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : linkAnimating && batchLinkDrive?.state === "searching" ? (
            <div className="batch-link-searching flex flex-1 flex-col justify-center rounded-lg border border-dashed border-sky-200 bg-sky-50/50 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-sky-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("shopProducts.aiImageSearching")}
              </div>
              <div className="batch-link-shimmer mt-2 h-1 w-full rounded-full bg-sky-100" />
            </div>
          ) : linkAnimating &&
            (batchLinkDrive?.state === "binding" ||
              batchLinkDrive?.state === "auto_selecting") ? (
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-sky-200 bg-sky-50/50 px-3 py-2 text-[11px] text-sky-800">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("shopProducts.establishingLink")}
            </div>
          ) : fromPublish ? (
            <div className="flex flex-1 items-center rounded-lg border border-dashed border-brand-accent/25 bg-brand-soft/50 px-3 py-2 text-[11px] leading-relaxed text-brand-accent">
              {t("shopProducts.publishNoSearchHint")}
            </div>
          ) : (
            <div className="flex flex-1 items-center rounded-lg border border-dashed border-surface-border px-3 py-2 text-[11px] text-muted-foreground">
              {batchLinkDrive?.state === "failed" &&
              batchLinkDrive.errorMessage &&
              !boundOfferId &&
              !bindConfirmed
                ? batchLinkDrive.errorMessage
                : hasImage
                  ? t("shopProducts.clickFindCandidates")
                  : t("shopProducts.noImageNoSearch")}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions — secondary links + primary on the right */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-surface-border pt-3">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              headerBadge.variant === "matched"
                ? "bg-emerald-50 text-emerald-700"
                : headerBadge.variant === "pending"
                  ? "bg-amber-50 text-amber-700"
                  : headerBadge.variant === "linking"
                    ? "bg-sky-50 text-sky-700"
                    : headerBadge.variant === "selected"
                      ? "bg-sky-50 text-sky-700"
                      : "bg-slate-100 text-slate-600"
            )}
          >
            {headerBadge.variant === "matched" ? (
              <Check className="h-3 w-3" />
            ) : headerBadge.variant === "pending" ? (
              <Clock className="h-3 w-3" />
            ) : headerBadge.variant === "linking" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : null}
            {headerBadge.label}
          </span>
          {catalogIngesting && (boundOfferId || bindPending) ? (
            <CatalogIngestingBadge />
          ) : null}
          {confidenceTierText &&
          (cardState === "unbound" ||
            cardState === "pending" ||
            batchLinkDrive?.state === "needs_review") ? (
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                displayConfidenceTier === "high"
                  ? "bg-emerald-50 text-emerald-700"
                  : displayConfidenceTier === "medium"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-600"
              )}
            >
              {confidenceTierText}
            </span>
          ) : null}
          {isNewArrival && cardState === "unbound" && !fromPublish ? (
            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              {t("shopProducts.newArrival")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px]">
          <button
            type="button"
            className="font-medium text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            {t("shopProducts.editProduct")}
          </button>
          {detailUrl ? (
            <>
              <span className="text-surface-border">|</span>
              <a
                href={detailUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                {t("shopProducts.sourceDetail")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : null}
          {cardState !== "unbound" || current ? (
            !fromPublish ? (
            <>
              <span className="text-surface-border">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={searching || !hasImage}
                title={
                  !hasImage
                    ? t("shopProducts.noImageNoSearch")
                    : result && result.items.length > 0
                      ? t("shopProducts.expandLastSearch")
                      : t("shopProducts.imageSearchMatch")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  void openOrRunSearch(false);
                }}
              >
                {searching ? t("shopProducts.searching") : t("shopProducts.rematch")}
              </button>
              <span className="text-surface-border">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={cardActionsLocked || !isMallGatewayConfigured()}
                title={
                  !isMallGatewayConfigured()
                    ? t("shopProducts.mallUnavailable")
                    : t("shopProducts.manualMatchHint")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setManualDrawerOpen(true);
                }}
              >
                {t("shopProducts.manualMatch")}
              </button>
            </>
            ) : null
          ) : (
            !fromPublish ? (
            <>
              <span className="text-surface-border">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={cardActionsLocked || !isMallGatewayConfigured()}
                title={
                  !isMallGatewayConfigured()
                    ? t("shopProducts.mallUnavailable")
                    : t("shopProducts.manualMatchHint")
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setManualDrawerOpen(true);
                }}
              >
                {t("shopProducts.manualMatch")}
              </button>
            </>
            ) : null
          )}
          {boundOfferId ? (
            <>
              {cardState === "pending" ? (
                <>
                  <span className="text-surface-border">|</span>
                  <button
                    type="button"
                    className="font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                    disabled={rejecting || acking}
                    onClick={(e) => {
                      e.stopPropagation();
                      void rejectBinding();
                    }}
                  >
                    {rejecting ? t("shopProducts.rejecting") : t("shopProducts.reject")}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-surface-border">|</span>
                  <button
                    type="button"
                    className="font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                    disabled={unbinding || acking}
                    onClick={(e) => {
                      e.stopPropagation();
                      void unbindBinding();
                    }}
                  >
                    {t("shopProducts.cancelLink")}
                  </button>
                </>
              )}
            </>
          ) : null}
        </div>
        {primaryLabel ? (
          <Button
            size="sm"
            className="h-8 min-w-[4.5rem]"
            disabled={
              cardActionsLocked ||
              searching ||
              autoAcking ||
              (cardState === "unbound" && !hasImage && !current) ||
              confirmingId != null ||
              acking ||
              rejecting
            }
            onClick={(e) => {
              e.stopPropagation();
              onPrimary();
            }}
          >
            {(confirmingId || acking || searching) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            {confirmingId ? t("shopProducts.processing") : primaryLabel}
          </Button>
        ) : null}
      </div>

      {confirmError ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {confirmError}
        </div>
      ) : null}
      {searchError ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span>{searchError}</span>
          {hasImage ? (
            <button
              type="button"
              className="shrink-0 font-medium underline underline-offset-2"
              onClick={(e) => {
                e.stopPropagation();
                void runSearch();
              }}
            >
              {t("shopProducts.retry")}
            </button>
          ) : null}
        </div>
      ) : null}

      {showBatchQueueFeedback ? (
        <div
          className={cn(
            "mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed",
            batchLinkDrive?.state === "failed"
              ? "border-red-200 bg-red-50 text-red-800"
              : batchLinkDrive?.state === "needs_review"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : batchLinkDrive?.state === "done"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-sky-200 bg-sky-50 text-sky-800"
          )}
        >
          {batchQueueLine}
        </div>
      ) : null}

      {supplierConfirm ? (
        <SourceSupplierConfirmCard
          className="mt-2"
          candidate={supplierConfirm.candidate}
          confidence={supplierConfirm.confidence}
          confirming={confirmingId === supplierConfirm.candidate.productId}
          onCancel={() => setSupplierConfirm(null)}
          onConfirm={() => void executeBinding(supplierConfirm.candidate, { allowPoolIngest: true })}
        />
      ) : null}

      {/* Candidate tray */}
      {trayOpen || searching ? (
        <div className="mt-3 rounded-lg border border-surface-border bg-muted/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-block h-7 w-7 shrink-0"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-center text-[12px] font-semibold text-slate-800">
              {searching
                ? searchPhase ?? t("shopProducts.searching")
                : candidates && candidates.length > 0
                  ? t("shopProducts.candidateCount", { count: candidates.length })
                  : result
                    ? t("shopProducts.noCandidates")
                    : t("shopProducts.imageSearchCandidates")}
            </p>
            {trayOpen && !searching ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-surface-border bg-surface text-muted-foreground hover:bg-surface-hover disabled:opacity-50"
                  disabled={!hasImage}
                  title={t("shopProducts.refreshImageSearch")}
                  aria-label={t("shopProducts.refreshImageSearch")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void runSearch();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-surface-border bg-surface text-muted-foreground hover:bg-surface-hover"
                  title={t("shopProducts.collapseCandidates")}
                  aria-label={t("shopProducts.collapseCandidates")}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTrayOpen(false);
                  }}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="inline-block h-7 w-[3.75rem] shrink-0" aria-hidden />
            )}
          </div>

          {!searching && searchRecoveryHints.length > 0 ? (
            <div className="mt-2.5 rounded-md border border-amber-200/80 bg-amber-50/60 px-2.5 py-2">
              <p className="text-[11px] font-medium text-amber-950">{t("shopProducts.imageSearchHints")}</p>
              <ul className="mt-1 space-y-0.5 text-[10px] leading-relaxed text-amber-900/85">
                {searchRecoveryHints.map((hint) => (
                  <li key={hint}>· {hint}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {candidates && candidates.length > 0 ? (
            <div className="mt-2.5 flex items-stretch gap-2 overflow-x-auto pb-1">
              {candidates.map((c, idx) => {
                const signals = candidateSignals(t, c);
                const titleScore = resolveCandidateTitleScore(c, matchScores);
                const imageScore = resolveCandidateImageScore(c, imageScores);
                const imageBlockedHint = imageGateBlockedHint(t, imageScore);
                const isCurrent = idx === currentIdx;
                const isTop = idx === recommendedIdx;
                const isBoundCand =
                  boundOfferId != null && boundOfferId === c.productId;
                const costCny = parseGatewayPrice(c.price);
                const purchaseCtx = resolvePurchaseCostDisplayContext(
                  shopCurrency,
                  pricingTemplate
                );
                const costTarget = costInPurchaseDisplayCurrency(costCny, purchaseCtx);
                const costLabel =
                  costTarget != null
                    ? t("shopProducts.purchaseCost", {
                        price: formatPurchaseCostMoney(costTarget, purchaseCtx.currency),
                      })
                    : t("shopProducts.purchaseCost", { price: formatCny(c.price) });
                const inlineReason = trayInlineReasons[c.productId];
                const isBatchSelectTarget =
                  isTop &&
                  batchLinkDrive?.selectButtonPhase != null &&
                  batchLinkDrive.selectButtonPhase !== "idle";
                return (
                  <div
                    key={`${c.productId}-${idx}`}
                    ref={isTop ? topCandidateRef : undefined}
                    aria-selected={isCurrent}
                    className={cn(
                      "relative flex w-[11rem] shrink-0 cursor-pointer flex-col p-2 transition-colors",
                      selectableCardClassName({
                        selected: isCurrent,
                        className: cn(
                          isBoundCand && !isCurrent && "border-warning/40 bg-warning-soft/20",
                          isTop && !isCurrent && !isBoundCand && "border-brand-accent/40"
                        ),
                      }),
                      batchLinkDrive?.highlightTopCandidate &&
                        isTop &&
                        ["candidates_ready", "auto_selecting", "binding", "needs_review"].includes(
                          batchLinkDrive.state
                        )
                        ? "batch-link-candidate-flash"
                        : null
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIdx(idx);
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "relative h-[4.5rem] w-full shrink-0 overflow-hidden rounded-md border border-surface-border bg-muted",
                        c.imageUrl && "cursor-zoom-in"
                      )}
                      disabled={!c.imageUrl}
                      aria-label={c.imageUrl ? t("shopProducts.zoomSourceImage") : undefined}
                      onClick={(e) =>
                        openImageZoom(
                          e,
                          c.imageUrl,
                          resolveImageSearchDisplayTitle(c, locale) || c.productId
                        )
                      }
                    >
                      {c.imageUrl ? (
                        <ThumbImage
                          src={c.imageUrl}
                          alt={
                            resolveImageSearchDisplayTitle(c, locale) ||
                            c.productId
                          }
                          fill
                          sizes="180px"
                          pixelWidth={360}
                          className="object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div className="absolute left-1 top-1 flex max-w-[calc(100%-0.5rem)] flex-col gap-0.5">
                        {isBoundCand ? (
                          <span className="w-fit rounded bg-amber-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            {bindPending ? t("shopProducts.boundPending") : t("shopProducts.boundLinked")}
                          </span>
                        ) : isTop ? (
                          <span className="w-fit rounded bg-brand-accent px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            {t("shopProducts.topPick")}
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[11px] leading-4 text-foreground">
                      {resolveImageSearchDisplayTitle(c, locale) ||
                        t("shopProducts.noTitle")}
                    </p>
                    <p className="mt-1 shrink-0 text-[11px] font-semibold text-foreground">
                      {costLabel}
                    </p>
                    {inlineReason ? (
                      <p className="mt-1 line-clamp-2 text-[10px] leading-3.5 text-muted-foreground">
                        {inlineReason}
                      </p>
                    ) : null}
                    <div className="mt-1 flex min-h-[1.25rem] flex-wrap content-start gap-1">
                      {formatTitleMatchLabel(t, titleScore) ? (
                        <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-[10px] text-info">
                          {formatTitleMatchLabel(t, titleScore)}
                        </span>
                      ) : null}
                      {formatImageMatchLabel(t, imageScore) ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px]",
                            imageBlockedHint
                              ? "bg-warning-soft text-warning"
                              : "bg-success-soft text-success"
                          )}
                        >
                          {formatImageMatchLabel(t, imageScore)}
                        </span>
                      ) : imageBlockedHint ? (
                        <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning">
                          {imageBlockedHint}
                        </span>
                      ) : null}
                      {signals.slice(0, 1).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex justify-end pt-1.5">
                      {isBoundCand ? (
                        <Button
                          size="sm"
                          className="h-6 min-w-[3rem] px-2.5 text-[10px] shadow-sm"
                          disabled
                        >
                          {t("shopProducts.selected")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className={cn(
                            "h-6 min-w-[3rem] px-2.5 text-[10px] shadow-sm transition-transform",
                            isBatchSelectTarget &&
                              batchLinkDrive?.selectButtonPhase === "pressed" &&
                              "batch-link-select-pressed",
                            isBatchSelectTarget &&
                              batchLinkDrive?.selectButtonPhase === "loading" &&
                              "pointer-events-none opacity-80"
                          )}
                          disabled={
                            cardActionsLocked ||
                            confirmingId === c.productId ||
                            batchLinkDrive?.selectButtonPhase === "loading"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentIdx(idx);
                            void confirmMatch(c);
                          }}
                        >
                          {confirmingId === c.productId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : isBatchSelectTarget &&
                            batchLinkDrive?.selectButtonPhase === "loading" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            t("shopProducts.choose")
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <ManualMatchDrawer
        open={manualDrawerOpen}
        shopName={shopName}
        thirdPlatformItemId={item.thirdPlatformItemId}
        onClose={() => setManualDrawerOpen(false)}
        onBound={handleManualBound}
        showToast={showToast}
      />

      {zoomImage ? (
        <ImageZoomOverlay
          src={zoomImage.src}
          alt={zoomImage.alt}
          onClose={() => setZoomImage(null)}
        />
      ) : null}
    </article>
  );
}
