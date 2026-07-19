"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useOnboarding } from "@/context/onboarding-context";
import { api, ApiError } from "@/lib/api";
import type { ShopMirrorProduct } from "@/lib/types";

function readableError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message;
    return `请求失败（${err.status}）：${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return "未知错误";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api.getShopProducts(shopName);
      setProducts(items);
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
            店铺在售商品（Shopify 同步镜像，只读）。关联货源能力即将接入。
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
            <ShopProductCard key={p.id} item={p} />
          ))}
        </div>
      )}
    </>
  );
}

function ShopProductCard({ item }: { item: ShopMirrorProduct }) {
  const active = (item.status ?? "").toUpperCase() === "ACTIVE";
  return (
    <article className="rounded-lg border border-slate-200 bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="grid grid-cols-[64px_1fr_160px] items-stretch gap-3">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
          {item.primaryImageUrl ? (
            <Image
              src={item.primaryImageUrl}
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
          <Badge variant="outline">待关联</Badge>
          <p className="text-[10px] leading-tight text-slate-400">
            关联能力即将接入
          </p>
        </div>
      </div>
    </article>
  );
}
