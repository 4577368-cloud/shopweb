"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

function stripHtml(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
}

interface EditForm {
  title: string;
  description: string;
  status: string;
  defaultVariantPrice: string;
}

/**
 * Shopify product detail drawer — Phase 2: edit title/description/status/default price and write back.
 */
export function ShopProductDetailDrawer({
  open,
  shopName,
  itemId,
  onClose,
  onSaved,
}: {
  open: boolean;
  shopName: string;
  itemId: string | null;
  onClose: () => void;
  /** Called after a successful Shopify write-back so the list can refresh. */
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopProductDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [baseline, setBaseline] = useState<EditForm | null>(null);

  useEffect(() => {
    if (!open || !itemId) {
      setDetail(null);
      setForm(null);
      setBaseline(null);
      setError(null);
      setSaveError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    api
      .getShopProductDetail(shopName, itemId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        const firstPrice = d.variants?.[0]?.price;
        const next: EditForm = {
          title: d.title ?? "",
          description: stripHtml(d.description),
          status: (d.status ?? "ACTIVE").toUpperCase(),
          defaultVariantPrice:
            firstPrice != null ? String(firstPrice) : "",
        };
        setForm(next);
        setBaseline(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          setForm(null);
          setBaseline(null);
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
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, saving]);

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return (
      form.title !== baseline.title ||
      form.description !== baseline.description ||
      form.status !== baseline.status ||
      form.defaultVariantPrice !== baseline.defaultVariantPrice
    );
  }, [form, baseline]);

  const patchForm = (patch: Partial<EditForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!form || !itemId || saving || !dirty) return;
    const title = form.title.trim();
    if (!title) {
      setSaveError("标题不能为空");
      return;
    }
    let price: number | null | undefined = undefined;
    const priceRaw = form.defaultVariantPrice.trim();
    if (priceRaw !== (baseline?.defaultVariantPrice ?? "").trim()) {
      if (!priceRaw) {
        setSaveError("默认变体价格不能为空");
        return;
      }
      const n = Number(priceRaw);
      if (!Number.isFinite(n) || n < 0) {
        setSaveError("默认变体价格须为 ≥ 0 的数字");
        return;
      }
      price = n;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateShopProduct(shopName, {
        itemId,
        title,
        description: toHtml(form.description),
        status: form.status,
        ...(price !== undefined ? { defaultVariantPrice: price } : {}),
      });
      setDetail(saved);
      const firstPrice = saved.variants?.[0]?.price;
      const next: EditForm = {
        title: saved.title ?? "",
        description: stripHtml(saved.description),
        status: (saved.status ?? "ACTIVE").toUpperCase(),
        defaultVariantPrice: firstPrice != null ? String(firstPrice) : "",
      };
      setForm(next);
      setBaseline(next);
      onSaved?.();
    } catch (err) {
      setSaveError(readableError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const active = (detail?.status ?? "").toUpperCase() === "ACTIVE";
  const hero =
    detail?.primaryImageUrl || detail?.media?.[0]?.url || null;

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
              Shopify 商品详情
            </p>
            <h2 className="mt-0.5 truncate text-base font-semibold text-ink">
              {detail?.title || (loading ? "加载中…" : "商品详情")}
            </h2>
            <p className="mt-1 text-[11px] text-ink-muted">
              阶段 2 · 可编辑并同步回 Shopify
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            disabled={saving}
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
          ) : detail && form ? (
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
                      <Badge variant={active ? "success" : "default"}>
                        {detail.status}
                      </Badge>
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
                  <p className="break-all text-[11px] text-ink-subtle">
                    {detail.thirdPlatformItemId}
                  </p>
                  {detail.updatedAt ? (
                    <p className="text-[11px] text-ink-subtle">
                      镜像更新：
                      {new Date(detail.updatedAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </p>
                  ) : null}
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-ink">可编辑并同步</h3>
                <Field label="标题">
                  <Input
                    value={form.title}
                    onChange={(e) => patchForm({ title: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="状态">
                  <Select
                    value={form.status}
                    onChange={(e) => patchForm({ status: e.target.value })}
                    disabled={saving}
                  >
                    <option value="ACTIVE">ACTIVE（在售）</option>
                    <option value="DRAFT">DRAFT（草稿）</option>
                    <option value="ARCHIVED">ARCHIVED（归档）</option>
                  </Select>
                </Field>
                <Field label={`默认变体价格（${detail.currency || "店铺币种"}）`}>
                  <Input
                    value={form.defaultVariantPrice}
                    onChange={(e) =>
                      patchForm({ defaultVariantPrice: e.target.value })
                    }
                    disabled={saving || (detail.variants?.length ?? 0) === 0}
                    inputMode="decimal"
                    placeholder={
                      (detail.variants?.length ?? 0) === 0
                        ? "无变体镜像，请先同步商品"
                        : undefined
                    }
                  />
                </Field>
                <Field label="描述（纯文本，保存时转为 HTML）">
                  <textarea
                    value={form.description}
                    onChange={(e) => patchForm({ description: e.target.value })}
                    disabled={saving}
                    rows={6}
                    className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                  />
                </Field>
                {saveError ? (
                  <div className="rounded-[var(--radius-control)] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {saveError}
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!dirty || saving}
                    onClick={() => {
                      if (baseline) setForm(baseline);
                      setSaveError(null);
                    }}
                  >
                    重置
                  </Button>
                  <Button
                    size="sm"
                    disabled={!dirty || saving}
                    onClick={() => void handleSave()}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {saving ? "同步中…" : "保存并同步到 Shopify"}
                  </Button>
                </div>
              </section>

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
                          <tr
                            key={v.thirdPlatformSkuId}
                            className="border-t border-hairline"
                          >
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
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
