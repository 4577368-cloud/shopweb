import type { CatalogRecommendation } from "@/lib/types";
import { calculateSalePrice } from "@/lib/price-calculator";
import type { PricingTemplate } from "@/lib/types";

const GATEWAY_PATH = "/gateway/plugin/item/allSubScriptionSearch";
const DEFAULT_CURRENCY = "CNY";
const MAX_IMAGES = 10;

interface MallGatewayRow {
  itemId?: number | string;
  itemName?: string;
  status?: string;
  price?: number | null;
  providerPrice?: number | null;
  imageList?: string[] | null;
  itemImages?: string[] | null;
  detailUrl?: string | null;
  providerShopName?: string | null;
  dataSource?: string | null;
}

interface GatewayResponse {
  code?: number;
  total?: number;
  rows?: MallGatewayRow[] | null;
  msg?: string;
}

/** True when the browser should call tangbuy.cc directly (Render backend cannot reach it). */
export function isMallGatewayConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TANGBUY_MALL_TOKEN?.trim());
}

function gatewayBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ?? "https://tangbuy.cc"
  ).replace(/\/$/, "");
}

function gatewayToken(): string {
  const token = process.env.NEXT_PUBLIC_TANGBUY_MALL_TOKEN?.trim();
  if (!token) {
    throw new Error("商城货源暂不可用，请稍后重试或联系管理员");
  }
  return token;
}

export async function fetchMallPage(
  pageNum: number,
  pageSize: number,
  keywords = ""
): Promise<{ total: number; rows: MallGatewayRow[] }> {
  const url = `${gatewayBaseUrl()}${GATEWAY_PATH}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayToken()}`,
      Origin: "https://dropshipping.tangbuy.cc",
      Referer: "https://dropshipping.tangbuy.cc/",
      currency: "CNY",
      device: "pc",
      lang: "cn",
      "tang-request-device": "web",
    },
    body: JSON.stringify({
      pageNum,
      pageSize,
      subscriptionPalletIds: [],
      labelIdList: [],
      keywords,
    }),
  });

  if (!res.ok) {
    throw new Error("加载货源失败，请稍后重试");
  }

  const data = (await res.json()) as GatewayResponse;
  if (data.code != null && data.code !== 200) {
    throw new Error(
      data.msg?.trim() ? data.msg : "加载货源失败，请稍后重试"
    );
  }

  return { total: data.total ?? 0, rows: data.rows ?? [] };
}

function collectImageUrls(row: MallGatewayRow): string[] {
  const raw = row.imageList?.length ? row.imageList : row.itemImages;
  if (!raw?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of raw) {
    const url = typeof u === "string" ? u.trim() : "";
    if (!url || seen.has(url)) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

/** Map one gateway row; mirrors backend TangbuyCatalogService.fromMallRow. */
export function rowToCatalogBase(
  row: MallGatewayRow
): Omit<CatalogRecommendation, "estimatedSalePrice" | "targetCurrency"> | null {
  if (!row) return null;
  const status = row.status?.trim();
  if (status && status.toUpperCase() !== "ON") return null;

  const rawId = row.itemId;
  if (rawId == null) return null;
  const candidateId = String(rawId).trim();
  if (!candidateId || candidateId === "null") return null;

  const imageUrls = collectImageUrls(row);
  const price =
    row.price != null && Number.isFinite(row.price)
      ? row.price
      : row.providerPrice != null && Number.isFinite(row.providerPrice)
        ? row.providerPrice
        : null;

  return {
    candidateId,
    title: row.itemName ?? candidateId,
    imageUrl: imageUrls[0] ?? null,
    imageUrls: imageUrls.length ? imageUrls : null,
    price,
    currency: DEFAULT_CURRENCY,
    supplierShop: row.providerShopName?.trim() || null,
    skuAttr: null,
    offerId1688: null,
    tangbuyUrl: row.detailUrl?.trim() || null,
    upstreamPlatform: row.dataSource?.trim() || null,
    barcode: null,
  };
}

export function toCatalogRecommendation(
  row: MallGatewayRow,
  template: PricingTemplate
): CatalogRecommendation | null {
  const base = rowToCatalogBase(row);
  if (!base) return null;
  return {
    ...base,
    estimatedSalePrice: calculateSalePrice(base.price, template),
    targetCurrency: template.targetCurrency,
  };
}

/** Snapshot fields sent with publish so the backend need not re-fetch tangbuy.cc. */
export type CatalogPublishSnapshot = {
  title: string;
  price?: number | null;
  currency?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
  tangbuyUrl?: string | null;
  supplierShop?: string | null;
  upstreamPlatform?: string | null;
  skuAttr?: string | null;
  barcode?: string | null;
  /** Rich HTML from itemGet description; preferred over backend-generated stub. */
  descriptionHtml?: string | null;
  offerId1688?: string | null;
  /** Tangbuy SKUs mapped to Shopify variants (from itemGet). */
  variants?: CatalogPublishVariant[] | null;
};

export type CatalogPublishVariant = {
  skuId: string;
  price?: number | null;
  barcode?: string | null;
  imageUrl?: string | null;
  optionValues: Array<{ optionName: string; value: string }>;
};

interface ItemGetTieredPrice {
  minQuantity?: number;
  procurementFinalUnitPrice?: number | null;
}

interface ItemGetSku {
  skuId?: string;
  price?: number | null;
  tieredPriceConfigList?: ItemGetTieredPrice[] | null;
  skuAttributes?: Array<{
    attrName?: string | null;
    attrNameTrans?: string | null;
    attrValue?: string | null;
    attrValueTrans?: string | null;
    skuImageList?: Array<string | null> | null;
  }> | null;
}

export interface ItemGetTimeInfo {
  weight?: number | null;
  volume?: number | null;
  unPackWeight?: number | null;
  unPackVolume?: number | null;
}

export interface ItemGetProduct {
  itemId?: string | number;
  itemName?: string | null;
  itemNameTrans?: string | null;
  description?: string | null;
  timeInfo?: ItemGetTimeInfo | null;
  productImageList?: string[] | null;
  productAttributes?: Array<{
    attributeName?: string | null;
    attributeNameTrans?: string | null;
    attrValue?: string | null;
    attrValueTrans?: string | null;
  }> | null;
  productSkus?: ItemGetSku[] | null;
  detailUrl?: string | null;
  price?: number | null;
  providerType?: string | null;
  dataSource?: string | null;
  providerShopName?: string | null;
}

interface ItemGetResponse {
  code?: number;
  msg?: string | null;
  data?: { item?: ItemGetProduct | null } | null;
}

const ITEM_GET_PATH = "/gateway/product/v3/itemGet";

/** Build a Tangbuy product URL when the list row omitted detailUrl. */
export function buildTangbuyProductUrl(
  candidateId: string,
  dataSource = "SHOP"
): string {
  const id = candidateId.trim();
  return `https://www.tangbuy.cc/product?dataSource=${encodeURIComponent(dataSource)}&id=${encodeURIComponent(id)}`;
}

/** GET /gateway/product/v3/itemGet — full product detail for publish enrichment. */
export async function fetchItemDetail(
  productUrl: string
): Promise<ItemGetProduct | null> {
  const url = productUrl.trim();
  if (!url) return null;
  const endpoint = `${gatewayBaseUrl()}${ITEM_GET_PATH}?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${gatewayToken()}`,
      currency: "USD",
      device: "pc",
      lang: "cn",
      "tang-request-device": "web",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ItemGetResponse;
  if (data.code != null && data.code !== 200) return null;
  return data.data?.item ?? null;
}

function mergeImageUrls(...groups: Array<string[] | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    if (!group?.length) continue;
    for (const raw of group) {
      const u = typeof raw === "string" ? raw.trim() : "";
      if (!u || seen.has(u) || !/^https?:\/\//i.test(u)) continue;
      seen.add(u);
      out.push(u);
      if (out.length >= MAX_IMAGES) return out;
    }
  }
  return out;
}

function formatProductAttributes(
  attrs: ItemGetProduct["productAttributes"]
): string | null {
  if (!attrs?.length) return null;
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const a of attrs) {
    const name = (a.attributeNameTrans ?? a.attributeName)?.trim();
    const val = (a.attrValueTrans ?? a.attrValue)?.trim();
    if (!name || !val) continue;
    const key = `${name}:${val}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${name}: ${val}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function resolveSkuProcurementPrice(sku: ItemGetSku, detail: ItemGetProduct): number | null {
  const tiers = sku.tieredPriceConfigList;
  const tier =
    tiers?.find((t) => t.minQuantity === 1) ??
    (tiers?.length ? tiers[0] : undefined);
  const fromTier = tier?.procurementFinalUnitPrice;
  if (fromTier != null && Number.isFinite(fromTier)) return fromTier;
  if (sku.price != null && Number.isFinite(sku.price)) return sku.price;
  if (detail.price != null && Number.isFinite(detail.price)) return detail.price;
  return null;
}

function mapSkuOptionValues(
  sku: ItemGetSku
): Array<{ optionName: string; value: string }> {
  const out: Array<{ optionName: string; value: string }> = [];
  const seen = new Set<string>();
  for (const a of sku.skuAttributes ?? []) {
    const optionName = (a.attrNameTrans ?? a.attrName ?? "规格").trim();
    const value = (a.attrValueTrans ?? a.attrValue ?? "").trim();
    if (!optionName || !value) continue;
    const key = `${optionName}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ optionName, value });
  }
  return out;
}

function firstSkuImage(sku: ItemGetSku): string | null {
  for (const a of sku.skuAttributes ?? []) {
    for (const raw of a.skuImageList ?? []) {
      const u = typeof raw === "string" ? raw.trim() : "";
      if (u && /^https?:\/\//i.test(u)) return u;
    }
  }
  return null;
}

const MAX_PUBLISH_VARIANTS = 100;

/** Map itemGet productSkus → Shopify variant snapshots. */
export function mapProductSkus(
  detail: ItemGetProduct
): CatalogPublishVariant[] | null {
  const skus = detail.productSkus;
  if (!skus?.length) return null;

  const variants: CatalogPublishVariant[] = [];
  const seenCombos = new Set<string>();

  for (const sku of skus) {
    const skuId = sku.skuId != null ? String(sku.skuId).trim() : "";
    if (!skuId) continue;
    const optionValues = mapSkuOptionValues(sku);
    if (!optionValues.length) continue;
    const comboKey = optionValues.map((o) => `${o.optionName}=${o.value}`).join("|");
    if (seenCombos.has(comboKey)) continue;
    seenCombos.add(comboKey);
    variants.push({
      skuId,
      price: resolveSkuProcurementPrice(sku, detail),
      imageUrl: firstSkuImage(sku),
      optionValues,
    });
    if (variants.length >= MAX_PUBLISH_VARIANTS) break;
  }

  return variants.length ? variants : null;
}

function resolveProcurementPrice(detail: ItemGetProduct): number | null {
  const sku = detail.productSkus?.[0];
  if (sku) return resolveSkuProcurementPrice(sku, detail);
  if (detail.price != null && Number.isFinite(detail.price)) return detail.price;
  return null;
}

/** Merge itemGet detail into the list-row publish snapshot. */
export function enrichPublishSnapshot(
  item: CatalogRecommendation,
  detail: ItemGetProduct,
  base: CatalogPublishSnapshot
): CatalogPublishSnapshot {
  const title =
    detail.itemNameTrans?.trim() ||
    detail.itemName?.trim() ||
    base.title;
  const procurement = resolveProcurementPrice(detail);
  const skuAttr = formatProductAttributes(detail.productAttributes) ?? base.skuAttr;
  const tangbuyUrl =
    base.tangbuyUrl?.trim() ||
    detail.detailUrl?.trim() ||
    buildTangbuyProductUrl(String(detail.itemId ?? item.candidateId));
  const upstream =
    base.upstreamPlatform?.trim() ||
    [detail.providerType, detail.dataSource].filter(Boolean).join(":") ||
    null;
  const variants = mapProductSkus(detail);
  const variantImages = variants
    ?.map((v) => v.imageUrl)
    .filter((u): u is string => Boolean(u?.trim()));
  const allImageUrls = mergeImageUrls(
    detail.productImageList,
    variantImages,
    base.imageUrls,
    base.imageUrl ? [base.imageUrl] : null
  );

  return {
    ...base,
    title,
    price: procurement ?? base.price,
    imageUrl: allImageUrls[0] ?? base.imageUrl,
    imageUrls: allImageUrls.length ? allImageUrls : base.imageUrls,
    tangbuyUrl,
    supplierShop: base.supplierShop ?? detail.providerShopName?.trim() ?? null,
    upstreamPlatform: upstream,
    skuAttr,
    descriptionHtml: detail.description?.trim() || base.descriptionHtml,
    offerId1688:
      base.offerId1688 ??
      (detail.providerType === "alibaba" && detail.itemId != null
        ? String(detail.itemId)
        : null),
    variants,
  };
}

export async function resolvePublishSnapshot(
  item: CatalogRecommendation
): Promise<CatalogPublishSnapshot> {
  const base = toPublishSnapshot(item);
  if (!isMallGatewayConfigured()) return base;
  const productUrl =
    item.tangbuyUrl?.trim() ||
    buildTangbuyProductUrl(item.candidateId);
  try {
    const detail = await fetchItemDetail(productUrl);
    if (!detail) return base;
    return enrichPublishSnapshot(item, detail, base);
  } catch {
    return base;
  }
}

export function toPublishSnapshot(
  item: CatalogRecommendation
): CatalogPublishSnapshot {
  const imageUrls =
    item.imageUrls?.filter((u) => Boolean(u?.trim())) ??
    (item.imageUrl ? [item.imageUrl] : []);
  return {
    title: item.title,
    price: item.price,
    currency: item.currency,
    imageUrl: imageUrls[0] ?? item.imageUrl,
    imageUrls: imageUrls.length ? imageUrls : null,
    tangbuyUrl: item.tangbuyUrl,
    supplierShop: item.supplierShop,
    upstreamPlatform: item.upstreamPlatform,
    skuAttr: item.skuAttr,
    barcode: item.barcode,
    offerId1688: item.offerId1688,
  };
}
