"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, readableError } from "@/lib/api";
import type { ShopProductDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

function money(value?: number | null, currency?: string | null): string {
  if (value == null) return "—";
  const amount = Number(value).toFixed(2);
  return currency ? `${amount} ${currency}` : amount;
}

function optionLabel(v: {
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  title?: string | null;
}): string {
  const parts = [v.option1, v.option2, v.option3].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return v.title || "Default";
}

/**
 * Phase 1 read-only Shopify product detail drawer (local mirror only; no write-back yet).
 */
export function ShopProductDetailDrawer({
  open,
  shopName,
  itemId,
  onClose,
}: {
  open: boolean;
  shopName: string;
  itemId: string | null;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopProductDetail | null>(null);

  useEffect(() => {
    if (!open || !itemId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getShopProductDetail(shopName, itemId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          setError(readableError(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shopName, itemId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = (detail?.status ?? "").toUpperCase() === "ACTIVE";
  const hero =
    detail?.primaryImageUrl ||
    detail?.media?.[0]?.url ||
    null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-ink/30"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-lg flex-col border-l border-hairline bg-surface shadow-card">
        <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
              Shopify 商品详情
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-ink">
              {detail?.title || (loading ? "加载中…" : "商品详情")}
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              阶段 1 · 只读镜像（后续支持 Tangbuy 编辑并回写店铺）
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            aria-label="关闭详情"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              读取商品镜像…
            </div>
          ) : error ? (
            <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="flex gap-3">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
                  {hero ? (
                    <Image
                      src={hero}
                      alt={detail.title ?? ""}
                      fill
                      className="object-cover"
                      unoptimized
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] text-ink-subtle">
                      无图
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {detail.status ? (
                      <Badge variant={active ? "success" : "default"}>{detail.status}</Badge>
                    ) : null}
                    <span className="text-ink-muted">
                      {money(detail.minPrice, detail.currency)}
                      {detail.maxPrice != null &&
                      detail.minPrice != null &&
                      detail.maxPrice !== detail.minPrice
                        ? ` – ${money(detail.maxPrice, detail.currency)}`
                        : ""}
                    </span>
                  </div>
                  {detail.handle ? (
                    <p className="truncate text-ink-muted">handle: {detail.handle}</p>
                  ) : null}
                  <p className="break-all text-[11px] text-ink-subtle">
                    {detail.thirdPlatformItemId}
                  </p>
                  {detail.updatedAt ? (
                    <p className="text-[11px] text-ink-subtle">
                      镜像更新：{new Date(detail.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                    </p>
                  ) : null}
                </div>
              </div>

              {detail.description ? (
                <section>
                  <h3 className="text-xs font-semibold text-ink">描述</h3>
                  <div
                    className="mt-1.5 max-h-40 overflow-y-auto rounded-[var(--radius-control)] border border-hairline bg-surface-muted/40 px-3 py-2 text-xs leading-5 text-ink-muted prose-sm"
                    dangerouslySetInnerHTML={{ __html: detail.description }}
                  />
                </section>
              ) : null}

              <section>
                <h3 className="text-xs font-semibold text-ink">
                  变体（{detail.variants?.length ?? 0}）
                </h3>
                {(detail.variants?.length ?? 0) === 0 ? (
                  <p className="mt-1.5 text-xs text-ink-subtle">暂无变体镜像</p>
                ) : (
                  <div className="mt-1.5 overflow-hidden rounded-[var(--radius-control)] border border-hairline">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-surface-muted text-ink-muted">
                        <tr>
                          <th className="px-2.5 py-1.5 font-medium">规格</th>
                          <th className="px-2.5 py-1.5 font-medium">SKU</th>
                          <th className="px-2.5 py-1.5 font-medium">价格</th>
                          <th className="px-2.5 py-1.5 font-medium">库存</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.variants.map((v) => (
                          <tr key={v.thirdPlatformSkuId} className="border-t border-hairline">
                            <td className="max-w-[8rem] truncate px-2.5 py-1.5 text-ink">
                              {optionLabel(v)}
                            </td>
                            <td className="max-w-[6rem] truncate px-2.5 py-1.5 text-ink-muted">
                              {v.sku || "—"}
                            </td>
                            <td className="px-2.5 py-1.5 text-ink">
                              {money(v.price, detail.currency)}
                            </td>
                            <td className="px-2.5 py-1.5 text-ink-muted">
                              {v.inventoryQuantity ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {(detail.media?.length ?? 0) > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold text-ink">
                    图片（{detail.media.length}）
                  </h3>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {detail.media.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted"
                        )}
                      >
                        {m.url ? (
                          <Image
                            src={m.url}
                            alt={m.alt ?? ""}
                            fill
                            className="object-cover"
                            unoptimized
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {(detail.minWeightGrams != null || detail.maxWeightGrams != null) &&
              (detail.minWeightGrams || detail.maxWeightGrams) ? (
                <section>
                  <h3 className="text-xs font-semibold text-ink">重量</h3>
                  <p className="mt-1 text-xs text-ink-muted">
                    {detail.minWeightGrams ?? "—"} – {detail.maxWeightGrams ?? "—"} g
                  </p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
