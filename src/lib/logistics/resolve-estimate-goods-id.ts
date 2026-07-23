import {
  isInternalGoodsId,
  isOfferId1688,
  resolveInternalGoodsIdByOfferSku,
  resolveProductSourceIdentity,
} from "@/lib/catalog-product-resolve";
import {
  buildEstimateGoodsBlockMessage,
  buildGatewayGoodsNotReadyMessage,
  classifyGoodsBlockFromIdentity,
  type EstimateGoodsBlockReason,
  isPoolIngestPending,
} from "@/lib/logistics/estimate-goods-block";
import { buildOfferDetailUrl } from "@/lib/logistics/variant-measures";
import {
  readProductSourceIdentity,
  resolveEstimateGoodsIdFromIdentity,
} from "@/lib/product-source-identity";
import {
  ensurePoolIngestForLogistics,
  retryPendingPoolResolve,
} from "@/lib/tangbuy/preferred-pool";
import type { ProductSourceIdentity } from "@/lib/types";

export interface EstimateGoodsIdInput {
  tangbuyGoodsId: string;
  tangbuySkuId: string;
  detailUrl?: string | null;
  titleHint?: string | null;
  thirdPlatformItemId?: string | null;
}

export interface ResolvedEstimateGoodsId {
  goodsId: string;
  source: "internal" | "catalog" | "offer_sku_lookup" | "stored" | "pool_ingest";
  offerId1688?: string;
  identity?: ProductSourceIdentity;
}

export interface UnresolvedEstimateGoodsId {
  errorMessage: string;
  offerId1688?: string;
  identity?: ProductSourceIdentity;
  blockReason: EstimateGoodsBlockReason;
}

export type EstimateGoodsIdResult = ResolvedEstimateGoodsId | UnresolvedEstimateGoodsId;

function isEstimateReadyGoodsId(
  goodsId: string,
  identity?: ProductSourceIdentity | null
): boolean {
  const id = goodsId.trim();
  if (!isInternalGoodsId(id) || isOfferId1688(id)) return false;
  if (
    identity &&
    isPoolIngestPending(identity.poolIngestStatus) &&
    identity.internalGoodsId?.trim() !== id
  ) {
    return false;
  }
  return true;
}

function asUnresolvedIngesting(
  variant: EstimateGoodsIdInput,
  offerId?: string | null,
  identity?: ProductSourceIdentity
): UnresolvedEstimateGoodsId {
  return {
    errorMessage: buildGatewayGoodsNotReadyMessage(offerId),
    offerId1688: offerId ?? undefined,
    identity,
    blockReason: "ingesting",
  };
}

function extractOfferIdFromUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const match = raw.match(/offer\/(\d+)/i);
  return match?.[1] ?? null;
}

function unresolvedFromIdentity(
  identity: ProductSourceIdentity,
  offerId: string
): UnresolvedEstimateGoodsId {
  const blockReason = classifyGoodsBlockFromIdentity(identity);
  return {
    errorMessage: buildEstimateGoodsBlockMessage(blockReason, offerId),
    offerId1688: offerId,
    identity,
    blockReason,
  };
}

async function persistIdentity(
  shopName: string | undefined,
  itemId: string | undefined,
  identity: ProductSourceIdentity
): Promise<void> {
  if (!shopName?.trim() || !itemId?.trim()) return;
  const { writeProductSourceIdentity } = await import("@/lib/product-source-identity");
  writeProductSourceIdentity(shopName, itemId, identity);
}

async function resolveWithPoolIngest(
  input: EstimateGoodsIdInput,
  shopName: string | undefined,
  offerId: string,
  baseIdentity: ProductSourceIdentity
): Promise<EstimateGoodsIdResult> {
  const existing =
    shopName && input.thirdPlatformItemId?.trim()
      ? readProductSourceIdentity(shopName, input.thirdPlatformItemId)
      : null;

  const mergedBase: ProductSourceIdentity = { ...baseIdentity, ...existing, offerId1688: offerId };

  const afterPool = await ensurePoolIngestForLogistics({
    offerId1688: offerId,
    tangbuySkuId: input.tangbuySkuId,
    titleHint: input.titleHint,
    shopName,
    existingIdentity: mergedBase,
  });

  await persistIdentity(shopName, input.thirdPlatformItemId ?? undefined, afterPool);

  if (afterPool.internalGoodsId?.trim()) {
    const goodsId = afterPool.internalGoodsId;
    if (!isEstimateReadyGoodsId(goodsId, afterPool)) {
      return asUnresolvedIngesting(input, offerId, afterPool);
    }
    return {
      goodsId,
      source: "pool_ingest",
      offerId1688: offerId,
      identity: afterPool,
    };
  }

  return unresolvedFromIdentity(afterPool, offerId);
}

export async function resolveEstimateGoodsId(
  input: EstimateGoodsIdInput,
  shopName?: string
): Promise<EstimateGoodsIdResult> {
  const rawGoodsId = input.tangbuyGoodsId.trim();
  const tangbuySkuId = input.tangbuySkuId.trim();
  if (!rawGoodsId) {
    return {
      errorMessage: "缺少货源商品 ID",
      blockReason: "unresolved_offer",
    };
  }

  if (shopName && input.thirdPlatformItemId?.trim()) {
    const stored = readProductSourceIdentity(shopName, input.thirdPlatformItemId);
    let effective = stored
      ? await retryPendingPoolResolve(stored, {
          tangbuySkuId,
          titleHint: input.titleHint,
          shopName,
        })
      : null;

    if (effective?.internalGoodsId?.trim()) {
      const goodsId = effective.internalGoodsId;
      if (!isEstimateReadyGoodsId(goodsId, effective)) {
        return asUnresolvedIngesting(
          input,
          effective.offerId1688 ?? undefined,
          effective
        );
      }
      await persistIdentity(shopName, input.thirdPlatformItemId, effective);
      return {
        goodsId,
        source: "stored",
        offerId1688: effective.offerId1688 ?? undefined,
        identity: effective,
      };
    }

    const fromStored = resolveEstimateGoodsIdFromIdentity(effective ?? stored, rawGoodsId);
    if (fromStored && isEstimateReadyGoodsId(fromStored, effective ?? stored)) {
      return {
        goodsId: fromStored,
        source: "stored",
        offerId1688: (effective ?? stored)?.offerId1688 ?? undefined,
        identity: effective ?? stored ?? undefined,
      };
    }

    const offerFromStored =
      (effective ?? stored)?.offerId1688?.trim() ||
      extractOfferIdFromUrl(input.detailUrl) ||
      (isOfferId1688(rawGoodsId) ? rawGoodsId : null);

    if (
      offerFromStored &&
      isPoolIngestPending((effective ?? stored)?.poolIngestStatus)
    ) {
      return resolveWithPoolIngest(
        input,
        shopName,
        offerFromStored,
        effective ?? stored ?? { offerId1688: offerFromStored }
      );
    }
  }

  if (isInternalGoodsId(rawGoodsId) && !isOfferId1688(rawGoodsId)) {
    const cachedIdentity =
      shopName && input.thirdPlatformItemId?.trim()
        ? readProductSourceIdentity(shopName, input.thirdPlatformItemId)
        : null;
    if (isEstimateReadyGoodsId(rawGoodsId, cachedIdentity)) {
      return {
        goodsId: rawGoodsId,
        source: "internal",
        offerId1688: extractOfferIdFromUrl(input.detailUrl) ?? undefined,
        identity: cachedIdentity ?? undefined,
      };
    }
    const offerId =
      cachedIdentity?.offerId1688?.trim() ||
      extractOfferIdFromUrl(input.detailUrl) ||
      null;
    if (offerId) {
      return resolveWithPoolIngest(
        input,
        shopName,
        offerId,
        cachedIdentity ?? { offerId1688: offerId }
      );
    }
    return asUnresolvedIngesting(input, rawGoodsId, cachedIdentity ?? undefined);
  }

  const identity = await resolveProductSourceIdentity({
    tangbuyProductId: rawGoodsId,
    tangbuySkuId,
    detailUrl: input.detailUrl,
    titleHint: input.titleHint,
    shopName,
  });

  if (identity.internalGoodsId?.trim()) {
    const goodsId = identity.internalGoodsId;
    if (!isEstimateReadyGoodsId(goodsId, identity)) {
      return asUnresolvedIngesting(
        input,
        identity.offerId1688 ?? rawGoodsId,
        identity
      );
    }
    await persistIdentity(shopName, input.thirdPlatformItemId ?? undefined, identity);
    return {
      goodsId,
      source:
        identity.resolvedVia === "offer_sku_lookup"
          ? "offer_sku_lookup"
          : "catalog",
      offerId1688: identity.offerId1688 ?? undefined,
      identity,
    };
  }

  const offerId =
    identity.offerId1688?.trim() ||
    extractOfferIdFromUrl(input.detailUrl) ||
    (isOfferId1688(rawGoodsId) ? rawGoodsId : null);

  if (isOfferId1688(rawGoodsId) || offerId) {
    return resolveWithPoolIngest(
      input,
      shopName,
      offerId ?? rawGoodsId,
      identity
    );
  }

  return {
    errorMessage: buildEstimateGoodsBlockMessage("unresolved_offer", rawGoodsId),
    blockReason: "unresolved_offer",
  };
}

export async function enrichVariantsWithEstimateGoodsIds<
  T extends EstimateGoodsIdInput & { thirdPlatformSkuId: string },
>(
  variants: T[],
  shopName?: string,
  productMeta?: { thirdPlatformItemId?: string; title?: string | null }
): Promise<
  Array<
    T & {
      tangbuyGoodsId: string;
      estimateGoodsId?: string;
      estimateGoodsError?: string;
      estimateBlockReason?: EstimateGoodsBlockReason;
      sourceIdentity?: ProductSourceIdentity;
    }
  >
> {
  return Promise.all(
    variants.map(async (variant) => {
      const resolved = await resolveEstimateGoodsId(
        {
          ...variant,
          titleHint: variant.titleHint ?? productMeta?.title ?? null,
          thirdPlatformItemId:
            variant.thirdPlatformItemId ?? productMeta?.thirdPlatformItemId,
        },
        shopName
      );
      if ("goodsId" in resolved) {
        return {
          ...variant,
          tangbuyGoodsId: resolved.goodsId,
          estimateGoodsId: resolved.goodsId,
          sourceIdentity: resolved.identity,
        };
      }
      return {
        ...variant,
        estimateGoodsError: resolved.errorMessage,
        estimateBlockReason: resolved.blockReason,
        sourceIdentity: resolved.identity,
      };
    })
  );
}

/** Backfill identity for existing bindings (e.g. on page load). */
export async function backfillProductSourceIdentity(input: {
  shopName: string;
  thirdPlatformItemId: string;
  tangbuyProductId?: string | null;
  tangbuySkuId?: string | null;
  detailUrl?: string | null;
  titleHint?: string | null;
  /** Skip slow pool polling on bulk page load — resolve on demand later. */
  skipPoolRetry?: boolean;
}): Promise<ProductSourceIdentity | null> {
  try {
    const existing = readProductSourceIdentity(input.shopName, input.thirdPlatformItemId);
    if (existing?.internalGoodsId?.trim()) return existing;

    const retried =
      existing && !input.skipPoolRetry
        ? await retryPendingPoolResolve(existing, {
            tangbuySkuId: input.tangbuySkuId,
            titleHint: input.titleHint,
            shopName: input.shopName,
          })
        : null;
    if (retried?.internalGoodsId?.trim()) {
      await persistIdentity(input.shopName, input.thirdPlatformItemId, retried);
      return retried;
    }

    const offerId =
      retried?.offerId1688?.trim() ||
      existing?.offerId1688?.trim() ||
      extractOfferIdFromUrl(input.detailUrl) ||
      (isOfferId1688(input.tangbuyProductId) ? input.tangbuyProductId!.trim() : null);

    if (offerId && !isInternalGoodsId(input.tangbuyProductId)) {
      const afterPool = await ensurePoolIngestForLogistics({
        offerId1688: offerId,
        tangbuySkuId: input.tangbuySkuId,
        titleHint: input.titleHint,
        shopName: input.shopName,
        existingIdentity: retried ?? existing ?? undefined,
      });
      if (afterPool.internalGoodsId || afterPool.poolIngestStatus) {
        await persistIdentity(input.shopName, input.thirdPlatformItemId, afterPool);
        return afterPool;
      }
    }

    const identity = await resolveProductSourceIdentity({
      tangbuyProductId: input.tangbuyProductId,
      tangbuySkuId: input.tangbuySkuId,
      detailUrl: input.detailUrl,
      titleHint: input.titleHint,
      shopName: input.shopName,
    });

    if (identity.internalGoodsId || identity.offerId1688) {
      const merged = retried ? { ...identity, ...retried } : identity;
      await persistIdentity(input.shopName, input.thirdPlatformItemId, merged);
      return merged;
    }
    return retried;
  } catch {
    return (
      readProductSourceIdentity(input.shopName, input.thirdPlatformItemId) ?? null
    );
  }
}

export { isInternalGoodsId, isOfferId1688, resolveInternalGoodsIdByOfferSku };
