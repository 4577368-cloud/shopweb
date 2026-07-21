import {
  buildTangbuyProductUrl,
  fetchItemDetail,
  isMallGatewayConfigured,
} from "@/lib/tangbuy-mall-gateway";
import { parseGatewayPrice } from "@/lib/agents/products/match-rank";
import { formatSourceCostInShopCurrency } from "@/lib/purchase-cost-display";

export type SkuDisplayStatus = "LOADING" | "READY" | "ERROR";

export interface SourceSkuMatrixFetchResult {
  rows: SourceSkuRow[];
  error: string | null;
}

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
  /** 0–1 spec+price+image composite match score. */
  matchScore: number;
  /** 0–1 spec token overlap (with synonyms). */
  specScore: number;
  /** 0–1 price proximity (1 = exact, 0 = no price data). */
  priceScore: number;
};

function normalizeMatchToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").trim();
}

// 同义词字典 — 颜色/尺码的中英文与简写映射
const SYNONYM_GROUPS: string[][] = [
  ["红", "红色", "red", "rouge", "rojo"],
  ["蓝", "蓝色", "blue", "bleu", "azul"],
  ["绿", "绿色", "green", "vert", "verde"],
  ["黄", "黄色", "yellow", "jaune", "amarillo"],
  ["黑", "黑色", "black", "noir", "negro"],
  ["白", "白色", "white", "blanc", "blanco"],
  ["紫", "紫色", "purple", "violet", "morado"],
  ["粉", "粉色", "粉红", "pink", "rose"],
  ["灰", "灰色", "gray", "grey", "gris"],
  ["橙", "橙色", "orange", "naranja"],
  ["棕", "棕色", "褐色", "brown", "café"],
  ["金", "金色", "gold", "golden", "doré"],
  ["银", "银色", "silver", "argent"],
  ["xs", "特小"],
  ["s", "小", "小码", "small"],
  ["m", "中", "中码", "medium"],
  ["l", "大", "大码", "large"],
  ["xl", "加大", "xlarge"],
  ["xxl", "2xl", "加加大"],
  ["xxxl", "3xl", "加加加大"],
  ["均码", "onesize", "one size", "free"],
];

const SYNONYM_MAP = new Map<string, Set<string>>();
for (const group of SYNONYM_GROUPS) {
  const normalizedGroup = new Set<string>();
  for (const w of group) {
    normalizedGroup.add(normalizeMatchToken(w));
  }
  for (const w of group) {
    const nw = normalizeMatchToken(w);
    SYNONYM_MAP.set(nw, normalizedGroup);
  }
}

function tokenizeForMatch(label: string): Set<string> {
  const out = new Set<string>();
  for (const raw of label.split(/[\s/|,，、·:：]+/)) {
    const t = normalizeMatchToken(raw);
    if (t.length >= 1) out.add(t);
  }
  return out;
}

/** 检查两个 token 是否同义 */
function isSynonym(a: string, b: string): boolean {
  if (a === b) return true;
  // 前缀包含（"红" 匹配 "红色"）
  if (a.length >= 1 && b.length >= 1 && (a.startsWith(b) || b.startsWith(a))) {
    // 但避免单字符误匹配（如 "s" 和 "small" 不算同义，除非在字典里）
    const groupA = SYNONYM_MAP.get(a);
    const groupB = SYNONYM_MAP.get(b);
    if (groupA && groupB && groupA === groupB) return true;
    // 只在两者都 ≤ 2 字符时允许前缀匹配
    if (a.length <= 2 && b.length <= 2 && (a.includes(b) || b.includes(a))) {
      return true;
    }
  }
  const group = SYNONYM_MAP.get(a);
  if (group && group.has(b)) return true;
  return false;
}

/** Token overlap 0–1 between Shopify option label and itemGet spec label, with synonyms. */
export function scoreVariantSpecMatch(
  variantLabel: string,
  specLabel: string
): number {
  const a = tokenizeForMatch(variantLabel);
  const b = tokenizeForMatch(specLabel);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const t of a) {
    if (b.has(t)) {
      hits += 1;
      continue;
    }
    // 同义词匹配
    let synonymHit = false;
    for (const bt of b) {
      if (isSynonym(t, bt)) {
        synonymHit = true;
        break;
      }
    }
    if (synonymHit) hits += 1;
  }
  return hits / Math.max(a.size, b.size);
}

/** 价格接近度：0 = 完全不同，1 = 完全相同 */
function scorePriceProximity(
  variantPrice?: number | null,
  sourcePrice?: number | null
): number {
  if (variantPrice == null || sourcePrice == null) return 0;
  if (variantPrice <= 0 || sourcePrice <= 0) return 0;
  const ratio = Math.min(variantPrice, sourcePrice) / Math.max(variantPrice, sourcePrice);
  // ratio 1.0 → score 1.0, ratio 0.5 → score 0.0
  return Math.max(0, (ratio - 0.5) / 0.5);
}

/** 简单图片相似度：URL 完全相同 = 1，否则 0 */
function scoreImageSimilarity(
  variantImageUrl?: string | null,
  sourceImageUrl?: string | null
): number {
  if (!variantImageUrl || !sourceImageUrl) return 0;
  const a = variantImageUrl.split("?")[0].toLowerCase();
  const b = sourceImageUrl.split("?")[0].toLowerCase();
  return a === b ? 1 : 0;
}

export interface RankOptions {
  variantPrice?: number | null;
  variantImageUrl?: string | null;
}

/** Rank itemGet rows for a variant — composite of spec match (70%), price (20%), image (10%). */
export function rankSourceSkuRows(
  rows: SourceSkuRow[],
  variantLabel: string,
  options?: RankOptions
): SourceSkuRowRanked[] {
  return rows
    .map((row) => {
      const specScore = scoreVariantSpecMatch(variantLabel, row.specLabel);
      const priceScore = scorePriceProximity(options?.variantPrice, row.procurementPrice);
      const imageScore = scoreImageSimilarity(options?.variantImageUrl, row.imageUrl);
      // 综合分：spec 70% + price 20% + image 10%
      const matchScore = specScore * 0.7 + priceScore * 0.2 + imageScore * 0.1;
      return { ...row, matchScore, specScore, priceScore };
    })
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

/** Find matrix row by skuId (exact or string-normalized). */
export function findSourceSkuRow(
  matrix: SourceSkuRow[],
  skuId?: string | null
): SourceSkuRow | undefined {
  const id = skuId?.trim();
  if (!id || !matrix.length) return undefined;
  const exact = matrix.find((r) => r.skuId === id);
  if (exact) return exact;
  return matrix.find((r) => String(r.skuId) === String(id));
}

export function validateOfferSkuInMatrix(
  matrix: SourceSkuRow[],
  skuId: string
): boolean {
  return Boolean(findSourceSkuRow(matrix, skuId));
}

export type BoundSkuDisplay = {
  imageUrl: string | null;
  specLabel: string | null;
  priceLabel: string | null;
  priceKind: "procurement" | "wholesale" | null;
  dataSource: "itemGet" | "offer-detail" | "binding" | null;
  displayStatus: SkuDisplayStatus;
  displayError?: string | null;
};

function emptyDisplay(status: SkuDisplayStatus, error?: string | null): BoundSkuDisplay {
  return {
    imageUrl: null,
    specLabel: null,
    priceLabel: null,
    priceKind: null,
    dataSource: null,
    displayStatus: status,
    displayError: error ?? null,
  };
}

/** Whether any bound variant sku is missing from the itemGet matrix. */
export function needsOfferDetailFallback(
  matrix: SourceSkuRow[],
  boundSkuIds: Array<string | null | undefined>
): boolean {
  if (!boundSkuIds.some((id) => id?.trim())) return false;
  if (!matrix.length) return true;
  return boundSkuIds.some((id) => id?.trim() && !findSourceSkuRow(matrix, id));
}

/** Resolve right-column display: itemGet matrix first, offer-detail fallback, then binding audit. */
export function resolveBoundSkuDisplay(input: {
  tangbuySkuId?: string | null;
  sourceMatrix: SourceSkuRow[];
  sourceMatrixLoading: boolean;
  sourceMatrixError?: string | null;
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
  offerLoading: boolean;
  offerFallbackAttempted?: boolean;
  boundSpec?: string | null;
  boundImageUrl?: string | null;
  boundPriceRaw?: string | null;
  shopCurrency?: string | null;
}): BoundSkuDisplay {
  const id = input.tangbuySkuId?.trim();

  if (input.sourceMatrixLoading) {
    return emptyDisplay("LOADING");
  }

  const sourceRow = id ? findSourceSkuRow(input.sourceMatrix, id) : undefined;
  if (sourceRow) {
    return {
      imageUrl: sourceRow.imageUrl ?? null,
      specLabel: sourceRow.specLabel,
      priceLabel: formatSourceCostInShopCurrency(
        sourceRow.procurementPrice,
        input.shopCurrency
      ),
      priceKind: sourceRow.procurementPrice != null ? "procurement" : null,
      dataSource: "itemGet",
      displayStatus: "READY",
    };
  }

  if (input.offerLoading) {
    return emptyDisplay("LOADING");
  }

  const offer = input.offerSku;
  if (offer) {
    const parts = offer.skuAttributes
      ?.map((a) => a.valueTrans || a.value)
      .filter((v): v is string => Boolean(v?.trim()));
    const rawPrice = offer.price?.trim() || offer.consignPrice?.trim() || null;
    const ok = Boolean(parts?.length || rawPrice);
    return {
      imageUrl:
        offer.skuAttributes?.map((a) => a.skuImageUrl).find(Boolean) ??
        input.offerWhiteImage ??
        null,
      specLabel: parts?.length ? parts.join(" / ") : null,
      priceLabel: rawPrice
        ? formatSourceCostInShopCurrency(
            parseGatewayPrice(rawPrice),
            input.shopCurrency
          )
        : null,
      priceKind: rawPrice ? "procurement" : null,
      dataSource: "offer-detail",
      displayStatus: ok ? "READY" : "ERROR",
      displayError: ok ? null : "offer-detail 未返回可用规格",
    };
  }

  if (input.boundSpec?.trim() || input.boundImageUrl || input.boundPriceRaw) {
    return {
      imageUrl: input.boundImageUrl ?? null,
      specLabel: input.boundSpec?.trim() ?? null,
      priceLabel: input.boundPriceRaw
        ? formatSourceCostInShopCurrency(
            parseGatewayPrice(input.boundPriceRaw),
            input.shopCurrency
          )
        : null,
      priceKind: input.boundPriceRaw ? "procurement" : null,
      dataSource: "binding",
      displayStatus: "READY",
    };
  }

  if (input.sourceMatrixError) {
    return { ...emptyDisplay("ERROR"), displayError: input.sourceMatrixError };
  }

  if (id && input.sourceMatrix.length > 0) {
    return {
      ...emptyDisplay("ERROR"),
      displayError: `绑定 skuId ${id} 不在 itemGet 规格表中，请重选 SKU`,
    };
  }

  if (id && input.sourceMatrix.length === 0) {
    const detail = input.sourceMatrixError?.trim();
    return {
      ...emptyDisplay("ERROR"),
      displayError:
        detail ??
        (input.offerFallbackAttempted
          ? "无法从 itemGet 或 offer-detail 加载规格"
          : "货源规格表为空，请稍后重试"),
    };
  }

  return emptyDisplay("ERROR", "规格未加载");
}

export async function fetchSourceSkuMatrixResult(
  detailUrl: string
): Promise<SourceSkuMatrixFetchResult> {
  if (!isMallGatewayConfigured()) {
    return { rows: [], error: "商城货源暂不可用，无法加载 itemGet 规格表" };
  }
  try {
    const detail = await fetchItemDetail(detailUrl);
    if (!detail) {
      return { rows: [], error: "itemGet 未返回商品详情" };
    }
    const rows = mapItemGetToSourceSkuMatrix(detail);
    if (!rows.length) {
      return { rows: [], error: "itemGet 未返回可用 SKU 规格" };
    }
    return { rows, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "加载 itemGet 规格表失败";
    return { rows: [], error: msg };
  }
}

export async function fetchSourceSkuMatrix(
  detailUrl: string
): Promise<SourceSkuRow[]> {
  const { rows } = await fetchSourceSkuMatrixResult(detailUrl);
  return rows;
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
    const row = findSourceSkuRow(rows, id);
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
