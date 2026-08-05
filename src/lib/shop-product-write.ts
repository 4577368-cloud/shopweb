import {
  listingPricesCloseEnough,
  patchMirrorProductListingPrice,
} from "@/lib/ai-field-edit-feedback";
import type { ListingPriceScope } from "@/lib/agents/products/command-schema";
import { api, ApiError } from "@/lib/api";
import type { ShopMirrorProduct, ShopProductDetail } from "@/lib/types";

export type ListingPriceWriteTarget =
  | { scope: "all" }
  | { scope: "one"; thirdPlatformSkuId: string };

export function isProductConflict(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  const body = err.body;
  if (body && typeof body === "object" && body !== null && "code" in body) {
    return (body as { code?: unknown }).code === "PRODUCT_CONFLICT";
  }
  return /PRODUCT_CONFLICT|updated elsewhere|force overwrite/i.test(err.message);
}

export function listingExtremaFromDetail(detail: ShopProductDetail): {
  minPrice: number | null;
  maxPrice: number | null;
} {
  const prices =
    detail.variants
      ?.map((v) => v.price)
      .filter((p): p is number => p != null && Number.isFinite(p)) ?? [];
  if (prices.length > 0) {
    return { minPrice: Math.min(...prices), maxPrice: Math.max(...prices) };
  }
  return {
    minPrice: detail.minPrice ?? null,
    maxPrice: detail.maxPrice ?? null,
  };
}

export function mergeListingPriceRow(
  product: ShopMirrorProduct,
  detail: ShopProductDetail,
  nextPrice: number,
  previousPrice: number | null,
  scope: ListingPriceScope
): ShopMirrorProduct {
  if (scope === "all") {
    return {
      ...product,
      minPrice: nextPrice,
      maxPrice: nextPrice,
      currency: detail.currency ?? product.currency,
    };
  }
  const extrema = listingExtremaFromDetail(detail);
  const patched = patchMirrorProductListingPrice(
    {
      minPrice: extrema.minPrice ?? product.minPrice,
      maxPrice: extrema.maxPrice ?? product.maxPrice,
    },
    nextPrice,
    previousPrice
  );
  return {
    ...product,
    ...patched,
    currency: detail.currency ?? product.currency,
  };
}

function mirroredListingPrice(detail: ShopProductDetail): number | null {
  const extrema = listingExtremaFromDetail(detail);
  const value = extrema.minPrice ?? extrema.maxPrice ?? null;
  return value != null && Number.isFinite(value) ? value : null;
}

function variantPriceBefore(
  detail: ShopProductDetail,
  target: ListingPriceWriteTarget
): number | null {
  if (target.scope === "all") {
    return mirroredListingPrice(detail);
  }
  const row = detail.variants?.find(
    (v) => v.thirdPlatformSkuId === target.thirdPlatformSkuId
  );
  const p = row?.price;
  return p != null && Number.isFinite(p) ? p : null;
}

function listingPriceApplied(
  detail: ShopProductDetail,
  expected: number,
  target: ListingPriceWriteTarget
): boolean {
  const rows = detail.variants ?? [];
  if (target.scope === "all") {
    const prices = rows
      .map((v) => v.price)
      .filter((p): p is number => p != null && Number.isFinite(p));
    return (
      prices.length > 0 &&
      prices.every((p) => listingPricesCloseEnough(p, expected))
    );
  }
  const row = rows.find(
    (v) => v.thirdPlatformSkuId === target.thirdPlatformSkuId
  );
  return (
    row?.price != null && listingPricesCloseEnough(row.price, expected)
  );
}

function buildVariantPayload(
  detail: ShopProductDetail,
  price: number,
  target: ListingPriceWriteTarget
) {
  const rows = (detail.variants ?? []).filter((v) => v.thirdPlatformSkuId);
  if (!rows.length) return null;

  if (target.scope === "all") {
    return rows.map((v) => ({
      thirdPlatformSkuId: v.thirdPlatformSkuId,
      price,
    }));
  }

  if (!rows.some((v) => v.thirdPlatformSkuId === target.thirdPlatformSkuId)) {
    return null;
  }
  return [{ thirdPlatformSkuId: target.thirdPlatformSkuId, price }];
}

function buildVariantDeltaPayload(
  detail: ShopProductDetail,
  delta: number,
  target: ListingPriceWriteTarget
): { thirdPlatformSkuId: string; price: number }[] | null {
  const rows = (detail.variants ?? []).filter((v) => v.thirdPlatformSkuId);
  if (!rows.length) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (target.scope === "all") {
    const out: { thirdPlatformSkuId: string; price: number }[] = [];
    for (const v of rows) {
      const base = v.price;
      if (base == null || !Number.isFinite(base)) {
        throw new Error("部分变体缺少售价，无法按差额调价");
      }
      const next = round2(base + delta);
      if (next <= 0) {
        throw new Error(`调价后售价须大于 0（变体现价 ${base.toFixed(2)}）`);
      }
      out.push({ thirdPlatformSkuId: v.thirdPlatformSkuId!, price: next });
    }
    return out;
  }

  const row = rows.find((v) => v.thirdPlatformSkuId === target.thirdPlatformSkuId);
  if (!row) return null;
  const base = row.price;
  if (base == null || !Number.isFinite(base)) {
    throw new Error("该变体缺少售价，无法按差额调价");
  }
  const next = round2(base + delta);
  if (next <= 0) {
    throw new Error(`调价后售价须大于 0（现价 ${base.toFixed(2)}）`);
  }
  return [{ thirdPlatformSkuId: target.thirdPlatformSkuId, price: next }];
}

/**
 * Write Shopify listing price for all variants or one selected variant.
 */
export async function writeShopListingPrice(
  shopName: string,
  productId: string,
  price: number,
  target: ListingPriceWriteTarget,
  signal?: AbortSignal
): Promise<{
  detail: ShopProductDetail;
  previousPrice: number | null;
  variantScope: ListingPriceScope;
  variantSkuId?: string;
}> {
  const detail = await api.getShopProductDetail(shopName, productId, signal);
  const previousPrice = variantPriceBefore(detail, target);
  const variants = buildVariantPayload(detail, price, target);
  if (!variants?.length) {
    throw new Error("该商品无可用变体，无法修改售价");
  }

  const payload = {
    itemId: productId,
    variants,
    defaultVariantPrice: price,
    expectedUpdatedAt: detail.updatedAt,
  };

  let saved: ShopProductDetail;
  try {
    saved = await api.updateShopProduct(shopName, payload, signal);
  } catch (err) {
    if (!isProductConflict(err)) throw err;
    saved = await api.updateShopProduct(
      shopName,
      {
        ...payload,
        force: true,
        expectedUpdatedAt: undefined,
      },
      signal
    );
  }

  if (!listingPriceApplied(saved, price, target)) {
    const current = variantPriceBefore(saved, target);
    throw new Error(
      `售价未写入 Shopify（镜像仍为 ${current != null ? current.toFixed(2) : "—"}）。请打开商品详情抽屉重试保存。`
    );
  }

  return {
    detail: saved,
    previousPrice,
    variantScope: target.scope,
    variantSkuId:
      target.scope === "one" ? target.thirdPlatformSkuId : undefined,
  };
}

/**
 * Add/subtract from current listing price(s). Scope "all" adjusts each variant
 * independently (15–16 +1 → 16–17), not flatten to a single price.
 */
export async function writeShopListingPriceDelta(
  shopName: string,
  productId: string,
  delta: number,
  target: ListingPriceWriteTarget,
  signal?: AbortSignal
): Promise<{
  detail: ShopProductDetail;
  previousPrice: number | null;
  nextPrice: number | null;
  variantScope: ListingPriceScope;
  variantSkuId?: string;
}> {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("调价差额无效");
  }
  const detail = await api.getShopProductDetail(shopName, productId, signal);
  const previousPrice = variantPriceBefore(detail, target);
  const variants = buildVariantDeltaPayload(detail, delta, target);
  if (!variants?.length) {
    throw new Error("该商品无可用变体，无法修改售价");
  }

  const defaultVariantPrice = variants[0]!.price;
  const payload = {
    itemId: productId,
    variants,
    defaultVariantPrice,
    expectedUpdatedAt: detail.updatedAt,
  };

  let saved: ShopProductDetail;
  try {
    saved = await api.updateShopProduct(shopName, payload, signal);
  } catch (err) {
    if (!isProductConflict(err)) throw err;
    saved = await api.updateShopProduct(
      shopName,
      {
        ...payload,
        force: true,
        expectedUpdatedAt: undefined,
      },
      signal
    );
  }

  const nextExtrema = listingExtremaFromDetail(saved);
  const nextPrice =
    target.scope === "one"
      ? variants[0]?.price ?? null
      : nextExtrema.minPrice;

  return {
    detail: saved,
    previousPrice,
    nextPrice,
    variantScope: target.scope,
    variantSkuId:
      target.scope === "one" ? target.thirdPlatformSkuId : undefined,
  };
}
