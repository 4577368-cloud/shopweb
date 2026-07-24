import {
  buildTangbuyProductUrl,
  fetchItemDetail,
  fetchMallPage,
  isMallGatewayConfigured,
  rowToCatalogBase,
  type ItemGetProduct,
} from "@/lib/tangbuy-mall-gateway";
import { buildOfferDetailUrl } from "@/lib/logistics/variant-measures";
import type { ImageBindingView, ImageSearchProduct, ProductSourceIdentity } from "@/lib/types";

export type ProductSourceResolvedVia = NonNullable<
  ProductSourceIdentity["resolvedVia"]
>;

const OFFER_ID_PATTERN = /^\d{10,13}$/;
const INTERNAL_GOODS_ID_PATTERN = /^\d{14,}$/;

const catalogOfferMapCache = new Map<string, Map<string, string>>();
const catalogOfferMapPending = new Map<string, Promise<Map<string, string>>>();

/** Clear cached offerId→goodsId map after preferred pool ingest. */
export function invalidateCatalogOfferMapCache(shopName?: string): void {
  if (shopName?.trim()) {
    catalogOfferMapCache.delete(shopName.trim());
  } else {
    catalogOfferMapCache.clear();
  }
}

export function isInternalGoodsId(id: string | null | undefined): boolean {
  const trimmed = id?.trim() ?? "";
  return INTERNAL_GOODS_ID_PATTERN.test(trimmed);
}

export function isOfferId1688(id: string | null | undefined): boolean {
  const trimmed = id?.trim() ?? "";
  return OFFER_ID_PATTERN.test(trimmed) && !INTERNAL_GOODS_ID_PATTERN.test(trimmed);
}

export function extractOfferIdFromUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const match = raw.match(/offer\/(\d+)/i);
  return match?.[1] ?? null;
}

function goodsIdFromTangbuyUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const match = raw.match(/[?&]id=(\d+)/i);
  return match?.[1] ?? null;
}

/** Extract search terms from Shopify / 1688 titles for catalog keyword search. */
export function extractCatalogSearchTerms(title: string): string[] {
  const out: string[] = [];
  const t = title.trim();
  if (!t) return out;

  const cn = t.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const phrase of cn) {
    if (phrase.length <= 14) out.push(phrase);
    else out.push(phrase.slice(0, 10));
  }

  const en = t.match(/[A-Za-z]{3,}/g) ?? [];
  out.push(...en.slice(0, 5));

  return [...new Set(out.map((s) => s.trim()).filter(Boolean))].slice(0, 6);
}

export interface CatalogGoodsIdMatch {
  internalGoodsId: string;
  catalogItemId: string;
  tangbuyCatalogUrl: string;
  tangbuySkuId: string;
  offerId1688: string;
  dataSource?: string | null;
  resolvedVia: Extract<ProductSourceResolvedVia, "offer_sku_lookup" | "catalog_match">;
}

async function loadRecommendationsOfferMap(shopName: string): Promise<Map<string, string>> {
  const shop = shopName.trim();
  if (!shop) return new Map();

  const cached = catalogOfferMapCache.get(shop);
  if (cached) return cached;

  const pending = catalogOfferMapPending.get(shop);
  if (pending) return pending;

  const promise = import("@/lib/api")
    .then((m) => m.api.getRecommendations(shop, 500, 0))
    .then((items) => {
      const map = new Map<string, string>();
      for (const item of items) {
        const offer = item.offerId1688?.trim();
        const candidate = item.candidateId?.trim();
        if (!offer || !candidate) continue;
        const goodsId =
          goodsIdFromTangbuyUrl(item.tangbuyUrl) ??
          candidate.split("_")[0] ??
          candidate;
        if (isInternalGoodsId(goodsId) && !map.has(offer)) {
          map.set(offer, goodsId);
        }
      }
      catalogOfferMapCache.set(shop, map);
      return map;
    })
    .catch(() => new Map<string, string>())
    .finally(() => {
      catalogOfferMapPending.delete(shop);
    });

  catalogOfferMapPending.set(shop, promise);
  return promise;
}

function catalogUrlForItemId(itemId: string): string {
  return buildTangbuyProductUrl(itemId, "PREFERRED");
}

function detailUrlMatchesOffer(
  detailUrl: string | null | undefined,
  offerId: string
): boolean {
  const raw = detailUrl?.trim() ?? "";
  if (!raw) return false;
  return raw.includes(offerId) || raw.includes(`offer/${offerId}`);
}

/** Resolve internal goodsId after pool ingest when SKU match is not required yet. */
export async function resolveInternalGoodsIdByOffer(input: {
  offerId1688: string;
  tangbuySkuId?: string | null;
  titleHint?: string | null;
  shopName?: string | null;
}): Promise<CatalogGoodsIdMatch | null> {
  if (!isMallGatewayConfigured()) return null;

  const offerId = input.offerId1688.trim();
  if (!offerId) return null;

  const pickSku = (
    detail: ItemGetProduct,
    preferred?: string | null
  ): string | null => {
    const want = preferred?.trim();
    if (want && detail.productSkus?.some((s) => String(s.skuId) === want)) {
      return want;
    }
    const first = detail.productSkus?.[0]?.skuId;
    return first != null ? String(first) : null;
  };

  try {
    if (input.shopName?.trim()) {
      const fromRecs = await loadRecommendationsOfferMap(input.shopName);
      const goodsId = fromRecs.get(offerId);
      if (goodsId && isInternalGoodsId(goodsId)) {
        const url = catalogUrlForItemId(goodsId);
        const detail = await fetchItemDetail(url);
        const sku = detail ? pickSku(detail, input.tangbuySkuId) : null;
        if (sku) {
          return {
            internalGoodsId: goodsId,
            catalogItemId: goodsId,
            tangbuyCatalogUrl: url,
            tangbuySkuId: sku,
            offerId1688: offerId,
            dataSource: detail?.dataSource ?? "PREFERRED",
            resolvedVia: "catalog_match",
          };
        }
      }
    }

    const searchTerms = [
      offerId,
      ...extractCatalogSearchTerms(input.titleHint ?? ""),
    ].filter(Boolean);

    const rowById = new Map<
      string,
      { itemId: string; detailUrl?: string | null }
    >();

    for (const kw of searchTerms) {
      const { rows } = await fetchMallPage(1, 25, kw);
      for (const row of rows) {
        if (row.itemId == null) continue;
        const id = String(row.itemId).trim();
        if (!isInternalGoodsId(id)) continue;
        const detailUrl = row.detailUrl?.trim() || null;
        if (!detailUrlMatchesOffer(detailUrl, offerId)) continue;
        if (!rowById.has(id)) {
          rowById.set(id, { itemId: id, detailUrl });
        }
      }
    }

    for (const row of rowById.values()) {
      const url = row.detailUrl?.trim() || catalogUrlForItemId(row.itemId);
      const detail = await fetchItemDetail(url);
      if (!detail?.productSkus?.length) continue;
      const sku = pickSku(detail, input.tangbuySkuId);
      if (!sku) continue;
      return {
        internalGoodsId: row.itemId,
        catalogItemId: row.itemId,
        tangbuyCatalogUrl: url,
        tangbuySkuId: sku,
        offerId1688: offerId,
        dataSource: detail.dataSource ?? "PREFERRED",
        resolvedVia: "offer_sku_lookup",
      };
    }

    return null;
  } catch {
    return null;
  }
}

/** Match catalog PREFERRED item by tangbuySkuId (offerId → goodsId 双保险 #2). */
export async function resolveInternalGoodsIdByOfferSku(input: {
  offerId1688: string;
  tangbuySkuId: string;
  titleHint?: string | null;
  shopName?: string | null;
}): Promise<CatalogGoodsIdMatch | null> {
  if (!isMallGatewayConfigured()) return null;

  const offerId = input.offerId1688.trim();
  const sku = input.tangbuySkuId.trim();
  if (!offerId || !sku) return null;

  try {
  if (input.shopName?.trim()) {
    const fromRecs = await loadRecommendationsOfferMap(input.shopName);
    const goodsId = fromRecs.get(offerId);
    if (goodsId && isInternalGoodsId(goodsId)) {
      const url = catalogUrlForItemId(goodsId);
      const detail = await fetchItemDetail(url);
      const skuOk = detail?.productSkus?.some((s) => String(s.skuId) === sku);
      if (skuOk) {
        return {
          internalGoodsId: goodsId,
          catalogItemId: goodsId,
          tangbuyCatalogUrl: url,
          tangbuySkuId: sku,
          offerId1688: offerId,
          dataSource: detail?.dataSource ?? "PREFERRED",
          resolvedVia: "catalog_match",
        };
      }
    }
  }

  const searchTerms = [
    offerId,
    ...extractCatalogSearchTerms(input.titleHint ?? ""),
  ].filter(Boolean);

  const rowById = new Map<string, { itemId: string; detailUrl?: string | null; itemName?: string | null }>();

  for (const kw of searchTerms) {
    const { rows } = await fetchMallPage(1, 25, kw);
    for (const row of rows) {
      if (row.itemId == null) continue;
      const id = String(row.itemId).trim();
      if (!isInternalGoodsId(id)) continue;
      if (!rowById.has(id)) {
        rowById.set(id, {
          itemId: id,
          detailUrl: row.detailUrl,
          itemName: row.itemName,
        });
      }
    }
  }

  for (const row of rowById.values()) {
    const url = row.detailUrl?.trim() || catalogUrlForItemId(row.itemId);
    const detail = await fetchItemDetail(url);
    if (!detail?.productSkus?.length) continue;
    const skuHit = detail.productSkus.find((s) => String(s.skuId) === sku);
    if (!skuHit) continue;

    return {
      internalGoodsId: row.itemId,
      catalogItemId: row.itemId,
      tangbuyCatalogUrl: url,
      tangbuySkuId: sku,
      offerId1688: offerId,
      dataSource: detail.dataSource ?? "PREFERRED",
      resolvedVia: "offer_sku_lookup",
    };
  }

  return null;
  } catch {
    return null;
  }
}

export interface ResolveProductSourceInput {
  tangbuyProductId?: string | null;
  tangbuySkuId?: string | null;
  detailUrl?: string | null;
  titleHint?: string | null;
  shopName?: string | null;
}

/** Resolve full ProductSourceIdentity (双保险合并入口). */
export async function resolveProductSourceIdentity(
  input: ResolveProductSourceInput
): Promise<ProductSourceIdentity> {
  const tangbuyProductId = input.tangbuyProductId?.trim() ?? "";
  const tangbuySkuId = input.tangbuySkuId?.trim() ?? "";
  const detailUrl = input.detailUrl?.trim() ?? "";
  const now = new Date().toISOString();

  if (isInternalGoodsId(tangbuyProductId)) {
    return {
      internalGoodsId: tangbuyProductId,
      catalogItemId: tangbuyProductId,
      tangbuyCatalogUrl: catalogUrlForItemId(tangbuyProductId),
      offerId1688: extractOfferIdFromUrl(detailUrl),
      tangbuySkuId: tangbuySkuId || null,
      offerDetailUrl: detailUrl || buildOfferDetailUrl(extractOfferIdFromUrl(detailUrl) ?? ""),
      dataSource: "PREFERRED",
      resolvedVia: "internal_direct",
      resolvedAt: now,
    };
  }

  const offerId =
    extractOfferIdFromUrl(detailUrl) ||
    (isOfferId1688(tangbuyProductId) ? tangbuyProductId : null);

  if (offerId && tangbuySkuId) {
    const fromSku = await resolveInternalGoodsIdByOfferSku({
      offerId1688: offerId,
      tangbuySkuId,
      titleHint: input.titleHint,
      shopName: input.shopName,
    });
    if (fromSku) {
      return {
        internalGoodsId: fromSku.internalGoodsId,
        catalogItemId: fromSku.catalogItemId,
        tangbuyCatalogUrl: fromSku.tangbuyCatalogUrl,
        offerId1688: fromSku.offerId1688,
        tangbuySkuId: fromSku.tangbuySkuId,
        offerDetailUrl: buildOfferDetailUrl(offerId),
        dataSource: fromSku.dataSource ?? "PREFERRED",
        resolvedVia: fromSku.resolvedVia,
        resolvedAt: now,
      };
    }
  }

  return {
    offerId1688: offerId,
    tangbuySkuId: tangbuySkuId || null,
    offerDetailUrl: offerId ? buildOfferDetailUrl(offerId) : detailUrl || null,
    dataSource: "OUTER",
    resolvedVia: "1688_only",
    resolvedAt: now,
  };
}

function pickDefaultSkuId(detail: ItemGetProduct | null): string | null {
  const sku = detail?.productSkus?.[0]?.skuId;
  return sku != null ? String(sku) : null;
}

/** 商品库优先：keyword search → ImageSearchProduct candidates with internal goodsId. */
export async function searchCatalogImageCandidates(
  title: string,
  limit = 8
): Promise<ImageSearchProduct[]> {
  if (!isMallGatewayConfigured()) return [];

  const terms = extractCatalogSearchTerms(title);
  if (terms.length === 0) return [];

  const seen = new Map<string, ImageSearchProduct>();

  for (const kw of terms) {
    const { rows } = await fetchMallPage(1, Math.min(limit * 2, 20), kw);
    for (const row of rows) {
      const base = rowToCatalogBase(row);
      if (!base || !isInternalGoodsId(base.candidateId)) continue;
      if (seen.has(base.candidateId)) continue;

      const catalogUrl =
        base.tangbuyUrl?.trim() || catalogUrlForItemId(base.candidateId);
      const detail = await fetchItemDetail(catalogUrl);
      const skuId = pickDefaultSkuId(detail);

      seen.set(base.candidateId, {
        productId: base.candidateId,
        title: base.title,
        imageUrl: base.imageUrl,
        detailUrl: catalogUrl,
        price: base.price != null ? String(base.price) : null,
        supplier: base.supplierShop,
        skuId,
        catalogSource: true,
        internalGoodsId: base.candidateId,
        tangbuyCatalogUrl: catalogUrl,
        offerId1688: null,
        dataSource: detail?.dataSource ?? "PREFERRED",
      });

      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }

  return [...seen.values()];
}

/** Enrich 1688 image-search hit with catalog goodsId when offer+sku match. */
export async function enrich1688CandidateWithCatalogIdentity(
  candidate: ImageSearchProduct,
  titleHint?: string | null,
  shopName?: string | null
): Promise<ImageSearchProduct> {
  if (candidate.catalogSource || candidate.internalGoodsId) return candidate;

  const offerId = isOfferId1688(candidate.productId)
    ? candidate.productId
    : extractOfferIdFromUrl(candidate.detailUrl);
  const sku = candidate.skuId?.trim();
  if (!offerId || !sku) return candidate;

  const match = await resolveInternalGoodsIdByOfferSku({
    offerId1688: offerId,
    tangbuySkuId: sku,
    titleHint,
    shopName,
  });
  if (!match) return { ...candidate, offerId1688: offerId };

  return {
    ...candidate,
    offerId1688: offerId,
    internalGoodsId: match.internalGoodsId,
    catalogItemId: match.catalogItemId,
    tangbuyCatalogUrl: match.tangbuyCatalogUrl,
    dataSource: match.dataSource ?? "PREFERRED",
    catalogResolvedVia: match.resolvedVia,
  };
}

export function identityFromSearchCandidate(
  candidate: ImageSearchProduct
): ProductSourceIdentity {
  const now = new Date().toISOString();
  const internal = candidate.internalGoodsId?.trim() || null;
  const offer =
    candidate.offerId1688?.trim() ||
    (isOfferId1688(candidate.productId) ? candidate.productId : null) ||
    extractOfferIdFromUrl(candidate.detailUrl);

  if (internal) {
    return {
      internalGoodsId: internal,
      catalogItemId: candidate.catalogItemId ?? internal,
      tangbuyCatalogUrl: candidate.tangbuyCatalogUrl ?? catalogUrlForItemId(internal),
      offerId1688: offer,
      tangbuySkuId: candidate.skuId ?? null,
      offerDetailUrl: offer ? buildOfferDetailUrl(offer) : candidate.detailUrl,
      dataSource: candidate.dataSource ?? "PREFERRED",
      resolvedVia: candidate.catalogSource ? "catalog_match" : "offer_sku_lookup",
      resolvedAt: now,
    };
  }

  return {
    offerId1688: offer,
    tangbuySkuId: candidate.skuId ?? null,
    offerDetailUrl: candidate.detailUrl,
    dataSource: "OUTER",
    resolvedVia: "1688_only",
    resolvedAt: now,
  };
}

/**
 * offerProductId for confirm API — backend 1688 validator expects a 10–13 digit offer id.
 * Catalog-only hits (no 1688 id) fall back to internal goods id + tangbuy detailUrl (itemGet).
 */
export function resolveConfirmOfferProductId(
  candidate: ImageSearchProduct,
  identity?: ProductSourceIdentity | null
): string {
  const offer =
    identity?.offerId1688?.trim() ||
    candidate.offerId1688?.trim() ||
    extractOfferIdFromUrl(identity?.offerDetailUrl ?? candidate.detailUrl) ||
    (isOfferId1688(candidate.productId) ? candidate.productId : null);
  if (offer) return offer;

  const internal =
    identity?.internalGoodsId?.trim() ||
    candidate.internalGoodsId?.trim() ||
    (isInternalGoodsId(candidate.productId) ? candidate.productId : null);
  if (internal) return internal;

  return candidate.productId;
}

/** detailUrl for confirm — catalog/internal ids must use tangbuy itemGet URL. */
export function resolveConfirmDetailUrl(
  candidate: ImageSearchProduct,
  identity?: ProductSourceIdentity | null,
  offerProductId?: string | null
): string | null {
  const internal =
    identity?.internalGoodsId?.trim() ||
    candidate.internalGoodsId?.trim() ||
    (offerProductId && isInternalGoodsId(offerProductId) ? offerProductId : null);

  const tangbuy =
    identity?.tangbuyCatalogUrl?.trim() ||
    candidate.tangbuyCatalogUrl?.trim() ||
    (internal ? catalogUrlForItemId(internal) : null);

  if (internal || candidate.catalogSource) {
    return tangbuy || candidate.detailUrl?.trim() || null;
  }

  const offer =
    offerProductId?.trim() ||
    identity?.offerId1688?.trim() ||
    candidate.offerId1688?.trim() ||
    extractOfferIdFromUrl(candidate.detailUrl);

  return (
    tangbuy ||
    identity?.offerDetailUrl?.trim() ||
    candidate.detailUrl?.trim() ||
    (offer && isOfferId1688(offer) ? buildOfferDetailUrl(offer) : null)
  );
}

/** User-facing source detail link — Tangbuy catalog when ingested, otherwise 1688 offer URL. */
export function resolveSourceDetailHref(input: {
  binding?: ImageBindingView | null;
  candidate?: Pick<
    ImageSearchProduct,
    | "detailUrl"
    | "internalGoodsId"
    | "tangbuyCatalogUrl"
    | "catalogSource"
    | "productId"
    | "offerId1688"
  > | null;
  identity?: ProductSourceIdentity | null;
}): string | null {
  const identity = input.identity ?? input.binding?.sourceIdentity ?? null;

  if (input.candidate) {
    return (
      resolveConfirmDetailUrl(input.candidate as ImageSearchProduct, identity) ??
      input.candidate.detailUrl?.trim() ??
      null
    );
  }

  const internal =
    identity?.internalGoodsId?.trim() ||
    (input.binding?.tangbuyProductId?.trim() &&
    isInternalGoodsId(input.binding.tangbuyProductId)
      ? input.binding.tangbuyProductId.trim()
      : null);

  if (internal) {
    return (
      identity?.tangbuyCatalogUrl?.trim() ||
      buildTangbuyProductUrl(internal, identity?.dataSource ?? "PREFERRED")
    );
  }

  if (
    identity?.tangbuyCatalogUrl?.trim() &&
    (identity.poolIngestStatus === "resolved" ||
      identity.resolvedVia === "pool_ingest_resolved")
  ) {
    return identity.tangbuyCatalogUrl.trim();
  }

  return (
    input.binding?.detailUrl?.trim() ||
    identity?.offerDetailUrl?.trim() ||
    null
  );
}
