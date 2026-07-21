import {
  buildTangbuyProductUrl,
  fetchItemDetail,
} from "@/lib/tangbuy-mall-gateway";

/**
 * Normalized SKU row from itemGet.productSkus — single shape for SKU picker UI.
 * Source of truth: Tangbuy gateway itemGet (browser-side only).
 */
export interface SourceSkuRow {
  /** Tangbuy / 1688 SKU id from itemGet. */
  skuId: string;
  /** Human spec label, e.g. "红色 / M". */
  specLabel: string;
  /** Structured option parts for tray display. */
  optionParts: Array<{ name: string; value: string }>;
  imageUrl?: string | null;
  /** Procurement unit price (CNY) from tieredPriceConfigList or sku.price. */
  procurementPrice?: number | null;
  /** Stock hint when itemGet exposes it (reserved; not always present). */
  amountOnSale?: number | null;
}

export type SourceSkuRowRanked = SourceSkuRow & {
  /** 0–1 overlap with Shopify variant option label. */
  matchScore: number;
};

function normalizeMatchToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

function tokenizeForMatch(label: string): Set<string> {
  const out = new Set<string>();
  for (const raw of label.split(/[\s/|,，、·]+/)) {
    const t = normalizeMatchToken(raw);
    if (t.length >= 1) out.add(t);
  }
  return out;
}

/** Token overlap 0–1 between Shopify option label and itemGet spec label. */
export function scoreVariantSpecMatch(
  variantLabel: string,
  specLabel: string
): number {
  const a = tokenizeForMatch(variantLabel);
  const b = tokenizeForMatch(specLabel);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const t of a) {
    if (b.has(t)) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

/** Rank itemGet rows for a variant — best spec match first. */
export function rankSourceSkuRows(
  rows: SourceSkuRow[],
  variantLabel: string
): SourceSkuRowRanked[] {
  return rows
    .map((row) => ({
      ...row,
      matchScore: scoreVariantSpecMatch(variantLabel, row.specLabel),
    }))
    .sort((a, b) => b.matchScore - a.matchScore || a.specLabel.localeCompare(b.specLabel));
}

function mapOptionParts(
  attrs: Array<{
    attrName?: string | null;
    attrNameTrans?: string | null;
    attrValue?: string | null;
    attrValueTrans?: string | null;
  }> | null | undefined
): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();
  for (const a of attrs ?? []) {
    const name = (a.attrNameTrans ?? a.attrName ?? "规格").trim();
    const value = (a.attrValueTrans ?? a.attrValue ?? "").trim();
    if (!name || !value) continue;
    const key = `${name}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, value });
  }
  return out;
}

function specLabelFromAttributes(
  attrs: Array<{
    attrName?: string | null;
    attrNameTrans?: string | null;
    attrValue?: string | null;
    attrValueTrans?: string | null;
  }> | null | undefined
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const a of attrs ?? []) {
    const value = (a.attrValueTrans ?? a.attrValue ?? "").trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    parts.push(value);
  }
  return parts.join(" / ");
}

function firstSkuImage(
  attrs: Array<{
    skuImageList?: Array<string | null> | null;
  }> | null | undefined
): string | null {
  for (const a of attrs ?? []) {
    for (const raw of a.skuImageList ?? []) {
      const u = typeof raw === "string" ? raw.trim() : "";
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
}

function resolveProcurementPrice(
  sku: {
    price?: number | null;
    tieredPriceConfigList?: Array<{
      minQuantity?: number;
      procurementFinalUnitPrice?: number | null;
    }> | null;
  },
  fallback?: number | null
): number | null {
  const tiers = sku.tieredPriceConfigList;
  const tier =
    tiers?.find((t) => t.minQuantity === 1) ?? (tiers?.length ? tiers[0] : undefined);
  const fromTier = tier?.procurementFinalUnitPrice;
  if (fromTier != null && Number.isFinite(fromTier)) return fromTier;
  if (sku.price != null && Number.isFinite(sku.price)) return sku.price;
  if (fallback != null && Number.isFinite(fallback)) return fallback;
  return null;
}

/** Map itemGet.productSkus → SourceSkuRow[]. Skips rows without skuId or spec. */
export function mapItemGetToSourceSkuMatrix(
  detail: NonNullable<Awaited<ReturnType<typeof fetchItemDetail>>>
): SourceSkuRow[] {
  const skus = detail.productSkus;
  if (!skus?.length) return [];

  const rows: SourceSkuRow[] = [];
  const seenIds = new Set<string>();

  for (const sku of skus) {
    const skuId = sku.skuId != null ? String(sku.skuId).trim() : "";
    if (!skuId || seenIds.has(skuId)) continue;
    const specLabel = specLabelFromAttributes(sku.skuAttributes);
    if (!specLabel) continue;
    seenIds.add(skuId);
    rows.push({
      skuId,
      specLabel,
      optionParts: mapOptionParts(sku.skuAttributes),
      imageUrl: firstSkuImage(sku.skuAttributes),
      procurementPrice: resolveProcurementPrice(sku, detail.price),
      amountOnSale: null,
    });
  }

  return rows;
}

/** Resolve right-column display: itemGet matrix first, then offer-detail, then binding audit. */
export function resolveBoundSkuDisplay(input: {
  tangbuySkuId?: string | null;
  sourceMatrix: SourceSkuRow[];
  offerSku?: {
    skuAttributes?: Array<{
      value?: string | null;
      valueTrans?: string | null;
      skuImageUrl?: string | null;
    }> | null;
    price?: string | null;
    consignPrice?: string | null;
  } | null;
  offerWhiteImage?: string | null;
  boundSpec?: string | null;
}): {
  imageUrl: string | null;
  specLabel: string | null;
  priceLabel: string | null;
  priceKind: "procurement" | "wholesale" | null;
  dataSource: "itemGet" | "offer-detail" | "binding" | null;
} {
  const id = input.tangbuySkuId?.trim();
  const sourceRow = id
    ? input.sourceMatrix.find((r) => r.skuId === id)
    : undefined;

  if (sourceRow) {
    return {
      imageUrl: sourceRow.imageUrl ?? null,
      specLabel: sourceRow.specLabel,
      priceLabel:
        sourceRow.procurementPrice != null
          ? `¥${sourceRow.procurementPrice.toFixed(2)}`
          : null,
      priceKind: sourceRow.procurementPrice != null ? "procurement" : null,
      dataSource: "itemGet",
    };
  }

  const offer = input.offerSku;
  if (offer) {
    const parts = offer.skuAttributes
      ?.map((a) => a.valueTrans || a.value)
      .filter((v): v is string => Boolean(v?.trim()));
    const rawPrice = offer.price?.trim() || offer.consignPrice?.trim() || null;
    return {
      imageUrl:
        offer.skuAttributes?.map((a) => a.skuImageUrl).find(Boolean) ??
        input.offerWhiteImage ??
        null,
      specLabel: parts?.length ? parts.join(" / ") : null,
      priceLabel: rawPrice ? `¥${rawPrice}` : null,
      priceKind: rawPrice ? "wholesale" : null,
      dataSource: "offer-detail",
    };
  }

  if (input.boundSpec?.trim()) {
    return {
      imageUrl: null,
      specLabel: input.boundSpec.trim(),
      priceLabel: null,
      priceKind: null,
      dataSource: "binding",
    };
  }

  return {
    imageUrl: null,
    specLabel: null,
    priceLabel: null,
    priceKind: null,
    dataSource: null,
  };
}

export async function fetchSourceSkuMatrix(
  detailUrl: string
): Promise<SourceSkuRow[]> {
  const detail = await fetchItemDetail(detailUrl);
  if (!detail) return [];
  return mapItemGetToSourceSkuMatrix(detail);
}

/** Resolve the Tangbuy URL used for itemGet when overview omits detailUrl. */
export function resolveSkuDetailUrl(
  detailUrl?: string | null,
  tangbuyProductId?: string | null
): string | null {
  const direct = detailUrl?.trim();
  if (direct) return direct;
  const id = tangbuyProductId?.trim();
  if (id) return buildTangbuyProductUrl(id);
  return null;
}

/** Procurement unit price (CNY) from itemGet for a bound offer/sku. */
export function resolveItemGetProcurementFromMatrix(
  rows: SourceSkuRow[],
  tangbuySkuId?: string | null
): number | null {
  if (!rows.length) return null;
  const id = tangbuySkuId?.trim();
  if (id) {
    const row = rows.find((r) => r.skuId === id);
    if (row?.procurementPrice != null) return row.procurementPrice;
  }
  const prices = rows
    .map((r) => r.procurementPrice)
    .filter((p): p is number => p != null && Number.isFinite(p));
  return prices.length ? Math.min(...prices) : null;
}

/** Fetch itemGet matrix and resolve procurement price for a product binding. */
export async function fetchItemGetProcurementPrice(
  detailUrl: string,
  tangbuySkuId?: string | null
): Promise<number | null> {
  const rows = await fetchSourceSkuMatrix(detailUrl);
  return resolveItemGetProcurementFromMatrix(rows, tangbuySkuId);
}
