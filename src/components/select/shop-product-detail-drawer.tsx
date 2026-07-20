"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError, api, readableError } from "@/lib/api";
import type {
  ShopProductDetail,
  ShopProductVariantUpdatePayload,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const POLL_MS = 8000;

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

interface VariantEdit {
  thirdPlatformSkuId: string;
  price: string;
  inventoryQuantity: string;
}

interface EditForm {
  title: string;
  description: string;
  status: string;
  variants: VariantEdit[];
}

function formFromDetail(d: ShopProductDetail): EditForm {
  return {
    title: d.title ?? "",
    description: stripHtml(d.description),
    status: (d.status ?? "ACTIVE").toUpperCase(),
    variants: (d.variants ?? []).map((v) => ({
      thirdPlatformSkuId: v.thirdPlatformSkuId,
      price: v.price != null ? String(v.price) : "",
      inventoryQuantity:
        v.inventoryQuantity != null ? String(v.inventoryQuantity) : "",
    })),
  };
}

function sameUpdatedAt(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta === tb;
  return a === b;
}

function isProductConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = err.body;
  if (body && typeof body === "object" && body !== null && "code" in body) {
    return (body as { code?: unknown }).code === "PRODUCT_CONFLICT";
  }
  return /PRODUCT_CONFLICT|updated elsewhere|force overwrite/i.test(err.message);
}

function variantsEqual(a: VariantEdit[], b: VariantEdit[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].thirdPlatformSkuId !== b[i].thirdPlatformSkuId ||
      a[i].price !== b[i].price ||
      a[i].inventoryQuantity !== b[i].inventoryQuantity
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Shopify product detail drawer — Phase 2–4: edit + conflict UX + multi-variant write-back.
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
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopProductDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [baseline, setBaseline] = useState<EditForm | null>(null);
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | null>(
    null
  );
  const [conflict, setConflict] = useState(false);

  const dirtyRef = useRef(false);
  const mirrorUpdatedAtRef = useRef<string | null | undefined>(null);
  const savingRef = useRef(false);

  const applyDetail = (d: ShopProductDetail, resetForm: boolean) => {
    setDetail(d);
    mirrorUpdatedAtRef.current = d.updatedAt;
    if (resetForm) {
      const next = formFromDetail(d);
      setBaseline(next);
      setForm(next);
      setBaselineUpdatedAt(d.updatedAt ?? null);
      setConflict(false);
      setSaveError(null);
    }
  };

  useEffect(() => {
    if (!open || !itemId) {
      setDetail(null);
      setForm(null);
      setBaseline(null);
      setBaselineUpdatedAt(null);
      setError(null);
      setSaveError(null);
      setConflict(false);
      mirrorUpdatedAtRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    setConflict(false);
    api
      .getShopProductDetail(shopName, itemId)
      .then((d) => {
        if (cancelled) return;
        applyDetail(d, true);
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
      !variantsEqual(form.variants, baseline.variants)
    );
  }, [form, baseline]);

  dirtyRef.current = dirty;
  savingRef.current = saving;

  useEffect(() => {
    if (!open || !itemId || loading || error) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled || savingRef.current) return;
      try {
        const d = await api.getShopProductDetail(shopName, itemId);
        if (cancelled) return;
        if (sameUpdatedAt(d.updatedAt, mirrorUpdatedAtRef.current)) return;
        if (dirtyRef.current) {
          setDetail(d);
          mirrorUpdatedAtRef.current = d.updatedAt;
          setConflict(true);
        } else {
          applyDetail(d, true);
        }
      } catch {
        // ignore poll errors
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, shopName, itemId, loading, error]);

  const patchForm = (patch: Partial<EditForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveError(null);
  };

  const patchVariant = (
    skuId: string,
    patch: Partial<Pick<VariantEdit, "price" | "inventoryQuantity">>
  ) => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        variants: prev.variants.map((v) =>
          v.thirdPlatformSkuId === skuId ? { ...v, ...patch } : v
        ),
      };
    });
    setSaveError(null);
  };

  const handleReload = () => {
    if (!detail) return;
    applyDetail(detail, true);
    onSaved?.();
  };

  const buildVariantPayload = ():
    | { ok: true; variants: ShopProductVariantUpdatePayload[] }
    | { ok: false; error: string } => {
    if (!form || !baseline) return { ok: true, variants: [] };
    const out: ShopProductVariantUpdatePayload[] = [];
    for (let i = 0; i < form.variants.length; i++) {
      const cur = form.variants[i];
      const base = baseline.variants[i];
      if (!base || cur.thirdPlatformSkuId !== base.thirdPlatformSkuId) {
        return { ok: false, error: "变体列表已变化，请重新加载后再编辑" };
      }
      const priceChanged = cur.price.trim() !== base.price.trim();
      const invChanged =
        cur.inventoryQuantity.trim() !== base.inventoryQuantity.trim();
      if (!priceChanged && !invChanged) continue;

      const row: ShopProductVariantUpdatePayload = {
        thirdPlatformSkuId: cur.thirdPlatformSkuId,
      };
      if (priceChanged) {
        if (!cur.price.trim()) {
          return { ok: false, error: `变体价格不能为空（${cur.thirdPlatformSkuId}）` };
        }
        const n = Number(cur.price.trim());
        if (!Number.isFinite(n) || n < 0) {
          return {
            ok: false,
            error: `变体价格须为 ≥ 0 的数字（${optionLabel(
              detail?.variants?.[i] ?? {}
            )}）`,
          };
        }
        row.price = n;
      }
      if (invChanged) {
        if (!cur.inventoryQuantity.trim()) {
          return {
            ok: false,
            error: `库存不能为空（${optionLabel(detail?.variants?.[i] ?? {})}）`,
          };
        }
        const n = Number(cur.inventoryQuantity.trim());
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
          return {
            ok: false,
            error: `库存须为 ≥ 0 的整数（${optionLabel(
              detail?.variants?.[i] ?? {}
            )}）`,
          };
        }
        row.inventoryQuantity = n;
      }
      out.push(row);
    }
    return { ok: true, variants: out };
  };

  const handleSave = async (force = false) => {
    if (!form || !itemId || saving || !dirty) return;
    const title = form.title.trim();
    if (!title) {
      setSaveError("标题不能为空");
      return;
    }
    const variantResult = buildVariantPayload();
    if (!variantResult.ok) {
      setSaveError(variantResult.error);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.updateShopProduct(shopName, {
        itemId,
        title,
        description: toHtml(form.description),
        status: form.status,
        ...(variantResult.variants.length
          ? { variants: variantResult.variants }
          : {}),
        expectedUpdatedAt: baselineUpdatedAt,
        ...(force ? { force: true } : {}),
      });
      applyDetail(saved, true);
      onSaved?.();
    } catch (err) {
      if (isProductConflict(err)) {
        setConflict(true);
        setSaveError(
          "镜像已在其他处更新（Shopify 后台或 webhook）。可重新加载，或强制覆盖。"
        );
        try {
          const fresh = await api.getShopProductDetail(shopName, itemId);
          setDetail(fresh);
          mirrorUpdatedAtRef.current = fresh.updatedAt;
        } catch {
          // keep existing detail
        }
      } else {
        setSaveError(readableError(err));
      }
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
              阶段 4 · 多变体价格 / 库存写回
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
              {conflict ? (
                <div className="rounded-[var(--radius-control)] border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                  <p className="font-medium">检测到外部更新</p>
                  <p className="mt-1 text-amber-900/90">
                    Shopify 后台或 webhook
                    已更新此商品。重新加载会丢弃本地未保存改动；强制保存会覆盖远端。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={saving}
                      onClick={handleReload}
                    >
                      重新加载
                    </Button>
                    <Button
                      size="sm"
                      disabled={saving || !dirty}
                      onClick={() => void handleSave(true)}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      强制覆盖保存
                    </Button>
                  </div>
                </div>
              ) : null}

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
                <Field label="描述（纯文本，保存时转为 HTML）">
                  <textarea
                    value={form.description}
                    onChange={(e) => patchForm({ description: e.target.value })}
                    disabled={saving}
                    rows={5}
                    className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                  />
                </Field>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-ink">
                  变体价格 / 库存（{form.variants.length}）
                </h3>
                <p className="mt-1 text-[11px] text-ink-subtle">
                  库存写入店铺第一个启用地点；未追踪库存的变体会自动开启追踪。
                </p>
                {form.variants.length === 0 ? (
                  <p className="mt-1.5 text-xs text-ink-subtle">
                    暂无变体镜像，请先同步商品
                  </p>
                ) : (
                  <div className="mt-1.5 overflow-x-auto rounded-[var(--radius-control)] border border-hairline">
                    <table className="w-full min-w-[22rem] text-left text-[11px]">
                      <thead className="bg-surface-muted text-ink-muted">
                        <tr>
                          <th className="px-2.5 py-1.5 font-medium">规格</th>
                          <th className="px-2.5 py-1.5 font-medium">SKU</th>
                          <th className="px-2.5 py-1.5 font-medium">
                            价格（{detail.currency || "币种"}）
                          </th>
                          <th className="px-2.5 py-1.5 font-medium">库存</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((row, idx) => {
                          const meta = detail.variants[idx];
                          return (
                            <tr
                              key={row.thirdPlatformSkuId}
                              className="border-t border-hairline"
                            >
                              <td className="max-w-[7rem] truncate px-2.5 py-1.5 text-ink">
                                {meta ? optionLabel(meta) : "—"}
                              </td>
                              <td className="max-w-[5rem] truncate px-2.5 py-1.5 text-ink-muted">
                                {meta?.sku || "—"}
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  value={row.price}
                                  onChange={(e) =>
                                    patchVariant(row.thirdPlatformSkuId, {
                                      price: e.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  inputMode="decimal"
                                  className="h-8 text-xs"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <Input
                                  value={row.inventoryQuantity}
                                  onChange={(e) =>
                                    patchVariant(row.thirdPlatformSkuId, {
                                      inventoryQuantity: e.target.value,
                                    })
                                  }
                                  disabled={saving}
                                  inputMode="numeric"
                                  className="h-8 text-xs"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

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
                    if (conflict && detail) {
                      applyDetail(detail, true);
                      return;
                    }
                    if (baseline) setForm(baseline);
                    setSaveError(null);
                  }}
                >
                  {conflict ? "放弃并重新加载" : "重置"}
                </Button>
                <Button
                  size="sm"
                  disabled={!dirty || saving || conflict}
                  onClick={() => void handleSave(false)}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {saving ? "同步中…" : "保存并同步到 Shopify"}
                </Button>
              </div>

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
