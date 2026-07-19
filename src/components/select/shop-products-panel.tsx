"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, ApiError } from "@/lib/api";
import type {
  ImageBindingView,
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
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
    return "1688 开放平台凭证未配置或无效，请配置后重试";
  }
  if (raw.startsWith("AOP_TOKEN_INVALID")) {
    return "1688 授权已失效或过期，请重新授权后重试";
  }
  if (raw.startsWith("IMAGE_UNREADABLE")) {
    return "商品主图无法读取或上传，请更换主图后重试";
  }
  if (raw.startsWith("NO_PRIMARY_IMAGE")) {
    return "该商品无主图，无法进行 1688 图搜";
  }
  if (raw.startsWith("PRODUCT_NOT_FOUND")) {
    return "未找到该商品镜像，请先同步商品";
  }
  if (raw.startsWith("GATEWAY_BUSY")) {
    return "1688 网关繁忙或限流，请稍后重试";
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

export function ShopProductsPanel() {
  const { shop, showToast } = useOnboarding();
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [products, setProducts] = useState<ShopMirrorProduct[]>([]);
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

  const handleBound = useCallback((itemId: string, view: ImageBindingView) => {
    setBindings((prev) => ({ ...prev, [itemId]: view }));
  }, []);

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
      showToast(`已同步，店铺共 ${result.productCount} 个商品`);
    } catch (err) {
      setError(readableError(err));
      showToast("同步失败");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">
            店铺在售商品（Shopify 同步镜像）。可查找并绑定 1688 货源。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!loading ? (
            <Badge variant="outline">{products.length} 个商品</Badge>
          ) : null}
          <Button size="sm" onClick={() => void handleSync()} disabled={syncing}>
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
      ) : (
        <div className="space-y-2.5">
          {products.map((p) => (
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

  const boundOfferId =
    binding?.bound && binding.tangbuyProductId ? binding.tangbuyProductId : null;

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
      });
      onBound(item.thirdPlatformItemId, view);
      showToast(boundOfferId ? "已改绑货源" : "已绑定货源");
    } catch (err) {
      setConfirmError(imageMatchError(err));
    } finally {
      setConfirmingId(null);
    }
  };

  const candidates = result?.items ?? null;
  const current = candidates?.[currentIdx] ?? null;

  return (
    <article className="rounded-lg border border-slate-200 bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="grid grid-cols-[64px_1fr_170px] items-stretch gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {hasImage ? (
            <Image
              src={item.primaryImageUrl as string}
              alt={item.title ?? item.thirdPlatformItemId}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">
              无图
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
            {item.title ?? "(无标题)"}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-slate-900">
              {priceRange(item)}
            </span>
            {item.status ? (
              <Badge variant={active ? "success" : "default"}>
                {item.status}
              </Badge>
            ) : null}
          </div>
          {item.handle ? (
            <p className="mt-1 truncate text-[11px] text-slate-400">
              /{item.handle}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end justify-center gap-1.5 border-l border-slate-100 pl-3">
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
            {searching ? "搜索中…" : "查找货源"}
          </Button>
          <p className="text-[10px] leading-tight text-slate-400">
            1688 图搜（预览）
          </p>
        </div>
      </div>

      {binding?.bound ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <Badge variant="success">已绑定货源</Badge>
          <span className="font-medium">1688 offer {binding.tangbuyProductId}</span>
          {binding.matchScore != null && binding.matchScore > 0 ? (
            <span className="text-emerald-600">
              相似度 {formatSimilarity(binding.matchScore)}
            </span>
          ) : null}
          {binding.querySource && binding.querySource !== "NONE" ? (
            <span className="text-emerald-600">
              {binding.querySource === "LLM" ? "AI 识图" : "标题"}纠偏
              {binding.appliedQuery ? `「${binding.appliedQuery}」` : ""}
            </span>
          ) : null}
          {binding.detailUrl ? (
            <a
              href={binding.detailUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3" />
              查看 1688 详情
            </a>
          ) : null}
        </div>
      ) : null}

      {confirmError ? (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {confirmError}
        </div>
      ) : null}

      {searchError ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
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
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">
            1688 未召回相似货源，可稍后重试或更换商品。
          </p>
          <p className="mt-1 text-[10px] text-slate-400">{sourceHint(result)}</p>
        </div>
      ) : null}

      {result && current ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
          <p className="mb-2 text-[10px] text-slate-400">{sourceHint(result)}</p>
          <SourceCandidate
            candidate={current}
            isFirst={currentIdx === 0}
            boundOfferId={boundOfferId}
            confirming={confirmingId === current.productId}
            onConfirm={() => void confirmMatch(current)}
          />

          {candidates && candidates.length > 1 ? (
            <div className="mt-2.5 border-t border-slate-200 pt-2.5">
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                {expanded
                  ? "收起候选"
                  : `更多候选（${candidates.length - 1}）`}
              </button>

              {expanded ? (
                <div className="mt-2 space-y-1.5">
                  {candidates.map((c, idx) => (
                    <button
                      key={`${c.productId}-${idx}`}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className={`flex w-full items-center gap-2.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
                        idx === currentIdx
                          ? "border-slate-900 bg-white"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
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
                      <span className="min-w-0 flex-1 truncate text-[11px] text-slate-700">
                        {c.title || "(无标题)"}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-900">
                        {formatCny(c.price)}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatSold(c.soldCount) ?? ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SourceCandidate({
  candidate,
  isFirst,
  boundOfferId,
  confirming,
  onConfirm,
}: {
  candidate: ImageSearchProduct;
  isFirst: boolean;
  boundOfferId: string | null;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const isBoundHere = boundOfferId != null && boundOfferId === candidate.productId;
  const isRebind = boundOfferId != null && boundOfferId !== candidate.productId;
  const signals = candidateSignals(candidate);
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="outline">{isFirst ? "首个候选" : "当前候选"}</Badge>
        <span className="text-[11px] text-slate-400">
          1688{signals.length ? ` · ${signals.join(" · ")}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-[56px_1fr] items-start gap-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
          {candidate.imageUrl ? (
            <Image
              src={candidate.imageUrl}
              alt={candidate.title || candidate.productId}
              fill
              sizes="56px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">
              无图
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-medium leading-4 text-slate-800">
            {candidate.title || "(无标题)"}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-sm font-semibold text-slate-900">
              {formatCny(candidate.price)}
            </span>
            {candidate.minOrderQty != null ? (
              <span className="text-[10px] text-slate-400">
                起订 {candidate.minOrderQty}
              </span>
            ) : null}
            {candidate.supplier ? (
              <span className="truncate text-[10px] text-slate-400">
                {candidate.supplier}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            {candidate.detailUrl ? (
              <a
                href={candidate.detailUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
              >
                <ExternalLink className="h-3 w-3" />
                查看 1688 详情
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-end">
        {isBoundHere ? (
          <Button size="sm" variant="secondary" disabled>
            已绑定此货源
          </Button>
        ) : (
          <Button size="sm" onClick={onConfirm} disabled={confirming}>
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {confirming ? "绑定中…" : isRebind ? "改绑到此货源" : "确认匹配"}
          </Button>
        )}
      </div>
    </div>
  );
}
