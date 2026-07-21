"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, readableError } from "@/lib/api";
import {
  buildManualMatchConfirmRequest,
  loadManualMatchProduct,
  resolveCatalogProductUrl,
  withManualMatchBindingMeta,
} from "@/lib/manual-image-match";
import { mapItemGetToSourceSkuMatrix } from "@/lib/source-sku-matrix";
import type { CatalogRecommendation, ImageBindingView, ShopMirrorProduct } from "@/lib/types";
import type { ItemGetProduct } from "@/lib/tangbuy-mall-gateway";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import { cn } from "@/lib/utils";

function formatCny(price?: number | null): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return `¥${price.toFixed(2)}`;
}

function formatShopPrice(
  min?: number | null,
  max?: number | null,
  currency?: string | null
): string {
  if (min == null) return "—";
  const cur = currency?.trim() || "";
  if (max != null && max !== min) {
    return `${min.toFixed(2)}–${max.toFixed(2)}${cur ? ` ${cur}` : ""}`;
  }
  return `${min.toFixed(2)}${cur ? ` ${cur}` : ""}`;
}

function imageMatchError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "确认关联失败";
}

export function CatalogLinkDrawer({
  open,
  catalogItem,
  shopName,
  onClose,
  onLinked,
  showToast,
}: {
  open: boolean;
  catalogItem: CatalogRecommendation | null;
  shopName: string;
  onClose: () => void;
  onLinked?: (thirdPlatformItemId: string) => void;
  showToast: (message: string) => void;
}) {
  const [products, setProducts] = useState<ShopMirrorProduct[]>([]);
  const [bindings, setBindings] = useState<Record<string, ImageBindingView>>({});
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const [detail, setDetail] = useState<ItemGetProduct | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProducts([]);
    setBindings({});
    setListLoading(false);
    setListError(null);
    setQuery("");
    setSelectedItemId(null);
    setDetail(null);
    setResolvedUrl(null);
    setDetailLoading(false);
    setDetailError(null);
    setSelectedSkuId(null);
    setSaving(false);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!open || !catalogItem) {
      reset();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, catalogItem, onClose, reset, saving]);

  useEffect(() => {
    if (!open || !catalogItem) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    void Promise.all([
      api.getShopProducts(shopName),
      api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
    ])
      .then(([items, bound]) => {
        if (cancelled) return;
        setProducts(items);
        const map: Record<string, ImageBindingView> = {};
        for (const b of bound) {
          if (b.thirdPlatformItemId) map[b.thirdPlatformItemId] = b;
        }
        setBindings(map);
      })
      .catch((err) => {
        if (!cancelled) setListError(readableError(err));
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalogItem, shopName]);

  useEffect(() => {
    if (!open || !catalogItem || !isMallGatewayConfigured()) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setResolvedUrl(null);
    setSelectedSkuId(null);
    const productUrl = resolveCatalogProductUrl(catalogItem);
    void loadManualMatchProduct(productUrl)
      .then((loaded) => {
        if (cancelled) return;
        const rows = mapItemGetToSourceSkuMatrix(loaded.detail);
        setResolvedUrl(loaded.normalizedUrl);
        setDetail(loaded.detail);
        setSelectedSkuId(rows[0]?.skuId ?? null);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(readableError(err));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalogItem]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.title ?? "").toLowerCase().includes(q));
  }, [products, query]);

  const skuRows = useMemo(
    () => (detail ? mapItemGetToSourceSkuMatrix(detail) : []),
    [detail]
  );

  const sourceTitle =
    detail?.itemNameTrans?.trim() ||
    detail?.itemName?.trim() ||
    catalogItem?.title ||
    "货源商品";

  const sourceHero =
    catalogItem?.imageUrl?.trim() ||
    detail?.productImageList?.find((u) => u?.trim())?.trim() ||
    null;

  const handleSave = async () => {
    if (!catalogItem || !selectedItemId || !detail || !resolvedUrl || !selectedSkuId || saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const req = buildManualMatchConfirmRequest({
        shopName,
        thirdPlatformItemId: selectedItemId,
        detail,
        productUrl: resolvedUrl,
        selectedSkuId,
      });
      const view = await api.confirmImageMatch(req);
      withManualMatchBindingMeta(view, req.offerTitle);
      showToast("已关联货源");
      onLinked?.(selectedItemId);
      onClose();
    } catch (err) {
      setSaveError(imageMatchError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !catalogItem) return null;

  const gatewayReady = isMallGatewayConfigured();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-ink/30"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-hairline bg-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              关联到在售商品
            </p>
            <h2 className="mt-0.5 line-clamp-2 text-base font-semibold text-ink">
              {sourceTitle}
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              选择店铺商品并确认，关联逻辑与手动匹配一致
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭关联抽屉"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!gatewayReady ? (
            <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              商城货源暂不可用，无法关联。请稍后重试或联系管理员。
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex gap-3 rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 p-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
                  {sourceHero ? (
                    <Image
                      src={sourceHero}
                      alt={sourceTitle}
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-subtle">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <p className="line-clamp-2 text-sm font-semibold text-ink">
                    {sourceTitle}
                  </p>
                  {catalogItem.price != null ? (
                    <p className="mt-1 text-ink-muted">
                      采购成本 ≈ {formatCny(catalogItem.price)}
                    </p>
                  ) : null}
                </div>
              </div>

              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  读取货源 SKU…
                </div>
              ) : detailError ? (
                <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {detailError}
                </div>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-ink">在售商品</h3>
                  <span className="text-[11px] text-ink-subtle">
                    {filteredProducts.length} 个
                  </span>
                </div>
                <Field label="搜索">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      disabled={listLoading || saving}
                      placeholder="按商品标题搜索"
                      className="pl-8"
                    />
                  </div>
                </Field>
                {listError ? (
                  <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {listError}
                  </div>
                ) : listLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-ink-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载在售商品…
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink-subtle">
                    暂无匹配的在售商品
                  </p>
                ) : (
                  <div className="max-h-[14rem] space-y-1.5 overflow-y-auto rounded-[var(--radius-control)] border border-hairline p-1.5">
                    {filteredProducts.map((product) => {
                      const selected = selectedItemId === product.thirdPlatformItemId;
                      const bound = bindings[product.thirdPlatformItemId]?.bound;
                      return (
                        <button
                          key={product.thirdPlatformItemId}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border px-2 py-2 text-left transition-colors",
                            selected
                              ? "border-sky-300 bg-sky-50/70"
                              : "border-transparent hover:bg-surface-muted/70"
                          )}
                          onClick={() => setSelectedItemId(product.thirdPlatformItemId)}
                          disabled={saving}
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded border border-hairline bg-surface-muted">
                            {product.primaryImageUrl ? (
                              <Image
                                src={product.primaryImageUrl}
                                alt={product.title ?? ""}
                                fill
                                sizes="44px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[9px] text-ink-subtle">
                                无图
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium text-ink">
                              {product.title ?? "(无标题)"}
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-muted">
                              {formatShopPrice(
                                product.minPrice,
                                product.maxPrice,
                                product.currency
                              )}
                            </p>
                          </div>
                          {bound ? (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                              已关联
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {detail && skuRows.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold text-ink">
                    SKU 规格（{skuRows.length}）
                  </h3>
                  <p className="mt-1 text-[11px] text-ink-subtle">
                    选择默认关联规格
                  </p>
                  <div className="mt-1.5 overflow-x-auto rounded-[var(--radius-control)] border border-hairline">
                    <table className="w-full min-w-[20rem] text-left text-[11px]">
                      <thead className="bg-surface-muted text-ink-muted">
                        <tr>
                          <th className="px-2.5 py-1.5 font-medium">选用</th>
                          <th className="px-2.5 py-1.5 font-medium">规格</th>
                          <th className="px-2.5 py-1.5 font-medium">采购价</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skuRows.map((row) => {
                          const selected = row.skuId === selectedSkuId;
                          return (
                            <tr
                              key={row.skuId}
                              className={cn(
                                "cursor-pointer border-t border-hairline",
                                selected ? "bg-sky-50/60" : null
                              )}
                              onClick={() => setSelectedSkuId(row.skuId)}
                            >
                              <td className="px-2.5 py-2">
                                <input
                                  type="radio"
                                  name="catalog-link-sku"
                                  checked={selected}
                                  onChange={() => setSelectedSkuId(row.skuId)}
                                  disabled={saving}
                                />
                              </td>
                              <td className="px-2.5 py-2 text-ink">{row.specLabel}</td>
                              <td className="px-2.5 py-2 font-medium text-ink">
                                {formatCny(row.procurementPrice)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {saveError ? (
                <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {saveError}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button size="sm" variant="secondary" disabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={
              !selectedItemId ||
              !detail ||
              !selectedSkuId ||
              saving ||
              !gatewayReady ||
              detailLoading ||
              Boolean(detailError)
            }
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "关联中…" : "确认关联"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
