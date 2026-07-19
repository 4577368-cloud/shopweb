"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  MoveRight,
  RefreshCw,
  Search,
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

/** Restrained one-line explanation of how the backend resolved this search. */
function sourceHint(r: ImageSearchResult): string {
  const img = r.imageSource === "ORIGINAL" ? "货源原图" : "店铺图";
  let q: string;
  if (r.querySource === "TITLE") {
    q = `标题纠偏「${r.appliedQuery ?? ""}」`;
  } else if (r.querySource === "LLM") {
    q = `AI 识图纠偏「${r.appliedQuery ?? ""}」`;
  } else {
    q = "纯图搜";
  }
  return `图源：${img} · ${q}`;
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

type ShopFilter = "all" | "pending" | "confirmed" | "unbound";

export function ShopProductsPanel({ onActivity }: { onActivity?: () => void }) {
  const { shop, showToast } = useOnboarding();
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState<ShopMirrorProduct[]>([]);
  const [filter, setFilter] = useState<ShopFilter>("all");
  // 回显: itemId -> ACTIVE binding. Server is the source of truth; refreshed on load/sync.
  const [bindings, setBindings] = useState<Record<string, ImageBindingView>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, bound] = await Promise.all([
        api.getShopProducts(shopName),
        api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
      ]);
      setProducts(items);
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
        <Button size="sm" onClick={() => void handleSync()} disabled={syncing}>
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {syncing ? "同步中…" : "同步商品"}
        </Button>
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
  onBound,
}: {
  item: ShopMirrorProduct;
  shopName: string;
  binding: ImageBindingView | null;
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

  return (
    <article className="flex flex-col rounded-[var(--radius-card)] border border-hairline bg-surface p-3.5 shadow-card">
      {/* Shopify ↔ Tangbuy side-by-side comparison */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2.5">
        <CompareTile
          label="Shopify"
          image={hasImage ? item.primaryImageUrl : null}
          imageAlt={item.title ?? item.thirdPlatformItemId}
          title={item.title}
          priceNode={
            <span className="text-sm font-semibold text-ink">{priceRange(item)}</span>
          }
          metaNode={
            <div className="flex flex-wrap items-center gap-1">
              {item.status ? (
                <Badge variant={active ? "success" : "default"}>{item.status}</Badge>
              ) : null}
            </div>
          }
        />

        <div className="flex flex-col items-center justify-center gap-1 px-0.5">
          <MoveRight className="h-4 w-4 text-ink-subtle" />
          {bindPending ? (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-center text-[10px] font-medium text-amber-700">
              AI
              <br />
              待确认
            </span>
          ) : bindConfirmed ? (
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-center text-[10px] font-medium text-brand-strong">
              已确认
            </span>
          ) : null}
          {binding?.bound && binding.matchScore != null && binding.matchScore > 0 ? (
            <span className="text-center text-[10px] font-medium text-ink-subtle">
              {formatSimilarity(binding.matchScore)}
            </span>
          ) : null}
        </div>

        {rightMode === "candidate" && current ? (
          <CompareTile
            label="Tangbuy 候选"
            labelTone="brand"
            image={current.imageUrl}
            imageAlt={current.title || current.productId}
            title={current.title}
            priceNode={
              <span className="text-sm font-semibold text-ink">
                {formatCny(current.price)}
              </span>
            }
            metaNode={
              candidateSignals(current).length ? (
                <span className="text-[10px] text-ink-subtle">
                  {candidateSignals(current).join(" · ")}
                </span>
              ) : current.supplier ? (
                <span className="truncate text-[10px] text-ink-subtle">
                  {current.supplier}
                </span>
              ) : null
            }
          />
        ) : rightMode === "bound" ? (
          (() => {
            // Prefer the confirm-time snapshot; fall back to freshly fetched offer detail (legacy rows).
            const boundImage = snapImage ?? offerImage(offer);
            const boundPrice = snapPrice ? `¥${snapPrice}` : offerPriceText(offer);
            const stillLoading = !hasSnapshot && offerLoading && !offer;
            return (
              <CompareTile
                label="Tangbuy 货源"
                labelTone="brand"
                image={boundImage}
                imageAlt={offer?.subjectTrans ?? offer?.subject ?? boundOfferId ?? ""}
                title={offer?.subjectTrans ?? offer?.subject ?? `offer ${boundOfferId}`}
                loading={stillLoading}
                placeholder={stillLoading ? " " : undefined}
                priceNode={
                  boundPrice ? (
                    <span className="text-sm font-semibold text-ink">{boundPrice}</span>
                  ) : (
                    <span className="text-[11px] text-ink-subtle">价未取到</span>
                  )
                }
              />
            );
          })()
        ) : (
          <CompareTile
            label="Tangbuy 货源"
            labelTone="brand"
            placeholder={
              hasImage ? "未关联货源 · 点「查找货源」" : "该商品无主图，无法图搜"
            }
          />
        )}
      </div>

      {result ? (
        <p className="mt-2 text-[10px] text-ink-subtle">{sourceHint(result)}</p>
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
