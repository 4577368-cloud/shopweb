"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, readableError } from "@/lib/api";
import {
  buildManualMatchConfirmRequest,
  finalizeManualMatchBinding,
  loadManualMatchProduct,
} from "@/lib/manual-image-match";
import { mapItemGetToSourceSkuMatrix } from "@/lib/source-sku-matrix";
import type { ImageBindingView } from "@/lib/types";
import type { ItemGetProduct } from "@/lib/tangbuy-mall-gateway";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import { cn } from "@/lib/utils";

function formatCny(price?: number | null): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return `¥${price.toFixed(2)}`;
}

import { mapImageMatchConfirmError } from "@/lib/batch-link/match-errors";

export function ManualMatchDrawer({
  open,
  shopName,
  thirdPlatformItemId,
  onClose,
  onBound,
  showToast,
}: {
  open: boolean;
  shopName: string;
  thirdPlatformItemId: string;
  onClose: () => void;
  onBound: (view: ImageBindingView) => void;
  showToast: (message: string) => void;
}) {
  const [linkInput, setLinkInput] = useState("");
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemGetProduct | null>(null);
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLinkInput("");
    setResolvedUrl(null);
    setDetail(null);
    setSelectedSkuId(null);
    setLoading(false);
    setSaving(false);
    setLoadError(null);
    setSaveError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, reset, saving]);

  const skuRows = useMemo(
    () => (detail ? mapItemGetToSourceSkuMatrix(detail) : []),
    [detail]
  );

  const selectedSku =
    skuRows.find((row) => row.skuId === selectedSkuId) ?? skuRows[0] ?? null;

  const title =
    detail?.itemNameTrans?.trim() ||
    detail?.itemName?.trim() ||
    "货源商品";

  const hero =
    selectedSku?.imageUrl?.trim() ||
    detail?.productImageList?.find((u) => u?.trim())?.trim() ||
    null;

  const gallery = useMemo(() => {
    const urls: string[] = [];
    const seen = new Set<string>();
    const push = (raw?: string | null) => {
      const u = raw?.trim();
      if (!u || seen.has(u)) return;
      seen.add(u);
      urls.push(u);
    };
    push(hero);
    for (const u of detail?.productImageList ?? []) push(u);
    for (const row of skuRows) push(row.imageUrl);
    return urls.slice(0, 12);
  }, [detail?.productImageList, hero, skuRows]);

  const priceRange = useMemo(() => {
    const prices = skuRows
      .map((r) => r.procurementPrice)
      .filter((p): p is number => p != null && Number.isFinite(p));
    if (!prices.length) return null;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatCny(min) : `${formatCny(min)} – ${formatCny(max)}`;
  }, [skuRows]);

  const loadProduct = async () => {
    if (loading) return;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setDetail(null);
    setSelectedSkuId(null);
    setResolvedUrl(null);
    try {
      const loaded = await loadManualMatchProduct(linkInput);
      const rows = mapItemGetToSourceSkuMatrix(loaded.detail);
      setResolvedUrl(loaded.normalizedUrl);
      setDetail(loaded.detail);
      setSelectedSkuId(rows[0]?.skuId ?? null);
    } catch (err) {
      setLoadError(readableError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!detail || !resolvedUrl || !selectedSkuId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const req = buildManualMatchConfirmRequest({
        shopName,
        thirdPlatformItemId,
        detail,
        productUrl: resolvedUrl,
        selectedSkuId,
      });
      const view = await api.confirmImageMatch(req);
      onBound(
        await finalizeManualMatchBinding(shopName, thirdPlatformItemId, view, req)
      );
      showToast("已人工匹配货源");
      onClose();
    } catch (err) {
      setSaveError(mapImageMatchConfirmError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

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
              手动匹配货源
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-ink">
              {detail ? title : "粘贴发现新品链接"}
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              使用 Tangbuy 发现新品中的商品链接，确认后替换当前推荐货源
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            disabled={saving}
            aria-label="关闭手动匹配"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!gatewayReady ? (
            <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              商城货源暂不可用，无法手动匹配。请稍后重试或联系管理员。
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-2">
                <Field label="商品链接">
                  <div className="flex gap-2">
                    <Input
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      disabled={loading || saving}
                      placeholder="https://www.tangbuy.cc/product?dataSource=…&id=…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void loadProduct();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      disabled={!linkInput.trim() || loading || saving}
                      onClick={() => void loadProduct()}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "解析"
                      )}
                    </Button>
                  </div>
                </Field>
                <p className="text-[11px] text-ink-subtle">
                  请粘贴「发现新品」中的 Tangbuy 商品详情链接
                </p>
                {loadError ? (
                  <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {loadError}
                  </div>
                ) : null}
              </section>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  读取货源详情…
                </div>
              ) : detail ? (
                <div className="space-y-5">
                  <div className="flex gap-3">
                    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted">
                      {hero ? (
                        <ThumbImage
                          src={hero}
                          alt={title}
                          fill
                          sizes="96px"
                          pixelWidth={192}
                          className="object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-ink-subtle">
                          <ImageOff className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5 text-xs">
                      <p className="line-clamp-3 text-sm font-semibold text-ink">
                        {title}
                      </p>
                      <p className="font-medium text-ink">
                        采购价 {priceRange ?? "—"}
                      </p>
                      {resolvedUrl ? (
                        <p className="break-all text-[11px] text-ink-subtle">
                          {resolvedUrl}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {gallery.length > 1 ? (
                    <section>
                      <h3 className="text-xs font-semibold text-ink">
                        图片（{gallery.length}）
                      </h3>
                      <div className="mt-1.5 grid grid-cols-4 gap-2">
                        {gallery.map((url) => (
                          <div
                            key={url}
                            className="relative aspect-square overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted"
                          >
                            <ThumbImage
                              src={url}
                              alt=""
                              fill
                              sizes="120px"
                              pixelWidth={240}
                              className="object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  <section>
                    <h3 className="text-xs font-semibold text-ink">
                      SKU 规格（{skuRows.length}）
                    </h3>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      选择默认关联规格；保存后将替换右侧推荐货源
                    </p>
                    <div className="mt-1.5 overflow-x-auto rounded-[var(--radius-control)] border border-hairline">
                      <table className="w-full min-w-[20rem] text-left text-[11px]">
                        <thead className="bg-surface-muted text-ink-muted">
                          <tr>
                            <th className="px-2.5 py-1.5 font-medium">选用</th>
                            <th className="px-2.5 py-1.5 font-medium">规格</th>
                            <th className="px-2.5 py-1.5 font-medium">SKU</th>
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
                                    name="manual-match-sku"
                                    checked={selected}
                                    onChange={() => setSelectedSkuId(row.skuId)}
                                    disabled={saving}
                                  />
                                </td>
                                <td className="px-2.5 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-hairline bg-surface-muted">
                                      {row.imageUrl ? (
                                        <ThumbImage
                                          src={row.imageUrl}
                                          alt={row.specLabel}
                                          fill
                                          sizes="40px"
                                          pixelWidth={80}
                                          className="object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="flex h-full items-center justify-center text-ink-subtle">
                                          <ImageOff className="h-3 w-3" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-ink">{row.specLabel}</span>
                                  </div>
                                </td>
                                <td className="px-2.5 py-2 font-mono text-[10px] text-ink-muted">
                                  {row.skuId}
                                </td>
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

                  {saveError ? (
                    <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {saveError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            size="sm"
            disabled={!detail || !selectedSkuId || saving || !gatewayReady}
            onClick={() => void handleSave()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? "保存中…" : "保存并关联"}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
