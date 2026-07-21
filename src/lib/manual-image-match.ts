import type { ConfirmImageMatchRequest, ImageBindingView, CatalogRecommendation } from "@/lib/types";
import {
  buildTangbuyProductUrl,
  fetchItemDetail,
  type ItemGetProduct,
} from "@/lib/tangbuy-mall-gateway";
import { mapItemGetToSourceSkuMatrix } from "@/lib/source-sku-matrix";

export const MANUAL_MATCH_APPLIED_QUERY = "manual_match";
export const MANUAL_MATCH_BIND_SOURCE = "FROM_MANUAL";

export function isManualImageBinding(
  binding?: ImageBindingView | null
): boolean {
  return (
    binding?.bindSource === MANUAL_MATCH_BIND_SOURCE ||
    binding?.appliedQuery === MANUAL_MATCH_APPLIED_QUERY
  );
}

export function resolveCatalogProductUrl(
  item: Pick<CatalogRecommendation, "candidateId" | "tangbuyUrl">
): string {
  return (
    item.tangbuyUrl?.trim() || buildTangbuyProductUrl(item.candidateId)
  );
}

/** Accept tangbuy.cc catalog product URLs from「发现新品」. */
export function parseTangbuyCatalogUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url.hostname.toLowerCase().includes("tangbuy.cc")) return null;
    if (!url.pathname.includes("/product")) return null;
    const id = url.searchParams.get("id")?.trim();
    if (!id) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveManualOfferProductId(detail: ItemGetProduct): string | null {
  if (detail.providerType === "alibaba" && detail.itemId != null) {
    return String(detail.itemId).trim() || null;
  }
  if (detail.itemId != null) {
    const id = String(detail.itemId).trim();
    return id || null;
  }
  return null;
}

export function resolveManualProductUrl(
  inputUrl: string,
  detail: ItemGetProduct
): string {
  return (
    detail.detailUrl?.trim() ||
    inputUrl.trim() ||
    (detail.itemId != null
      ? buildTangbuyProductUrl(String(detail.itemId))
      : inputUrl.trim())
  );
}

export function resolveManualProductTitle(detail: ItemGetProduct): string | null {
  return detail.itemNameTrans?.trim() || detail.itemName?.trim() || null;
}

export function resolveManualHeroImage(
  detail: ItemGetProduct,
  skuImageUrl?: string | null
): string | null {
  if (skuImageUrl?.trim()) return skuImageUrl.trim();
  const fromList = detail.productImageList?.find((u) => u?.trim());
  return fromList?.trim() || null;
}

export function formatManualOfferPrice(price?: number | null): string | null {
  if (price == null || !Number.isFinite(price)) return null;
  return price.toFixed(2);
}

export async function loadManualMatchProduct(
  productUrl: string
): Promise<{ detail: ItemGetProduct; normalizedUrl: string }> {
  const normalizedUrl = parseTangbuyCatalogUrl(productUrl);
  if (!normalizedUrl) {
    throw new Error("请输入发现新品中的 Tangbuy 商品链接（tangbuy.cc/product…）");
  }
  const detail = await fetchItemDetail(normalizedUrl);
  if (!detail) {
    throw new Error("无法读取该商品，请确认链接来自发现新品且商品仍在上架中");
  }
  const offerId = resolveManualOfferProductId(detail);
  if (!offerId) {
    throw new Error("该链接未返回有效商品 ID，请换一个发现新品链接");
  }
  const skus = mapItemGetToSourceSkuMatrix(detail);
  if (!skus.length) {
    throw new Error("该商品没有可用 SKU 规格，无法建立关联");
  }
  return { detail, normalizedUrl };
}

export function buildManualMatchConfirmRequest(input: {
  shopName: string;
  thirdPlatformItemId: string;
  detail: ItemGetProduct;
  productUrl: string;
  selectedSkuId: string;
}): ConfirmImageMatchRequest {
  const { shopName, thirdPlatformItemId, detail, productUrl, selectedSkuId } =
    input;
  const skus = mapItemGetToSourceSkuMatrix(detail);
  const row = skus.find((s) => s.skuId === selectedSkuId) ?? skus[0]!;
  const offerProductId = resolveManualOfferProductId(detail);
  if (!offerProductId) {
    throw new Error("无法解析货源商品 ID");
  }
  const offerPrice = formatManualOfferPrice(row.procurementPrice);
  const offerTitle = resolveManualProductTitle(detail);
  return {
    shopName,
    thirdPlatformItemId,
    offerProductId,
    offerSkuId: row.skuId,
    detailUrl: resolveManualProductUrl(productUrl, detail),
    similarityScore: null,
    imageSource: "ORIGINAL",
    querySource: "NONE",
    appliedQuery: MANUAL_MATCH_APPLIED_QUERY,
    offerImageUrl: resolveManualHeroImage(detail, row.imageUrl),
    offerPrice,
    offerTitle,
  };
}

export function withManualMatchBindingMeta(
  view: ImageBindingView,
  offerTitle?: string | null
): ImageBindingView {
  return {
    ...view,
    bindSource: MANUAL_MATCH_BIND_SOURCE,
    appliedQuery: MANUAL_MATCH_APPLIED_QUERY,
    querySource: "NONE",
    offerTitle: view.offerTitle ?? offerTitle ?? null,
  };
}
