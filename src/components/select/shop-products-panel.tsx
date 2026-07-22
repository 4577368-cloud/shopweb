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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  OfferDetail,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import { cn } from "@/lib/utils";
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
import { isManualImageBinding } from "@/lib/manual-image-match";
import { fetchItemDetail, isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import { runImageSearchPipeline } from "@/lib/batch-link/image-search-pipeline";
import { sortProductsForBatchLink } from "@/lib/batch-link/sort-products";
import type { BatchLinkCardDrive, BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import { INITIAL_BATCH_LINK_PROGRESS } from "@/lib/batch-link/types";
import {
  loadVariantReadyIds,
  preflightBatchLinkScope,
} from "@/lib/batch-link/preflight";
import { confirmCandidateBinding } from "@/lib/batch-link/confirm-binding";
import {
  candidateStorageKey,
  formatImageMatchLabel,
  formatTitleMatchLabel,
  imageGateBlockedHint,
  passesImageRecommendGate,
} from "@/lib/batch-link/image-match";
import {
  filterLinkableProducts,
  SHOP_PRODUCTS_PAGE_SIZE,
} from "@/lib/batch-link/scope";
import {
  resolveBoundSourceDisplayTitle,
  snapTitleNeedsItemGetFallback,
} from "@/lib/batch-link/source-display-title";
import { backfillProductSourceIdentity } from "@/lib/logistics/resolve-estimate-goods-id";
import {
  mergeIdentityIntoBinding,
  mergeStoredIdentityIntoBinding,
} from "@/lib/product-source-identity";
import { useBatchLinkQueue } from "@/hooks/use-batch-link-queue";

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
  cardState: "matched" | "pending" | "unbound",
  hasCurrent: boolean,
  titleScore: number | null,
  imageScore: number | null
): string {
  if (cardState === "unbound" && !hasCurrent) return "未找到可靠匹配";
  if (cardState === "pending") {
    if (titleScore != null && imageScore != null) {
      return `待确认 · 标题 ${titleScore}% · 图像 ${imageScore}%`;
    }
    if (titleScore != null) return `待确认 · 标题 ${titleScore}%`;
    return "待确认";
  }
  if (titleScore != null && imageScore != null) {
    return `标题 ${titleScore}% · 图像 ${imageScore}%`;
  }
  if (titleScore != null) return `标题 ${titleScore}%`;
  return "已自动匹配";
}

/**
 * Map backend image-search errors to a readable, category-specific message.
 * The backend prefixes CustomException messages with a machine code so we can
 * differentiate: AK 未配置/无效、商品无主图、镜像缺失、网关繁忙/限流。
 */
function imageSearchError(err: unknown): string {
  let raw = "";
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    raw = body?.message ?? err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  }
  if (raw.startsWith("AOP_CRED_MISSING") || raw.startsWith("AK_MISSING")) {
    return "Tangbuy 货源平台凭证未配置或无效，请配置后重试";
  }
  if (raw.startsWith("AOP_TOKEN_INVALID")) {
    return "Tangbuy 货源授权已失效或过期，请重新授权后重试";
  }
  if (raw.startsWith("IMAGE_UNREADABLE")) {
    return "商品主图无法读取或上传，请更换主图后重试";
  }
  if (raw.startsWith("NO_PRIMARY_IMAGE")) {
    return "该商品无主图，无法进行 Tangbuy 图搜";
  }
  if (raw.startsWith("PRODUCT_NOT_FOUND")) {
    return "未找到该商品镜像，请先同步商品";
  }
  if (raw.startsWith("GATEWAY_BUSY")) {
    return "Tangbuy 货源网关繁忙或限流，请稍后重试";
  }
  return raw || "图搜失败";
}

/** Map backend confirm (A3-2b) errors to a readable message by machine-code prefix. */
function imageMatchError(err: unknown): string {
  let raw = "";
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    const body = err.body as { message?: string } | undefined;
    raw = body?.message ?? err.message;
  } else if (err instanceof Error) {
    raw = err.message;
  }
  if (raw.startsWith("PRODUCT_NOT_FOUND")) {
    return "未找到该商品镜像，请先同步商品";
  }
  if (raw.startsWith("NO_VARIANT")) {
    return "该商品无可用变体（SKU），请重新同步商品后再匹配";
  }
  return raw || "确认匹配失败";
}

function formatSimilarity(score?: number | null): string | null {
  if (score == null || Number.isNaN(score) || score <= 0) return null;
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return `${Math.round(Math.min(score, 100))}%`;
}

/** 月销 label (official imageQuery signal replacing similarity); null when absent/zero. */
function formatSold(n?: number | null): string | null {
  if (n == null || Number.isNaN(n) || n <= 0) return null;
  if (n >= 10000) return `月销 ${(n / 10000).toFixed(1)}万`;
  return `月销 ${n}`;
}

/** Short confidence signals for a candidate: 月销 + 复购率 (A3-3b replacement for similarity). */
function candidateSignals(c: ImageSearchProduct): string[] {
  const out: string[] = [];
  const sold = formatSold(c.soldCount);
  if (sold) out.push(sold);
  const rate = (c.repurchaseRate ?? "").trim();
  if (rate) out.push(`复购 ${rate}`);
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
  costCny: number | null,
  shopCurrency: string | null | undefined,
  fallbackRaw?: string | null,
  pricingTemplate?: PricingTemplate | null
): string {
  const ctx = resolvePurchaseCostDisplayContext(shopCurrency, pricingTemplate);
  const inTarget = costInPurchaseDisplayCurrency(costCny, ctx);
  if (inTarget != null) {
    return `采购价 ${formatPurchaseCostMoney(inTarget, ctx.currency)}`;
  }
  if (fallbackRaw) return `采购价 ${formatCny(fallbackRaw)}`;
  if (costCny != null) return `采购价 ¥${costCny}`;
  return "采购价待取";
}

function fmtMoney(n: number, currency?: string): string {
  const v = n.toFixed(2);
  return currency ? `${v} ${currency}` : v;
}

/** Translate the technical match provenance into operator-friendly reasons (≤4 short items). */
function matchReasons(opts: {
  imageSource?: string | null;
  querySource?: string | null;
  appliedQuery?: string | null;
  matchScore?: number | null;
  signals?: string[];
}): string[] {
  const out: string[] = [];
  if (opts.imageSource === "ORIGINAL") out.push("按货源原图发起图搜");
  else if (opts.imageSource === "SHOPIFY") out.push("已用店铺主图图搜");
  else out.push("图搜命中");
  const q = (opts.appliedQuery ?? "").trim();
  if (opts.querySource === "TITLE" && q) out.push(`标题校准「${q}」`);
  else if (opts.querySource === "LLM" && q) out.push(`AI 识图校准「${q}」`);
  if (opts.matchScore != null && opts.matchScore > 0) {
    out.push(`标题综合分 ${formatSimilarity(opts.matchScore)}`);
  }
  for (const s of opts.signals ?? []) out.push(s);
  return out.slice(0, 4);
}

/** Short evidence pills for the Match column — real fields only. */
function evidenceTags(opts: {
  unbound?: boolean;
  pending?: boolean;
  imageSource?: string | null;
  querySource?: string | null;
  matchScore?: number | null;
  signals?: string[];
  marginPct?: number | null;
}): { label: string; tone: "ok" | "warn" | "neutral" }[] {
  if (opts.unbound) {
    return [
      { label: "建议图搜", tone: "neutral" },
      { label: "可放宽条件", tone: "neutral" },
    ];
  }
  const tags: { label: string; tone: "ok" | "warn" | "neutral" }[] = [];
  if (opts.imageSource === "ORIGINAL" || opts.imageSource === "SHOPIFY") {
    tags.push({ label: "已用店铺图搜", tone: "ok" });
  } else if (!opts.unbound) {
    tags.push({ label: "图搜命中", tone: "ok" });
  }
  if (opts.querySource === "TITLE" || opts.querySource === "LLM") {
    tags.push({ label: "标题/识图校准", tone: "ok" });
  }
  if (opts.pending) {
    tags.push({ label: "规格待确认", tone: "warn" });
  }
  if (opts.marginPct != null && opts.marginPct >= 15) {
    tags.push({ label: "成本更优", tone: "ok" });
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
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchAcking, setBatchAcking] = useState(false);
  const [products, setProducts] = useState<ShopMirrorProduct[]>([]);
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
  const [bindings, setBindings] = useState<Record<string, ImageBindingView>>({});
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (opts?: { silent?: boolean }): Promise<ShopMirrorProduct[] | null> => {
    const silent = opts?.silent ?? false;
    if (!silent) {
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
      setBindings(map);
      onShopProductsChange?.(items, map);

      void (async () => {
        const productById = new Map(
          items.map((p) => [p.thirdPlatformItemId, p] as const)
        );
        const updates: Record<string, ImageBindingView> = {};
        for (const [itemId, binding] of Object.entries(map)) {
          if (!binding.bound || !binding.tangbuyProductId) continue;
          if (binding.sourceIdentity?.internalGoodsId?.trim()) continue;
          const product = productById.get(itemId);
          const identity = await backfillProductSourceIdentity({
            shopName,
            thirdPlatformItemId: itemId,
            tangbuyProductId: binding.tangbuyProductId,
            tangbuySkuId: binding.tangbuySkuId,
            detailUrl: binding.detailUrl,
            titleHint: product?.title ?? binding.offerTitle,
          });
          if (identity) {
            updates[itemId] = mergeIdentityIntoBinding(binding, identity);
          }
        }
        if (Object.keys(updates).length > 0) {
          setBindings((prev) => ({ ...prev, ...updates }));
        }
      })();
      return items;
    } catch (err) {
      if (!silent) setError(readableError(err));
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [shopName, onShopProductsChange]);

  const batchLinkBusyRef = useRef(false);
  const batchWasActiveRef = useRef(false);

  const handleBound = useCallback(
    (itemId: string, view: ImageBindingView) => {
      setBindings((prev) => ({ ...prev, [itemId]: view }));
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

  const { progress: batchLinkProgress, start: startBatchLink, isRunning: batchLinkRunning } =
    useBatchLinkQueue({
      shopName,
      onBound: handleBound,
      onScrollToProduct: scrollToBatchLinkProduct,
    });

  useEffect(() => {
    const busy = batchLinkProgress.active || batchLinkRunning;
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

      if (scope.length === 0) {
        if (source !== "auto") showToast("当前页暂无可关联商品");
        onBatchLinkFinished?.({ ...INITIAL_BATCH_LINK_PROGRESS, source, done: true });
        return;
      }

      const variantReady = await loadVariantReadyIds(
        shopName,
        scope.map((p) => p.thirdPlatformItemId)
      );
      const preflight = preflightBatchLinkScope(scope, pendingSet, variantReady);

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
            ? "主图尚未就绪，请稍后再试"
            : "暂无可关联商品"
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
        showToast(`开始为当前页 ${preflight.readyProducts.length} 个商品逐个图搜关联…`);
      }

      void startBatchLink(preflight.readyProducts, {
        source,
        deferredIds: preflight.deferredIds,
      });
    },
    [
      batchLinkRunning,
      onBatchLinkFinished,
      pendingNewAnalysisIds,
      setFilter,
      shopName,
      showToast,
      startBatchLink,
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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signal edge only
  }, [mirrorRefreshSignal]);

  // null = unbound; "pending" = AI 待确认; "confirmed" = 已确认 (legacy rows without status = confirmed).
  const stateOf = useCallback(
    (p: ShopMirrorProduct): "pending" | "confirmed" | null => {
      const b = bindings[p.thirdPlatformItemId];
      if (!b?.bound) return null;
      return b.bindStatus === "PENDING" ? "pending" : "confirmed";
    },
    [bindings]
  );

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
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when awareness ids change
  }, [pendingNewAnalysisKey]);

  const newArrivalsAwaitingList =
    filter === "new_arrivals" &&
    (pendingNewAnalysisIds?.size ?? 0) > 0 &&
    products.filter((p) => pendingNewAnalysisIds?.has(p.thirdPlatformItemId)).length === 0;

  const handleBatchAck = async () => {
    if (batchAcking) return;
    const pendingIds = products
      .filter((p) => stateOf(p) === "pending")
      .map((p) => p.thirdPlatformItemId);
    if (pendingIds.length === 0) {
      showToast("暂无待确认商品");
      return;
    }
    setBatchAcking(true);
    try {
      const result = await api.batchAckImageBindings(shopName, pendingIds);
      for (const id of pendingIds) {
        if (!result.failed.includes(id)) {
          setBindings((b) => {
            const prev = b[id];
            if (!prev?.bound) return b;
            return { ...b, [id]: { ...prev, bindStatus: "ACTIVE" as const } };
          });
        }
      }
      onActivity?.();
      showToast(
        result.failed.length > 0
          ? `已确认 ${result.ok} 个，失败 ${result.failed.length} 个`
          : `已批量确认 ${result.ok} 个待关联`
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
    () => filterLinkableProducts(paginatedProducts, bindings),
    [paginatedProducts, bindings]
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
    const all = buildShopProductMinis(products, bindings);
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
            { id: "all", label: "全部", count: counts.all },
            { id: "pending", label: "待确认", count: counts.pending },
            { id: "confirmed", label: "已确认", count: counts.confirmed },
            { id: "unbound", label: "未关联", count: counts.unbound },
          ]}
          value={filter}
          onValueChange={(id) => {
            setFilter(id as ShopFilter);
          }}
          highlighted={highlighted}
        />
        <div className="flex items-center gap-2">
          {counts.pending > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleBatchAck()}
              disabled={batchAcking || linkingLocked}
            >
              {batchAcking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {batchAcking ? "确认中…" : `批量确认 (${counts.pending})`}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <Card className="mb-3 border-red-200">
          <CardContent className="flex items-center justify-between gap-3 py-3 text-sm text-red-700">
            <span>加载失败：{error}</span>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              重试
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading || newArrivalsAwaitingList ? (
        <Card>
          <TableSkeleton rows={newArrivalsAwaitingList ? 3 : 5} />
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          title="暂无在售商品"
          description="尚未同步到店铺商品，或店铺当前无商品。点击上方刷新图标从 Shopify 拉取并分析。"
        />
      ) : displayProducts.length === 0 ? (
        <EmptyState
          title={filter === "new_arrivals" ? "暂无新入库商品" : "该筛选下暂无商品"}
          description={
            filter === "new_arrivals"
              ? "新商品同步后会出现于此；也可点击上方刷新图标重新拉取。"
              : "切换到「全部」查看所有在售商品。"
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
              batchLinkDrive={batchLinkProgress.cardStates[p.thirdPlatformItemId]}
              linkingLocked={linkingLocked}
            />
          ))}
        </div>
      )}

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
            title="上一页"
            aria-label="上一页"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[5.5rem] text-center text-xs text-ink-subtle tabular-nums">
            第 {page} / {totalPages} 页
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="h-8"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || linkingLocked}
            title="下一页"
            aria-label="下一页"
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
          void load();
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
}) {
  const { showToast } = useOnboarding();
  const listingPriceEditPhases = useAiFieldEditPhases(listingPriceEdit);
  const titleEditPhases = useAiFieldEditPhases(titleEdit, onTitleEditConsumed);
  const listingPriceLabel = resolveListingPriceDisplay(item, listingPriceEdit);
  const displayTitle = titleEdit?.nextDisplay ?? item.title ?? "(无标题)";
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
        "needs_review",
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
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);

  const boundOfferId =
    binding?.bound && binding.tangbuyProductId ? binding.tangbuyProductId : null;
  // AI 待确认 (PENDING) vs 已确认 (ACTIVE). Legacy rows without a status are treated as confirmed.
  const bindPending = Boolean(binding?.bound) && binding?.bindStatus === "PENDING";

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
  const fromPublish = Boolean(binding?.bound) && binding?.bindSource === "FROM_PUBLISH";
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
    if (!boundOfferId) {
      setOffer(null);
      return;
    }
    if (hasSnapshot) {
      setOffer(null);
      setOfferLoading(false);
      return;
    }
    let cancelled = false;
    // Legacy bindings without snapshot: lazy-fetch offer detail for 货源图/价 fallback.
    setOfferLoading(true);
    api
      .getOfferDetail(boundOfferId)
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
  }, [boundOfferId, hasSnapshot]);

  const runSearchWithPhases = async () => {
    if (searching) return;
    setSearching(true);
    setSearchError(null);
    setTrayOpen(true);
    const phases = ["正在分析图片…", "正在匹配类目与规格…", "正在比对成本与销复购…"];
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
        5
      );
      if (pipeline.error || !pipeline.result) {
        setResult(null);
        setMatchScores({});
        setImageScores({});
        setSearchError(pipeline.error ?? imageSearchError(new Error("图搜失败")));
        return;
      }
      setMatchScores(pipeline.matchScores);
      setImageScores(pipeline.imageScores);
      const ranked = pipeline.rankedItems;
      setRecommendedIdx(0);
      setResult(pipeline.result);
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

  const confirmMatch = async (candidate: ImageSearchProduct) => {
    if (confirmingId || !result) return;
    const wasRebind = Boolean(boundOfferId);
    setConfirmingId(candidate.productId);
    setConfirmError(null);
    showToast(wasRebind ? "正在改绑货源…" : "正在绑定货源…");
    try {
      const merged = await confirmCandidateBinding(shopName, item, candidate, result, {
        imageScores,
        titleScores: matchScores,
      });
      onBound(item.thirdPlatformItemId, merged);
      if (merged.offerTitle?.trim()) {
        setItemGetTitle(merged.offerTitle.trim());
      }
      setTrayOpen(false);
      showToast(wasRebind ? "已改绑货源" : "已绑定货源");
    } catch (err) {
      const msg = imageMatchError(err);
      setConfirmError(msg);
      showToast(msg);
    } finally {
      setConfirmingId(null);
    }
  };

  // "确认无误": promote the AI-suggested (PENDING) binding to confirmed (ACTIVE).
  const ackBinding = async () => {
    if (acking || !binding?.bound) return;
    setAcking(true);
    setConfirmError(null);
    try {
      await api.ackImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { ...binding, bindStatus: "ACTIVE" });
      showToast("已确认关联");
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setAcking(false);
    }
  };

  // "取消关联": soft-unbind; the card returns to the unmatched state (can re-search).
  const unbindBinding = async () => {
    if (unbinding || !binding?.bound) return;
    const ok = window.confirm("取消该商品的货源关联？取消后可重新查找货源。");
    if (!ok) return;
    setUnbinding(true);
    setConfirmError(null);
    try {
      await api.unbindImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { bound: false });
      setResult(null);
      setCurrentIdx(0);
      showToast("已取消关联");
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setUnbinding(false);
    }
  };

  // "驳回": unbind the AI suggestion and enqueue a single-item rematch.
  const rejectBinding = async () => {
    if (rejecting || !binding?.bound || !bindPending) return;
    const ok = window.confirm("驳回后将解除当前推荐并重新图搜匹配，确定？");
    if (!ok) return;
    setRejecting(true);
    setConfirmError(null);
    try {
      await api.unbindImageBinding(shopName, item.thirdPlatformItemId);
      onBound(item.thirdPlatformItemId, { bound: false });
      setResult(null);
      setCurrentIdx(0);
      await api.startMatchQueue(shopName, item.thirdPlatformItemId);
      showToast("已驳回，正在重新匹配");
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

  const candidateSummaries = useMemo((): CandidateSummary[] => {
    if (!candidates?.length) return [];
    return candidates.map((c, idx) => ({
      productId: c.productId,
      title: c.title ?? null,
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
  }, [candidates, matchScores, imageScores]);

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
    });
  }, [
    candidateSummaries,
    effectiveShopPrice,
    shopCurrency,
    candidates,
    recommendedIdx,
    current?.productId,
    boundOfferId,
    bindPending,
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
  const boundImage = snapImage ?? offerImage(offer);
  const boundCandidateTitle =
    candidates?.find((c) => c.productId === boundOfferId)?.title?.trim() ??
    null;
  const boundTitle = resolveBoundSourceDisplayTitle({
    snapTitle,
    itemGetTitle,
    offerSubjectTrans: offer?.subjectTrans,
    offerSubject: offer?.subject,
    candidateTitle: boundCandidateTitle,
  });
  const boundCostCny =
    itemGetCostCny ??
    parseGatewayPrice(snapPrice) ??
    parseGatewayPrice((offerPriceText(offer) ?? "").replace(/¥/g, ""));

  const formatOfferCost = (cny: number | null, fallbackRaw?: string | null) =>
    formatPurchaseCostLabel(cny, shopCurrency, fallbackRaw, pricingTemplate);

  const reco =
    rightMode === "candidate" && current
      ? {
          image: current.imageUrl ?? null,
          title: current.title || null,
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
    itemGetCostCny == null &&
    (itemGetCostLoading || (!hasSnapshot && offerLoading && !offer));

  const cardState: "matched" | "pending" | "unbound" = bindPending
    ? "pending"
    : boundOfferId
      ? "matched"
      : "unbound";

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
      return { label: "排队中", variant: "linking" as const };
    }
    if (batchLinking) {
      return { label: "关联中", variant: "linking" as const };
    }
    if (batchLinkDrive?.state === "needs_review") {
      return { label: "待确认", variant: "pending" as const };
    }
    if (bindPending) {
      return { label: "待确认", variant: "pending" as const };
    }
    if (boundOfferId) {
      return {
        label: fromPublish
          ? "商城上架关联"
          : fromManual
            ? "人工匹配"
            : "已自动匹配",
        variant: "matched" as const,
      };
    }
    if (current) {
      return { label: "已选货源", variant: "selected" as const };
    }
    return { label: "未匹配", variant: "unbound" as const };
  }, [batchLinkDrive?.state, batchLinking, batchQueued, bindPending, boundOfferId, fromPublish, fromManual, current]);

  const displayTitleScore = resolveCardMatchScore(
    binding ?? undefined,
    current,
    matchScores
  );
  const displayImageScore = current
    ? resolveCandidateImageScore(current, imageScores)
    : null;
  const matchHeadline = middleMatchHeadline(
    cardState,
    Boolean(current),
    displayTitleScore,
    displayImageScore
  );

  const tags = evidenceTags({
    unbound: cardState === "unbound" && !current,
    pending: cardState === "pending",
    imageSource:
      rightMode === "candidate" ? result?.imageSource : binding?.imageSource,
    querySource:
      rightMode === "candidate" ? result?.querySource : binding?.querySource,
    matchScore: displayTitleScore,
    signals:
      rightMode === "candidate" && current
        ? candidateSignals(current)
        : undefined,
    marginPct: null,
  });

  const recoInventory =
    rightMode === "candidate" && current?.inventory != null
      ? String(current.inventory).trim()
      : null;
  const detailUrl =
    (current?.detailUrl || binding?.detailUrl || null) ?? null;

  const primaryLabel =
    cardState === "unbound" && !current
      ? "查找候选"
      : current && !isBoundHere
        ? isRebind
          ? "改绑"
          : "确认"
        : cardState === "pending"
          ? "确认"
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
        "relative flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow",
        batchLinking
          ? "border-sky-400 shadow-md ring-2 ring-sky-200/70"
          : batchQueued
            ? "border-slate-300 ring-1 ring-slate-200"
            : focused
              ? "border-emerald-400 shadow-md ring-2 ring-emerald-200/60"
              : listingPriceEditPhases.cardRing
                ? "ai-card-edit-highlight border-sky-200"
                : "border-slate-200",
        batchLinkDrive?.doneFlash ? "batch-link-done-flash" : null,
        trayOpen &&
          !focused &&
          !listingPriceEditPhases.cardRing &&
          !batchLinking &&
          !batchQueued
          ? "ring-1 ring-slate-300"
          : null
      )}
    >
      {/* Three-column body — fixed center rail keeps dividers aligned across cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_9.5rem_minmax(0,1fr)] md:items-stretch md:gap-0">
        {/* A. Shopify */}
        <div className="min-w-0 md:pr-4">
          <div className="mb-1 flex w-full items-center justify-between gap-2">
            <p className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Shopify 商品
            </p>
            <span
              className="shrink-0 text-[10px] tabular-nums text-slate-400"
              title={item.thirdPlatformItemId}
            >
              ID {shortProductId(item.thirdPlatformItemId)}
            </span>
          </div>
          <div className="flex min-w-0 gap-3">
            <button
              type="button"
              className={cn(
                "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-[4.5rem] sm:w-[4.5rem]",
                hasImage && "cursor-zoom-in"
              )}
              disabled={!hasImage}
              aria-label={hasImage ? "放大商品主图" : undefined}
              onClick={(e) => openImageZoom(e, item.primaryImageUrl, item.title ?? "Shopify 商品")}
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
                  无图
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
        <div className="flex w-full min-w-0 flex-col items-center justify-center border-y border-slate-100 py-2 md:border-x md:border-y-0 md:px-3 md:py-0">
          {cardState === "unbound" && !current ? (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                AI Match
              </p>
              <p className="mt-1 text-center text-xs font-semibold text-slate-600">
                未找到可靠匹配
              </p>
              <p className="mt-1 max-w-[9rem] text-center text-[10px] leading-4 text-slate-400">
                建议使用图搜，或稍后重试
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600/80">
                AI Match
              </p>
              <MoveRight
                className={cn(
                  "my-1 h-5 w-5",
                  cardState === "pending" ? "text-amber-500" : "text-emerald-500"
                )}
              />
              <p
                className={cn(
                  "text-center text-xs font-bold",
                  cardState === "pending" ? "text-amber-700" : "text-emerald-700"
                )}
              >
                {matchHeadline}
              </p>
              <div className="mt-1.5 flex w-full flex-wrap justify-center gap-1">
                {tags.map((t) => (
                  <span
                    key={t.label}
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      t.tone === "ok"
                        ? "bg-emerald-50 text-emerald-700"
                        : t.tone === "warn"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {t.label}
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
                推荐货源
              </p>
              <div className="flex min-w-0 gap-3">
                <div className="flex flex-1 items-center gap-2 text-[11px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  载入货源…
                </div>
              </div>
            </>
          ) : reco ? (
            <>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                推荐货源
              </p>
              <div className="flex min-w-0 gap-3">
                <button
                  type="button"
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 sm:h-[4.5rem] sm:w-[4.5rem]",
                    reco.image && "cursor-zoom-in"
                  )}
                  disabled={!reco.image}
                  aria-label={reco.image ? "放大货源主图" : undefined}
                  onClick={(e) => openImageZoom(e, reco.image, reco.title ?? "推荐货源")}
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
                      无图
                    </div>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                    {reco.title && !/^货源\s/.test(reco.title)
                      ? reco.title
                      : reco.title ?? "货源标题待取"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-slate-800">
                    <span>{reco.priceText}</span>
                    {profit ? (
                      <EditedProfitLine
                        inline
                        label="每单获利 "
                        previous={previousProfit}
                        next={profit}
                        phases={listingPriceEditPhases}
                      />
                    ) : recoInventory ? (
                      <span className="text-[11px] font-normal text-slate-500">
                        库存 {recoInventory}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : batchLinkDrive?.state === "searching" ? (
            <div className="batch-link-searching flex flex-1 flex-col justify-center rounded-lg border border-dashed border-sky-200 bg-sky-50/50 px-3 py-3">
              <div className="flex items-center gap-2 text-[11px] font-medium text-sky-800">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                AI 图搜中
              </div>
              <div className="batch-link-shimmer mt-2 h-1 w-full rounded-full bg-sky-100" />
            </div>
          ) : (
            <div className="flex flex-1 items-center rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
              {batchLinkDrive?.state === "failed" && batchLinkDrive.errorMessage
                ? batchLinkDrive.errorMessage
                : hasImage
                  ? "尚未关联货源 · 点击「查找候选」开始图搜"
                  : "该商品无主图，无法图搜"}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions — secondary links + primary on the right */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              headerBadge.variant === "matched"
                ? headerBadge.label === "人工匹配"
                  ? "bg-violet-50 text-violet-700"
                  : "bg-emerald-50 text-emerald-700"
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
          {isNewArrival && cardState === "unbound" ? (
            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
              新入库
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[12px]">
          <button
            type="button"
            className="font-medium text-slate-500 hover:text-slate-800"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
          >
            编辑商品
          </button>
          {detailUrl ? (
            <>
              <span className="text-slate-300">|</span>
              <a
                href={detailUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800"
                onClick={(e) => e.stopPropagation()}
              >
                货源详情
                <ExternalLink className="h-3 w-3" />
              </a>
            </>
          ) : null}
          {cardState !== "unbound" || current ? (
            <>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={searching || !hasImage}
                title={
                  !hasImage
                    ? "该商品无主图，无法图搜"
                    : result && result.items.length > 0
                      ? "展开上一轮图搜结果"
                      : "图搜匹配货源"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  void openOrRunSearch(false);
                }}
              >
                {searching ? "匹配中…" : "重新匹配"}
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={cardActionsLocked || !isMallGatewayConfigured()}
                title={
                  !isMallGatewayConfigured()
                    ? "商城货源暂不可用"
                    : "粘贴发现新品链接手动关联货源"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setManualDrawerOpen(true);
                }}
              >
                手动匹配
              </button>
            </>
          ) : (
            <>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                className="font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50"
                disabled={cardActionsLocked || !isMallGatewayConfigured()}
                title={
                  !isMallGatewayConfigured()
                    ? "商城货源暂不可用"
                    : "粘贴发现新品链接手动关联货源"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setManualDrawerOpen(true);
                }}
              >
                手动匹配
              </button>
            </>
          )}
          {boundOfferId ? (
            <>
              {cardState === "pending" ? (
                <>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    className="font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
                    disabled={rejecting || acking}
                    onClick={(e) => {
                      e.stopPropagation();
                      void rejectBinding();
                    }}
                  >
                    {rejecting ? "驳回中…" : "驳回"}
                  </button>
                </>
              ) : (
                <>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    className="font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
                    disabled={unbinding || acking}
                    onClick={(e) => {
                      e.stopPropagation();
                      void unbindBinding();
                    }}
                  >
                    取消关联
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
            {confirmingId ? "处理中…" : primaryLabel}
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
              重试
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Candidate tray */}
      {trayOpen || searching ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <span
              className="inline-block h-7 w-7 shrink-0"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-center text-[12px] font-semibold text-slate-800">
              {searching
                ? searchPhase ?? "正在搜索…"
                : candidates && candidates.length > 0
                  ? `${candidates.length} 个候选`
                  : result
                    ? "未召回候选"
                    : "图搜候选"}
            </p>
            {trayOpen && !searching ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  disabled={!hasImage}
                  title="刷新图搜"
                  aria-label="刷新图搜"
                  onClick={(e) => {
                    e.stopPropagation();
                    void runSearch();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  title="收起候选"
                  aria-label="收起候选"
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

          {candidates && candidates.length > 0 ? (
            <div className="mt-2.5 flex items-stretch gap-2 overflow-x-auto pb-1">
              {candidates.map((c, idx) => {
                const signals = candidateSignals(c);
                const titleScore = resolveCandidateTitleScore(c, matchScores);
                const imageScore = resolveCandidateImageScore(c, imageScores);
                const imageBlockedHint = imageGateBlockedHint(imageScore);
                const isCurrent = idx === currentIdx;
                const isTop =
                  idx === recommendedIdx && passesImageRecommendGate(imageScore);
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
                    ? `采购价 ${formatPurchaseCostMoney(costTarget, purchaseCtx.currency)}`
                    : `采购价 ${formatCny(c.price)}`;
                const inlineReason = trayInlineReasons[c.productId];
                const isBatchSelectTarget =
                  isTop &&
                  batchLinkDrive?.selectButtonPhase != null &&
                  batchLinkDrive.selectButtonPhase !== "idle";
                return (
                  <div
                    key={`${c.productId}-${idx}`}
                    ref={isTop ? topCandidateRef : undefined}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "relative flex w-[11rem] shrink-0 cursor-pointer flex-col rounded-lg border-2 bg-white p-2 transition-colors",
                      isCurrent
                        ? "border-sky-400 bg-sky-50/30"
                        : isBoundCand
                          ? "border-amber-300"
                          : isTop
                            ? "border-emerald-300"
                            : "border-slate-200",
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        setCurrentIdx(idx);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "relative h-[4.5rem] w-full shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50",
                        c.imageUrl && "cursor-zoom-in"
                      )}
                      disabled={!c.imageUrl}
                      aria-label={c.imageUrl ? "放大候选货源图" : undefined}
                      onClick={(e) =>
                        openImageZoom(e, c.imageUrl, c.title || c.productId)
                      }
                    >
                      {c.imageUrl ? (
                        <ThumbImage
                          src={c.imageUrl}
                          alt={c.title || c.productId}
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
                            {bindPending ? "待确认" : "已关联"}
                          </span>
                        ) : isTop ? (
                          <span className="w-fit rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            首推
                          </span>
                        ) : null}
                      </div>
                    </button>
                    <p className="mt-1.5 line-clamp-2 min-h-[2rem] text-[11px] leading-4 text-slate-700">
                      {c.title || "(无标题)"}
                    </p>
                    <p className="mt-1 shrink-0 text-[11px] font-semibold text-slate-900">
                      {costLabel}
                    </p>
                    {inlineReason ? (
                      <p className="mt-1 line-clamp-2 text-[10px] leading-3.5 text-slate-500">
                        {inlineReason}
                      </p>
                    ) : null}
                    <div className="mt-1 flex min-h-[1.25rem] flex-wrap content-start gap-1">
                      {formatTitleMatchLabel(titleScore) ? (
                        <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-800">
                          {formatTitleMatchLabel(titleScore)}
                        </span>
                      ) : null}
                      {formatImageMatchLabel(imageScore) ? (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px]",
                            imageBlockedHint
                              ? "bg-amber-50 text-amber-800"
                              : "bg-emerald-50 text-emerald-700"
                          )}
                        >
                          {formatImageMatchLabel(imageScore)}
                        </span>
                      ) : imageBlockedHint ? (
                        <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">
                          {imageBlockedHint}
                        </span>
                      ) : null}
                      {signals.slice(0, 1).map((s) => (
                        <span
                          key={s}
                          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
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
                          已选用
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
                            "选用"
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
