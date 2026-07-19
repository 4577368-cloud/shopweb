"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, ApiError } from "@/lib/api";
import type { SkuProductOverview, SkuVariant } from "@/lib/types";

function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
}

/** Similarity score may be a 0–1 ratio or an absolute index; render defensively. */
function formatScore(score?: number | null): string {
  if (score == null || Number.isNaN(score)) return "—";
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return String(Math.round(score));
}

function formatPrice(price?: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  return price.toFixed(2);
}

function queryHint(v: NonNullable<SkuVariant["bound"]>): string | null {
  if (!v.querySource || v.querySource === "NONE") return null;
  const src = v.querySource === "LLM" ? "AI 识图" : "标题";
  return v.appliedQuery ? `${src}纠偏「${v.appliedQuery}」` : `${src}纠偏`;
}

export function SkuBindingPanel() {
  const { shop } = useOnboarding();
  const shopName = shop.name;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SkuProductOverview[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProducts(await api.getSkuOverview(shopName));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [shopName]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch-on-mount; load() sets its own loading flag
    void load();
  }, [load]);

  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  const boundCount = products.reduce(
    (n, p) => n + p.variants.filter((v) => v.bound).length,
    0
  );

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-slate-500">
          已在「智能选品」确认匹配的商品，按 Shopify 变体展开回显当前货源绑定（只读）。
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {!loading ? (
            <Badge variant="outline">
              {products.length} 商品 · {boundCount}/{variantCount} 变体已绑
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            刷新
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
          title="还没有已绑定的商品"
          description="请先到「智能选品」查找货源并确认匹配。绑定成功的商品会在这里按变体展开。"
          action={
            <Link href="/products">
              <Button size="sm" className="mt-1">
                去智能选品确认匹配
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {products.map((p) => (
            <SkuProductCard key={p.thirdPlatformItemId} product={p} />
          ))}
        </div>
      )}
    </>
  );
}

function SkuProductCard({ product }: { product: SkuProductOverview }) {
  const hasImage = Boolean(product.imageUrl);
  return (
    <article className="rounded-lg border border-slate-200 bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {hasImage ? (
            <Image
              src={product.imageUrl as string}
              alt={product.title ?? product.thirdPlatformItemId}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">
              无图
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold leading-5 text-slate-900">
            {product.title ?? "(无标题)"}
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {product.variants.length} 个变体
          </p>
        </div>
      </div>

      <div className="mt-2.5 divide-y divide-slate-100 border-t border-slate-100">
        {product.variants.map((v) => (
          <VariantRow key={v.thirdPlatformSkuId} variant={v} />
        ))}
      </div>
    </article>
  );
}

function VariantRow({ variant }: { variant: SkuVariant }) {
  const bound = variant.bound;
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800">
          {variant.optionLabel}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
          {variant.sku ? <span>SKU {variant.sku}</span> : null}
          <span>¥{formatPrice(variant.price)}</span>
        </div>
      </div>

      <div className="min-w-0 max-w-[62%] text-right">
        {bound ? (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
              <Badge variant="success">已绑</Badge>
              <span className="text-[11px] font-medium text-slate-700">
                1688 offer {bound.tangbuyProductId}
              </span>
              {bound.matchScore != null ? (
                <span className="text-[11px] text-emerald-600">
                  相似度 {formatScore(bound.matchScore)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 text-[11px] text-slate-400">
              {queryHint(bound) ? <span>{queryHint(bound)}</span> : null}
              {bound.detailUrl ? (
                <a
                  href={bound.detailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                >
                  <ExternalLink className="h-3 w-3" />
                  1688 详情
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <Badge variant="outline">未绑定</Badge>
        )}
      </div>
    </div>
  );
}
