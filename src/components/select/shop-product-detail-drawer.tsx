"use client";

import { ThumbImage } from "@/components/ui/thumb-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api, readableError } from "@/lib/api";
import { isProductConflict } from "@/lib/shop-product-write";
import {
  formatShopProductDeleteVerifyMessage,
  verifyShopProductDeletions,
} from "@/lib/shop-product-delete-verify";
import {
  extractHtmlImageUrls,
  isFeaturedShopMedia,
  resolveShopMediaId,
} from "@/lib/shop-product-media";
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
  deletedVariantIds: string[];
  deletedMediaIds: string[];
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
    deletedVariantIds: [],
    deletedMediaIds: [],
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

function deletionsEqual(a: EditForm, b: EditForm): boolean {
  if (a.deletedVariantIds.length !== b.deletedVariantIds.length) return false;
  if (a.deletedMediaIds.length !== b.deletedMediaIds.length) return false;
  const av = [...a.deletedVariantIds].sort().join(",");
  const bv = [...b.deletedVariantIds].sort().join(",");
  if (av !== bv) return false;
  const am = [...a.deletedMediaIds].sort().join(",");
  const bm = [...b.deletedMediaIds].sort().join(",");
  return am === bm;
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
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<ShopProductDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [baseline, setBaseline] = useState<EditForm | null>(null);
  const [baselineUpdatedAt, setBaselineUpdatedAt] = useState<string | null>(
    null
  );
  const [conflict, setConflict] = useState(false);
  const [descriptionView, setDescriptionView] = useState<"edit" | "preview">(
    "edit"
  );

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
    setSaveNotice(null);
      setSaveNotice(null);
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
    setSaveNotice(null);
      setSaveNotice(null);
      setConflict(false);
      mirrorUpdatedAtRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);
    setSaveNotice(null);
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
      !variantsEqual(form.variants, baseline.variants) ||
      !deletionsEqual(form, baseline)
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
    setSaveNotice(null);
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
    setSaveNotice(null);
  };

  const removeVariant = (skuId: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      if (prev.variants.length <= 1) return prev;
      if (prev.deletedVariantIds.includes(skuId)) return prev;
      return {
        ...prev,
        variants: prev.variants.filter((v) => v.thirdPlatformSkuId !== skuId),
        deletedVariantIds: [...prev.deletedVariantIds, skuId],
      };
    });
    setSaveError(null);
    setSaveNotice(null);
  };

  const removeMedia = (mediaId: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      if (prev.deletedMediaIds.includes(mediaId)) return prev;
      return {
        ...prev,
        deletedMediaIds: [...prev.deletedMediaIds, mediaId],
      };
    });
    setSaveError(null);
    setSaveNotice(null);
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
    for (const cur of form.variants) {
      const base = baseline.variants.find(
        (v) => v.thirdPlatformSkuId === cur.thirdPlatformSkuId
      );
      if (!base) continue;
      const meta = detail?.variants.find(
        (v) => v.thirdPlatformSkuId === cur.thirdPlatformSkuId
      );
      const priceChanged = cur.price.trim() !== base.price.trim();
      const invChanged =
        cur.inventoryQuantity.trim() !== base.inventoryQuantity.trim();
      if (!priceChanged && !invChanged) continue;

      const row: ShopProductVariantUpdatePayload = {
        thirdPlatformSkuId: cur.thirdPlatformSkuId,
      };
      if (priceChanged) {
        if (!cur.price.trim()) {
          return {
            ok: false,
            error: `变体价格不能为空（${optionLabel(meta ?? {})}）`,
          };
        }
        const n = Number(cur.price.trim());
        if (!Number.isFinite(n) || n < 0) {
          return {
            ok: false,
            error: `变体价格须为 ≥ 0 的数字（${optionLabel(meta ?? {})}）`,
          };
        }
        row.price = n;
      }
      if (invChanged) {
        if (!cur.inventoryQuantity.trim()) {
          return {
            ok: false,
            error: `库存不能为空（${optionLabel(meta ?? {})}）`,
          };
        }
        const n = Number(cur.inventoryQuantity.trim());
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
          return {
            ok: false,
            error: `库存须为 ≥ 0 的整数（${optionLabel(meta ?? {})}）`,
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
    setSaveNotice(null);
    const pendingDeletes = {
      variantIds: [...form.deletedVariantIds],
      mediaIds: [...form.deletedMediaIds],
    };
    try {
      const saved = await api.updateShopProduct(shopName, {
        itemId,
        title,
        description: toHtml(form.description),
        status: form.status,
        ...(variantResult.variants.length
          ? {
              variants: variantResult.variants,
              ...(variantResult.variants[0]?.price != null
                ? { defaultVariantPrice: variantResult.variants[0].price }
                : {}),
            }
          : {}),
        ...(form.deletedVariantIds.length
          ? { deletedVariantIds: form.deletedVariantIds }
          : {}),
        ...(form.deletedMediaIds.length
          ? { deletedMediaIds: form.deletedMediaIds }
          : {}),
        expectedUpdatedAt: baselineUpdatedAt,
        ...(force ? { force: true } : {}),
      });
      applyDetail(saved, true);
      if (
        pendingDeletes.variantIds.length > 0 ||
        pendingDeletes.mediaIds.length > 0
      ) {
        const verify = verifyShopProductDeletions(
          saved,
          pendingDeletes.variantIds,
          pendingDeletes.mediaIds
        );
        const notice = formatShopProductDeleteVerifyMessage(verify);
        if (notice) setSaveNotice(notice);
      }
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
  const visibleMedia =
    detail?.media.filter(
      (m) => !form?.deletedMediaIds.includes(resolveShopMediaId(m))
    ) ?? [];
  const htmlDetailImages = extractHtmlImageUrls(detail?.description);
  const descriptionHtml = form?.description.trim()
    ? toHtml(form.description)
    : detail?.description?.trim() || "";

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
              编辑并同步到 Shopify · 支持删除多余 SKU / 商品图
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
                    <ThumbImage
                      src={hero}
                      alt={detail.title ?? ""}
                      fill
                      sizes="96px"
                      pixelWidth={192}
                      className="object-cover"
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
                <Field label="描述">
                  <div className="mb-2 flex gap-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                        descriptionView === "edit"
                          ? "bg-brand-soft text-brand-strong"
                          : "text-ink-subtle hover:bg-surface-muted"
                      )}
                      onClick={() => setDescriptionView("edit")}
                    >
                      编辑文本
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10px] font-medium",
                        descriptionView === "preview"
                          ? "bg-brand-soft text-brand-strong"
                          : "text-ink-subtle hover:bg-surface-muted"
                      )}
                      onClick={() => setDescriptionView("preview")}
                    >
                      预览 HTML
                    </button>
                  </div>
                  {descriptionView === "edit" ? (
                    <textarea
                      value={form.description}
                      onChange={(e) => patchForm({ description: e.target.value })}
                      disabled={saving}
                      rows={5}
                      className="w-full rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                      placeholder="保存时转为 HTML 段落"
                    />
                  ) : (
                    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-muted/30 px-3 py-2">
                      {descriptionHtml ? (
                        <div
                          className="prose prose-sm max-w-none text-ink [&_img]:my-2 [&_img]:max-h-48 [&_img]:rounded-md"
                          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                        />
                      ) : (
                        <p className="text-xs text-ink-subtle">暂无详情内容</p>
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] leading-snug text-ink-subtle">
                    Shopify 详情底层为 HTML。文内嵌的图片属于详情图，与下方「商品图库」分开管理；详情图删除将在下一步支持。
                  </p>
                </Field>
              </section>

              <section>
                <h3 className="text-xs font-semibold text-ink">
                  变体价格 / 库存（{form.variants.length}）
                </h3>
                <p className="mt-1 text-[11px] text-ink-subtle">
                  库存写入店铺第一个启用地点；未追踪库存的变体会自动开启追踪。至少保留 1 个变体。
                </p>
                {form.deletedVariantIds.length > 0 ? (
                  <p className="mt-1 text-[11px] text-amber-800">
                    已标记删除 {form.deletedVariantIds.length} 个变体，保存后同步到 Shopify。
                  </p>
                ) : null}
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
                          <th className="w-8 px-1 py-1.5" aria-label="删除" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((row) => {
                          const meta = detail.variants.find(
                            (v) => v.thirdPlatformSkuId === row.thirdPlatformSkuId
                          );
                          const canDelete = form.variants.length > 1;
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
                              <td className="px-1 py-1 text-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 px-0 text-ink-subtle hover:text-red-600"
                                  disabled={!canDelete || saving}
                                  title={
                                    canDelete
                                      ? "删除此变体"
                                      : "至少保留一个变体"
                                  }
                                  aria-label={
                                    canDelete
                                      ? `删除变体 ${optionLabel(meta ?? {})}`
                                      : "无法删除最后一个变体"
                                  }
                                  onClick={() =>
                                    removeVariant(row.thirdPlatformSkuId)
                                  }
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
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
              {saveNotice ? (
                <div className="rounded-[var(--radius-control)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  {saveNotice}
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
    setSaveNotice(null);
      setSaveNotice(null);
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
                    商品图库（{visibleMedia.length}
                    {form.deletedMediaIds.length > 0
                      ? ` · 待删 ${form.deletedMediaIds.length}`
                      : ""}
                    ）
                  </h3>
                  <p className="mt-1 text-[10px] leading-snug text-ink-subtle">
                    此处为 Shopify 商品媒体（主图 / 附图），保存后从店铺删除。
                  </p>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {detail.media.map((m, index) => {
                      const mediaId = resolveShopMediaId(m);
                      const pendingDelete = form.deletedMediaIds.includes(mediaId);
                      if (pendingDelete) return null;
                      const featured = isFeaturedShopMedia(m, index);
                      return (
                      <div
                        key={mediaId}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted",
                          featured && "ring-2 ring-brand/30"
                        )}
                      >
                        {m.url ? (
                          <ThumbImage
                            src={m.url}
                            alt={m.alt ?? ""}
                            fill
                            sizes="120px"
                            pixelWidth={240}
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : null}
                        {featured ? (
                          <span className="absolute left-1 top-1 rounded bg-ink/70 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            主图
                          </span>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="absolute right-1 top-1 h-7 w-7 px-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
                          disabled={saving}
                          title="从 Shopify 删除此图片"
                          aria-label="删除商品图片"
                          onClick={() => removeMedia(mediaId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                    })}
                  </div>
                </section>
              ) : null}

              {htmlDetailImages.length > 0 ? (
                <section>
                  <h3 className="text-xs font-semibold text-ink">
                    详情内嵌图（{htmlDetailImages.length}）
                  </h3>
                  <p className="mt-1 text-[10px] leading-snug text-ink-subtle">
                    这些图片写在描述 HTML 里，当前只读展示；删除详情图将在下一步支持。
                  </p>
                  <div className="mt-1.5 grid grid-cols-4 gap-2">
                    {htmlDetailImages.map((url) => (
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
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
