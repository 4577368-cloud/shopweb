import {
  extractOfferIdFromUrl,
  isInternalGoodsId,
  isOfferId1688,
} from "@/lib/catalog-product-resolve";
import { isPoolIngestPending } from "@/lib/logistics/estimate-goods-block";
import {
  readProductSourceIdentity,
  writeProductSourceIdentity,
} from "@/lib/product-source-identity";
import { ensurePoolIngestForLogistics } from "@/lib/tangbuy/preferred-pool";
import type { ProductSourceIdentity, SkuProductOverview } from "@/lib/types";

export interface WarmLogisticsSourceInput {
  shopName: string;
  thirdPlatformItemId: string;
  offerId?: string | null;
  offerSkuId?: string | null;
  detailUrl?: string | null;
  titleHint?: string | null;
}

/**
 * After SKU bind / confirm, ensure 1688 offer is in Tangbuy catalog (pool ingest)
 * and persist identity for logistics quote resolution. Best-effort, non-blocking caller.
 */
export async function warmProductSourceAfterSkuBind(
  input: WarmLogisticsSourceInput
): Promise<ProductSourceIdentity | null> {
  const shopName = input.shopName.trim();
  const itemId = input.thirdPlatformItemId.trim();
  if (!shopName || !itemId) return null;

  const existing = readProductSourceIdentity(shopName, itemId);
  if (
    existing?.internalGoodsId?.trim() &&
    !isPoolIngestPending(existing.poolIngestStatus)
  ) {
    return existing;
  }

  const rawOffer = input.offerId?.trim() ?? "";
  let offerId1688: string | null = null;
  if (isOfferId1688(rawOffer)) {
    offerId1688 = rawOffer;
  } else if (rawOffer && isInternalGoodsId(rawOffer)) {
    const merged: ProductSourceIdentity = {
      ...(existing ?? {}),
      internalGoodsId: rawOffer,
      tangbuySkuId: input.offerSkuId ?? existing?.tangbuySkuId ?? null,
      poolIngestStatus: "not_needed",
      resolvedAt: new Date().toISOString(),
    };
    writeProductSourceIdentity(shopName, itemId, merged);
    return merged;
  }

  offerId1688 =
    offerId1688 ??
    existing?.offerId1688?.trim() ??
    extractOfferIdFromUrl(input.detailUrl) ??
    extractOfferIdFromUrl(existing?.offerDetailUrl) ??
    null;

  if (!offerId1688) return existing;

  try {
    const identity = await ensurePoolIngestForLogistics({
      offerId1688,
      tangbuySkuId: input.offerSkuId ?? existing?.tangbuySkuId,
      titleHint: input.titleHint,
      shopName,
      existingIdentity: {
        ...(existing ?? {}),
        offerId1688,
        tangbuySkuId: input.offerSkuId ?? existing?.tangbuySkuId ?? null,
      },
      retryPoolSubmit: true,
    });
    writeProductSourceIdentity(shopName, itemId, identity);
    return identity;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("[sku-align/warm-logistics-source]", {
        itemId,
        offerId1688,
        error: err instanceof Error ? err.message : err,
      });
    }
    return existing;
  }
}

export async function warmLogisticsSourceFromProduct(
  shopName: string,
  product: Pick<
    SkuProductOverview,
    "thirdPlatformItemId" | "title" | "detailUrl" | "tangbuyProductId" | "variants"
  >
): Promise<void> {
  const bound = product.variants.find(
    (v) => v.bound?.tangbuyProductId?.trim() && v.bound?.tangbuySkuId?.trim()
  );
  if (!bound?.bound) return;
  await warmProductSourceAfterSkuBind({
    shopName,
    thirdPlatformItemId: product.thirdPlatformItemId,
    offerId: bound.bound.tangbuyProductId,
    offerSkuId: bound.bound.tangbuySkuId,
    detailUrl: product.detailUrl,
    titleHint: product.title ?? undefined,
  });
}

/** Fire-and-forget pool warm for a batch of products (after align / confirm). */
export function warmLogisticsSourceFromProducts(
  shopName: string,
  products: SkuProductOverview[]
): void {
  const slice = products.slice(0, 12);
  void (async () => {
    for (const p of slice) {
      await warmLogisticsSourceFromProduct(shopName, p);
    }
  })();
}
