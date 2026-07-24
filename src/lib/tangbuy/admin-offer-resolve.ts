import { fetchTangbuyAdmin } from "@/lib/tangbuy/admin-http";
import { isPreferredPoolConfigured } from "@/lib/tangbuy/preferred-pool-config";

const INTERNAL_GOODS_ID_PATTERN = /^\d{14,}$/;

export interface AdminOfferResolveResult {
  internalGoodsId: string;
  tangbuyCatalogUrl: string;
  providerItemId: string;
  itemName?: string | null;
}

interface AdminPageRow {
  itemId?: number | string;
  providerItemId?: string | number;
  detailUrl?: string | null;
  itemName?: string | null;
  status?: string | null;
}

/**
 * Resolve 1688 offerId → Tangbuy internal goodsId via admin ES (authoritative after pool ingest).
 * Mall gateway keyword search often returns 0 rows for the same offer.
 */
export async function resolveOfferViaAdminCatalog(
  offerId1688: string
): Promise<AdminOfferResolveResult | null> {
  if (!isPreferredPoolConfigured()) return null;

  const offerId = offerId1688.trim();
  if (!offerId) return null;

  let upstream: Response;
  try {
    upstream = await fetchTangbuyAdmin("/product-mall/admin/es/product/pageInfo", {
      method: "POST",
      headers: {
        Referer: "https://admin.tangbuy.cc/goods/summary",
      },
      jsonBody: {
        pageNum: 1,
        pageSize: 5,
        pageType: "0",
        categoryIdList: [],
        manageLabelIdList: [],
        labelIdList: [],
        providerItemId: offerId,
      },
    });
  } catch {
    return null;
  }

  const text = await upstream.text();
  let parsed: { code?: number; rows?: AdminPageRow[] } | undefined;
  try {
    parsed = text ? (JSON.parse(text) as { code?: number; rows?: AdminPageRow[] }) : undefined;
  } catch {
    return null;
  }

  if (parsed?.code !== 200 && parsed?.code !== 0) return null;
  const rows = parsed?.rows ?? [];

  for (const row of rows) {
    const status = row.status?.trim();
    if (status && status.toUpperCase() !== "ON") continue;

    const provider = String(row.providerItemId ?? "").trim();
    if (provider && provider !== offerId) continue;

    const rawId = row.itemId;
    if (rawId == null) continue;
    const internalGoodsId = String(rawId).trim();
    if (!INTERNAL_GOODS_ID_PATTERN.test(internalGoodsId)) continue;

    const tangbuyCatalogUrl =
      row.detailUrl?.trim() ||
      `https://www.tangbuy.cc/product?dataSource=PREFERRED&id=${internalGoodsId}`;

    return {
      internalGoodsId,
      tangbuyCatalogUrl,
      providerItemId: provider || offerId,
      itemName: row.itemName,
    };
  }

  return null;
}
