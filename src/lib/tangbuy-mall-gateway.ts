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
};

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
  };
}
