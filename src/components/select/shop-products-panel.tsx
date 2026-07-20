"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MoveRight,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { useOnboarding } from "@/context/onboarding-context";
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

/** Similarity score may be a 0–1 ratio or an absolute index; render defensively. */
function formatSimilarity(score?: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return String(Math.round(score));
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

/** 预估毛利:货源采购价(¥)按定价模板汇率换算成目标币成本,与当前 Shopify 售价对比。 */
interface MarginEstimate {
  pct: number;
  costInTarget: number;
  currency: string;
  rate: number;
}

/**
 * Only produced when sale price, cost and rate are all known and the product's currency matches the
 * template's target currency — otherwise null (we never fabricate a margin %). Cost is converted as
 * CNY ÷ exchangeRate (rate = source units per 1 target, e.g. 6.5 CNY/USD). Uses only the exchange
 * rate (not multiplier/addend, which shape a *new* sale price for publishing, not an existing one).
 */
function marginEstimate(
  shopPrice: number | null,
  shopCurrency: string | null | undefined,
  costCny: number | null,
  template: PricingTemplate | null
): MarginEstimate | null {
  if (!template || shopPrice == null || shopPrice <= 0 || costCny == null || costCny <= 0) {
    return null;
  }
  const rate = template.exchangeRate;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const target = (template.targetCurrency ?? "").toUpperCase();
  const cur = (shopCurrency ?? "").toUpperCase();
  if (cur && target && cur !== target) return null;
  const costInTarget = costCny / rate;
  return {
    pct: Math.round(((shopPrice - costInTarget) / shopPrice) * 100),
    costInTarget,
    currency: target || cur || "",
    rate,
  };
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
  if (opts.imageSource === "ORIGINAL") out.push("按货源原图图搜命中");
  else if (opts.imageSource === "SHOPIFY") out.push("按商品主图图搜命中");
  else out.push("图搜命中");
  const q = (opts.appliedQuery ?? "").trim();
  if (opts.querySource === "TITLE" && q) out.push(`标题校准「${q}」`);
  else if (opts.querySource === "LLM" && q) out.push(`AI 识图校准「${q}」`);
  if (opts.matchScore != null && opts.matchScore > 0) {
    out.push(`图像匹配度 ${formatSimilarity(opts.matchScore)}`);
  }
  for (const s of opts.signals ?? []) out.push(s);
  return out.slice(0, 4);
}

function priceRange(p: ShopMirrorProduct): string {
  const { minPrice, maxPrice, currency } = p;
  if (minPrice == null && maxPrice == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  if (minPrice != null && maxPrice != null && minPrice !== maxPrice) {
    return `${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}${cur}`;
  }
  const one = (minPrice ?? maxPrice) as number;
  return `${one.toFixed(2)}${cur}`;
}

export type ShopFilter = "all" | "pending" | "confirmed" | "unbound";

export function ShopProductsPanel({
  onActivity,
  filter: filterProp,
  onFilterChange,
}: {
  onActivity?: () => void;
  /** Optional controlled filter — lets the page's top CTA jump straight to e.g. 待确认. */
  filter?: ShopFilter;
  onFilterChange?: (f: ShopFilter) => void;
}) {
  const { shop, showToast } = useOnboarding();
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [products, setProducts] = useState<ShopMirrorProduct[]>([]);
  const [internalFilter, setInternalFilter] = useState<ShopFilter>("all");
  const [template, setTemplate] = useState<PricingTemplate | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, bound, tpl] = await Promise.all([
        api.getShopProducts(shopName),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
        api.getPricingTemplate(shopName).catch(() => null),
      ]);
      setProducts(items);
      setTemplate(tpl);
      const map: Record<string, ImageBindingView> = {};
      for (const b of bound) {
        if (b.thirdPlatformItemId) map[b.thirdPlatformItemId] = b;
      }
      setBindings(map);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [shopName]);

  const handleBound = useCallback(
    (itemId: string, view: ImageBindingView) => {
      setBindings((prev) => ({ ...prev, [itemId]: view }));
      onActivity?.();
    },
    [onActivity]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; load() sets its own loading flag
    void load();
  }, [load]);

  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await api.syncShopProducts(shopName);
      await load();
      onActivity?.();
      showToast(`已同步，店铺共 ${result.productCount} 个商品`);
    } catch (err) {
      setError(readableError(err));
      showToast("同步失败");
    } finally {
      setSyncing(false);
    }
  };

  // Repair legacy bindings that show 无图/成本待取: re-fetch the image+price snapshot server-side.
  const handleBackfill = async () => {
    if (backfilling) return;
    setBackfilling(true);
    try {
      const r = await api.backfillBindingSnapshots(shopName);
      await load();
      onActivity?.();
      showToast(
        r.backfilled > 0
          ? `已补全 ${r.backfilled} 个货源图/价（搜索 ${r.fromSearch} · 详情 ${r.fromDetail}）`
          : r.unresolved > 0
            ? `有 ${r.unresolved} 个货源暂时取不到图/价，可稍后重试`
            : "货源图/价已是最新"
      );
    } catch (err) {
      showToast(readableError(err));
    } finally {
      setBackfilling(false);
    }
  };

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
    return {
      all: products.length,
      pending,
      confirmed,
      unbound: products.length - pending - confirmed,
    };
  }, [products, stateOf]);

  const filtered = useMemo(() => {
    if (filter === "pending") return products.filter((p) => stateOf(p) === "pending");
    if (filter === "confirmed") return products.filter((p) => stateOf(p) === "confirmed");
    if (filter === "unbound") return products.filter((p) => stateOf(p) === null);
    return products;
  }, [products, filter, stateOf]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          variant="chip"
          tabs={[
            { id: "all", label: "全部", count: counts.all },
            { id: "pending", label: "AI 待确认", count: counts.pending },
            { id: "confirmed", label: "已确认", count: counts.confirmed },
            { id: "unbound", label: "未关联", count: counts.unbound },
          ]}
          value={filter}
          onValueChange={(id) => setFilter(id as ShopFilter)}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void handleBackfill()}
            disabled={backfilling || syncing}
            title="为显示「无图/成本待取」的已关联货源，重新补全货源图片与价格"
          >
            {backfilling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {backfilling ? "补全中…" : "补全图/价"}
          </Button>
          <Button size="sm" onClick={() => void handleSync()} disabled={syncing || backfilling}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {syncing ? "同步中…" : "同步商品"}
          </Button>
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

      {loading ? (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          title="暂无在售商品"
          description="尚未同步到店铺商品，或店铺当前无商品。点击「同步商品」从 Shopify 拉取。"
          action={
            <Button
              size="sm"
              className="mt-1"
              onClick={() => void handleSync()}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              同步商品
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="该筛选下暂无商品"
          description="切换到「全部」查看所有在售商品。"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((p) => (
            <ShopProductCard
              key={p.id}
              item={p}
              shopName={shopName}
              binding={bindings[p.thirdPlatformItemId] ?? null}
              template={template}
              onBound={handleBound}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** A compact tile (image + title + price) for one side of the Shopify↔Tangbuy comparison. */
function CompareTile({
  label,
  labelTone,
  image,
  imageAlt,
  title,
  priceNode,
  metaNode,
  placeholder,
  loading,
}: {
  label: string;
  labelTone?: "brand";
  image?: string | null;
  imageAlt?: string;
  title?: string | null;
  priceNode?: ReactNode;
  metaNode?: ReactNode;
  placeholder?: ReactNode;
  loading?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [image]);
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 p-2.5">
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide",
          labelTone === "brand" ? "text-brand-strong" : "text-ink-subtle"
        )}
      >
        {label}
      </span>
      {placeholder ? (
        <div className="mt-1.5 flex min-h-[7.5rem] flex-1 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-hairline px-2 text-center text-[11px] text-ink-subtle">
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              载入货源…
            </span>
          ) : (
            placeholder
          )}
        </div>
      ) : (
        <>
          <div className="relative mt-1.5 aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface">
            {image && !imgError ? (
              <Image
                src={image}
                alt={imageAlt ?? title ?? ""}
                fill
                sizes="180px"
                className="object-cover"
                unoptimized
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] text-ink-subtle">
                {image ? "货源图暂不可用" : "无图"}
              </div>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-4 text-ink">
            {title ?? "(无标题)"}
          </p>
          {priceNode ? <div className="mt-1">{priceNode}</div> : null}
          {metaNode ? <div className="mt-0.5">{metaNode}</div> : null}
        </>
      )}
    </div>
  );
}

function ShopProductCard({
  item,
  shopName,
  binding,
  template,
  onBound,
}: {
  item: ShopMirrorProduct;
  shopName: string;
  binding: ImageBindingView | null;
  template: PricingTemplate | null;
  onBound: (itemId: string, view: ImageBindingView) => void;
}) {
  const { showToast } = useOnboarding();
  const active = (item.status ?? "").toUpperCase() === "ACTIVE";
  const hasImage = Boolean(item.primaryImageUrl);

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [result, setResult] = useState<ImageSearchResult | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // The panel owns binding truth (回显 map); the card renders the prop and reports confirms upward.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [acking, setAcking] = useState(false);
  const [unbinding, setUnbinding] = useState(false);

  const boundOfferId =
    binding?.bound && binding.tangbuyProductId ? binding.tangbuyProductId : null;
  // AI 待确认 (PENDING) vs 已确认 (ACTIVE). Legacy rows without a status are treated as confirmed.
  const bindPending = Boolean(binding?.bound) && binding?.bindStatus === "PENDING";
  const bindConfirmed = Boolean(binding?.bound) && !bindPending;
  // Published from the Tangbuy catalog → already a 1:1 source link; no matching needed.
  const fromPublish = Boolean(binding?.bound) && binding?.bindSource === "FROM_PUBLISH";

  // Snapshot captured at confirm time: the exact candidate image/price the user matched. Preferred for
  // 回显 so we don't depend on (and don't re-hit) offer-detail, whose cross-border payload often has a
  // null white image and an empty SKU matrix.
  const snapImage = binding?.bound ? (binding.offerImageUrl ?? null) : null;
  const snapPrice = binding?.bound ? (binding.offerPrice ?? null) : null;
  const hasSnapshot = Boolean(snapImage && snapPrice);

  // Bound cards lazily fetch the real offer detail only when there's no snapshot, so the right tile can
  // still show 货源图/价 for legacy bindings (route B). New bindings skip this call entirely.
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [offerLoading, setOfferLoading] = useState(false);

  useEffect(() => {
    if (!boundOfferId || hasSnapshot) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy fetch of bound offer detail
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

  const runSearch = async () => {
    if (searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await api.imageSearch(shopName, item.thirdPlatformItemId, 4);
      setResult(res);
      setCurrentIdx(0);
      setExpanded(false);
    } catch (err) {
      setResult(null);
      setSearchError(imageSearchError(err));
    } finally {
      setSearching(false);
    }
  };

  const confirmMatch = async (candidate: ImageSearchProduct) => {
    if (confirmingId) return;
    if (boundOfferId && boundOfferId !== candidate.productId) {
      const ok = window.confirm(
        `该商品已绑定货源 ${boundOfferId}，确认改绑到 ${candidate.productId}？`
      );
      if (!ok) return;
    }
    setConfirmingId(candidate.productId);
    setConfirmError(null);
    try {
      const view = await api.confirmImageMatch({
        shopName,
        thirdPlatformItemId: item.thirdPlatformItemId,
        offerProductId: candidate.productId,
        offerSkuId: candidate.skuId,
        detailUrl: candidate.detailUrl,
        similarityScore: candidate.similarityScore,
        imageSource: result?.imageSource,
        querySource: result?.querySource,
        appliedQuery: result?.appliedQuery,
        offerImageUrl: candidate.imageUrl,
        offerPrice: candidate.price,
      });
      onBound(item.thirdPlatformItemId, view);
      showToast(boundOfferId ? "已改绑货源" : "已绑定货源");
    } catch (err) {
      setConfirmError(imageMatchError(err));
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

  const candidates = result?.items ?? null;
  const current = candidates?.[currentIdx] ?? null;
  // Right tile shows the active search candidate when searching, else the bound source, else a CTA.
  const rightMode: "candidate" | "bound" | "empty" = current
    ? "candidate"
    : boundOfferId
      ? "bound"
      : "empty";
  const isBoundHere =
    current != null && boundOfferId != null && boundOfferId === current.productId;
  const isRebind =
    current != null && boundOfferId != null && boundOfferId !== current.productId;

  // —— AI 推荐卡派生值（全部映射真实数据，缺失即不显示，不编造） ——
  const shopPrice = item.minPrice ?? item.maxPrice ?? null;
  const boundImage = snapImage ?? offerImage(offer);
  const boundTitle =
    offer?.subjectTrans ?? offer?.subject ?? (boundOfferId ? `货源 ${boundOfferId}` : null);
  const boundPriceText = snapPrice ? `¥${snapPrice}` : offerPriceText(offer);
  const boundCostNum =
    parsePrice(snapPrice) ?? parsePrice((offerPriceText(offer) ?? "").replace(/¥/g, ""));

  // The recommended source: a live candidate (searching) takes precedence, else the bound source.
  const reco =
    rightMode === "candidate" && current
      ? {
          image: current.imageUrl ?? null,
          title: current.title || `货源 ${current.productId}`,
          priceText: formatCny(current.price),
          costNum: parsePrice(current.price),
          reasons: matchReasons({
            imageSource: result?.imageSource,
            querySource: result?.querySource,
            appliedQuery: result?.appliedQuery,
            matchScore: current.similarityScore,
            signals: candidateSignals(current),
          }),
        }
      : rightMode === "bound"
        ? {
            image: boundImage,
            title: boundTitle,
            priceText: boundPriceText,
            costNum: boundCostNum,
            reasons: fromPublish
              ? ["从 Tangbuy 商城上架 · 与货源 1:1 绑定"]
              : matchReasons({
                  imageSource: binding?.imageSource,
                  querySource: binding?.querySource,
                  appliedQuery: binding?.appliedQuery,
                  matchScore: binding?.matchScore,
                }),
          }
        : null;

  const margin = reco ? marginEstimate(shopPrice, item.currency, reco.costNum, template) : null;
  const boundLoading = rightMode === "bound" && !hasSnapshot && offerLoading && !offer;

  const status: { label: string; tone: "brand" | "amber" | "neutral" } = current
    ? {
        label: isBoundHere ? "已采用此货源" : isRebind ? "AI 推荐改绑" : "AI 推荐货源",
        tone: "brand",
      }
    : bindPending
      ? { label: "AI 待确认", tone: "amber" }
      : fromPublish
        ? { label: "来自 Tangbuy 商城", tone: "brand" }
        : bindConfirmed
          ? { label: "已采用货源", tone: "brand" }
          : { label: "未匹配货源", tone: "neutral" };

  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5 shadow-card">
      {/* Lead with AI's judgment (status + margin), not a raw comparison table. */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            status.tone === "brand"
              ? "bg-brand-soft text-brand-strong"
              : status.tone === "amber"
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-ink-subtle"
          )}
        >
          {status.tone === "brand" ? <Sparkles className="h-3.5 w-3.5" /> : null}
          {status.label}
        </span>
        {margin ? (
          <span className="text-[11px] font-medium text-ink-subtle">
            预估毛利{" "}
            <span
              className={cn(
                "font-semibold",
                margin.pct >= 0 ? "text-brand-strong" : "text-red-600"
              )}
            >
              ~{margin.pct}%
            </span>
          </span>
        ) : null}
      </div>

      {/* Compact 图对图（保留人眼对照，权重让给下方 AI 推荐理由）. */}
      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
        <CompareTile
          label="Shopify"
          image={hasImage ? item.primaryImageUrl : null}
          imageAlt={item.title ?? item.thirdPlatformItemId}
          title={item.title}
          priceNode={
            <span className="text-sm font-semibold text-ink">{priceRange(item)}</span>
          }
          metaNode={
            item.status ? (
              <Badge variant={active ? "success" : "default"}>{item.status}</Badge>
            ) : null
          }
        />

        <div className="flex items-center justify-center px-0.5">
          <MoveRight className="h-4 w-4 text-ink-subtle" />
        </div>

        {reco ? (
          <CompareTile
            label={rightMode === "candidate" ? "AI 推荐候选" : "AI 推荐货源"}
            labelTone="brand"
            image={reco.image}
            imageAlt={reco.title ?? ""}
            title={reco.title}
            loading={boundLoading}
            placeholder={boundLoading ? " " : undefined}
            priceNode={
              reco.priceText ? (
                <span className="text-sm font-semibold text-ink">成本 {reco.priceText}</span>
              ) : (
                <span className="text-[11px] text-ink-subtle">成本待取</span>
              )
            }
          />
        ) : (
          <CompareTile
            label="AI 推荐货源"
            labelTone="brand"
            placeholder={hasImage ? "尚未找到货源 · 点「查找货源」" : "该商品无主图，无法图搜"}
          />
        )}
      </div>

      {/* AI 推荐理由 + 预估毛利空间：新的视觉重心。 */}
      {reco && reco.reasons.length ? (
        <div className="mt-2.5 rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-medium text-ink-subtle">AI 为什么推荐</p>
          <div className="flex flex-wrap gap-1.5">
            {reco.reasons.map((r) => (
              <span
                key={r}
                className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-muted"
              >
                {r}
              </span>
            ))}
          </div>
          {margin ? (
            <p className="mt-2 text-[11px] leading-4 text-ink-subtle">
              预估毛利空间{" "}
              <span
                className={cn(
                  "font-semibold",
                  margin.pct >= 0 ? "text-brand-strong" : "text-red-600"
                )}
              >
                ~{margin.pct}%
              </span>
              {" · "}按售价 {fmtMoney(shopPrice as number, item.currency ?? margin.currency)} 与货源成本 ≈
              {fmtMoney(margin.costInTarget, margin.currency)}（汇率 {margin.rate}）估算，为预估值
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Action row */}
      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-hairline pt-2.5">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void runSearch()}
          disabled={searching || !hasImage}
          title={!hasImage ? "该商品无主图，无法图搜" : undefined}
        >
          {searching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {searching ? "搜索中…" : boundOfferId ? "重新查找" : "查找货源"}
        </Button>

        <div className="flex items-center gap-2">
          {boundOfferId && binding?.detailUrl ? (
            <a
              href={binding.detailUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              <ExternalLink className="h-3 w-3" />
              货源详情
            </a>
          ) : null}
          {current ? (
            isBoundHere ? (
              <Button size="sm" variant="secondary" disabled>
                已绑定此货源
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void confirmMatch(current)}
                disabled={confirmingId === current.productId}
              >
                {confirmingId === current.productId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {confirmingId === current.productId
                  ? "绑定中…"
                  : isRebind
                    ? "改绑到此货源"
                    : "确认匹配"}
              </Button>
            )
          ) : boundOfferId ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void unbindBinding()}
                disabled={unbinding || acking}
              >
                {unbinding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                取消关联
              </Button>
              {bindPending ? (
                <Button size="sm" onClick={() => void ackBinding()} disabled={acking || unbinding}>
                  {acking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  确认无误
                </Button>
              ) : null}
            </>
          ) : hasImage ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => showToast("发起询盘功能即将上线")}
            >
              发起询盘
            </Button>
          ) : null}
        </div>
      </div>

      {confirmError ? (
        <div className="mt-2.5 rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {confirmError}
        </div>
      ) : null}

      {searchError ? (
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <span>{searchError}</span>
          {hasImage ? (
            <button
              type="button"
              className="shrink-0 font-medium underline underline-offset-2"
              onClick={() => void runSearch()}
            >
              重试
            </button>
          ) : null}
        </div>
      ) : null}

      {result && candidates && candidates.length === 0 ? (
        <p className="mt-2.5 text-xs text-ink-muted">
          Tangbuy 未召回相似货源，可稍后重试或更换商品。
        </p>
      ) : null}

      {/* More candidates (session-only switch) */}
      {candidates && candidates.length > 1 ? (
        <div className="mt-2.5 border-t border-hairline pt-2.5">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {expanded ? "收起候选" : `更多候选（${candidates.length - 1}）`}
          </button>

          {expanded ? (
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {candidates.map((c, idx) => (
                <button
                  key={`${c.productId}-${idx}`}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-control)] border px-2 py-1.5 text-left transition-colors",
                    idx === currentIdx
                      ? "border-brand bg-surface"
                      : "border-hairline bg-surface hover:border-hairline-strong"
                  )}
                >
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-hairline bg-surface">
                    {c.imageUrl ? (
                      <Image
                        src={c.imageUrl}
                        alt={c.title || c.productId}
                        fill
                        sizes="36px"
                        className="object-cover"
                        unoptimized
                        referrerPolicy="no-referrer"
                      />
                    ) : null}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
                    {c.title || "(无标题)"}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium text-ink">
                    {formatCny(c.price)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
