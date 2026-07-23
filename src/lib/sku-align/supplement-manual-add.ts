import {
  formatManualOfferPrice,
  loadManualMatchProduct,
  parseTangbuyCatalogUrl,
  resolveManualHeroImage,
  resolveManualOfferProductId,
  resolveManualProductTitle,
  resolveManualProductUrl,
} from "@/lib/manual-image-match";
import { isInternalGoodsId } from "@/lib/catalog-product-resolve";
import { probeSupplementCandidate } from "@/lib/sku-align/supplement-candidate-availability";
import { buildTangbuyProductUrl } from "@/lib/tangbuy-mall-gateway";
import { mapItemGetToSourceSkuMatrix, type SourceSkuRow } from "@/lib/source-sku-matrix";
import type { ImageSearchProduct } from "@/lib/types";
import type { ItemGetProduct } from "@/lib/tangbuy-mall-gateway";

/** Tangbuy 商品链接或内部 goodsId（14 位+）。 */
export function parseSupplementManualInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const fromUrl = parseTangbuyCatalogUrl(trimmed);
  if (fromUrl) return fromUrl;
  if (isInternalGoodsId(trimmed)) {
    return buildTangbuyProductUrl(trimmed);
  }
  return null;
}

export function imageSearchProductFromItemGet(
  detail: ItemGetProduct,
  productUrl: string
): ImageSearchProduct {
  const internal =
    detail.itemId != null && isInternalGoodsId(String(detail.itemId))
      ? String(detail.itemId).trim()
      : null;
  const offer1688 =
    detail.providerType === "alibaba" && detail.itemId != null
      ? String(detail.itemId).trim()
      : null;
  const productId = internal || offer1688 || String(detail.itemId ?? "").trim();
  const normalizedUrl = resolveManualProductUrl(productUrl, detail);
  const minSkuPrice = mapItemGetToSourceSkuMatrix(detail)
    .map((r) => r.procurementPrice)
    .filter((p): p is number => p != null && Number.isFinite(p))
    .sort((a, b) => a - b)[0];

  return {
    productId,
    title: resolveManualProductTitle(detail) ?? "Tangbuy 商品",
    imageUrl: resolveManualHeroImage(detail, null),
    detailUrl: normalizedUrl,
    price: formatManualOfferPrice(minSkuPrice ?? detail.price ?? null),
    catalogSource: Boolean(internal),
    internalGoodsId: internal,
    catalogItemId: internal,
    offerId1688: offer1688,
    tangbuyCatalogUrl: internal ? normalizedUrl : null,
    dataSource: "PREFERRED",
  };
}

export async function loadSupplementManualProduct(input: string): Promise<{
  candidate: ImageSearchProduct;
  matrixRows: SourceSkuRow[];
  productUrl: string;
}> {
  const productUrl = parseSupplementManualInput(input);
  if (!productUrl) {
    throw new Error(
      "请输入 Tangbuy 商品链接（tangbuy.cc/product?id=…）或 Tangbuy 商品 ID"
    );
  }
  const { detail, normalizedUrl } = await loadManualMatchProduct(productUrl);
  const candidate = imageSearchProductFromItemGet(detail, normalizedUrl);
  if (!resolveManualOfferProductId(detail)) {
    throw new Error("无法解析该 Tangbuy 商品 ID");
  }

  const probe = await probeSupplementCandidate(candidate);
  if (!probe.available) {
    throw new Error(probe.reason ?? "该 Tangbuy 货源已下架或无法读取 SKU");
  }

  return {
    candidate,
    matrixRows: probe.matrixRows,
    productUrl: normalizedUrl,
  };
}
