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
  logEstimateGoodsBlockDiagnostic,
  type EstimateGoodsBlockReason,
  isPoolIngestPending,
  isTerminalPoolIngestStatus,
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
import type { ProductLogisticsProfile, ProductSourceIdentity } from "@/lib/types";

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

export interface EstimateGoodsResolveOptions {
  /** Smart-estimate pipeline: skip pool polling, dedupe pool submit per product. */
  bulkMode?: boolean;
}

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
  offerId: string,
  upstreamError?: string | null
): UnresolvedEstimateGoodsId {
  const blockReason = classifyGoodsBlockFromIdentity(identity);
  logEstimateGoodsBlockDiagnostic(blockReason, {
    offerId,
    poolIngestStatus: identity.poolIngestStatus,
    upstreamError,
    context: "resolveEstimateGoodsId",
  });
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
  baseIdentity: ProductSourceIdentity,
  options?: EstimateGoodsResolveOptions
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
    retryPoolSubmit: !options?.bulkMode,
    skipPoolPoll: options?.bulkMode,
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
  shopName?: string,
  options?: EstimateGoodsResolveOptions
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
    let effective = stored;
    if (stored && !options?.bulkMode) {
      effective = await retryPendingPoolResolve(stored, {
          tangbuySkuId,
          titleHint: input.titleHint,
          shopName,
        });
    }

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
      (isPoolIngestPending((effective ?? stored)?.poolIngestStatus) ||
        isTerminalPoolIngestStatus((effective ?? stored)?.poolIngestStatus))
    ) {
      return resolveWithPoolIngest(
        input,
        shopName,
        offerFromStored,
        effective ?? stored ?? { offerId1688: offerFromStored },
        options
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
        cachedIdentity ?? { offerId1688: offerId },
        options
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
      identity,
      options
    );
  }

  return {
    errorMessage: buildEstimateGoodsBlockMessage("unresolved_offer", rawGoodsId),
    blockReason: "unresolved_offer",
  };
}

/** One pool submit per product during bulk estimate (parallel-safe). */
async function preloadBulkPoolIngest(
  variants: EstimateGoodsIdInput[],
  shopName: string,
  productMeta?: { thirdPlatformItemId?: string; title?: string | null }
): Promise<void> {
  const itemIds = new Set<string>();
  for (const variant of variants) {
    const itemId =
      variant.thirdPlatformItemId?.trim() ||
      productMeta?.thirdPlatformItemId?.trim();
    if (itemId) itemIds.add(itemId);
  }

  await Promise.all(
    [...itemIds].map(async (itemId) => {
      const sample =
        variants.find(
          (v) =>
            (v.thirdPlatformItemId?.trim() || productMeta?.thirdPlatformItemId) ===
            itemId
        ) ?? variants[0];
      if (!sample) return;

      const stored = readProductSourceIdentity(shopName, itemId);
      if (stored?.internalGoodsId?.trim()) return;

      const rawGoodsId = sample.tangbuyGoodsId?.trim() ?? "";
      const offerId =
        stored?.offerId1688?.trim() ||
        extractOfferIdFromUrl(sample.detailUrl) ||
        (isOfferId1688(rawGoodsId) ? rawGoodsId : null);
      if (!offerId) return;

      const afterPool = await ensurePoolIngestForLogistics({
        offerId1688: offerId,
        tangbuySkuId: sample.tangbuySkuId,
        titleHint: sample.titleHint ?? productMeta?.title ?? null,
        shopName,
        existingIdentity: stored ?? { offerId1688: offerId },
        skipPoolPoll: true,
      });
      await persistIdentity(shopName, itemId, afterPool);
    })
  );
}

export async function enrichVariantsWithEstimateGoodsIds<
  T extends EstimateGoodsIdInput & { thirdPlatformSkuId: string },
>(
  variants: T[],
  shopName?: string,
  productMeta?: { thirdPlatformItemId?: string; title?: string | null },
  options?: EstimateGoodsResolveOptions
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
  if (options?.bulkMode && shopName?.trim() && variants.length > 0) {
    await preloadBulkPoolIngest(variants, shopName, productMeta);
  }

  return Promise.all(
    variants.map(async (variant) => {
      const resolved = await resolveEstimateGoodsId(
        {
          ...variant,
          titleHint: variant.titleHint ?? productMeta?.title ?? null,
          thirdPlatformItemId:
            variant.thirdPlatformItemId ?? productMeta?.thirdPlatformItemId,
        },
        shopName,
        options
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
  /** Re-submit pool ingest after failed/skipped (user refresh, page entry). */
  retryPoolSubmit?: boolean;
}): Promise<ProductSourceIdentity | null> {
  try {
    const existing = readProductSourceIdentity(input.shopName, input.thirdPlatformItemId);
    if (existing?.internalGoodsId?.trim()) return existing;

    if (
      isTerminalPoolIngestStatus(existing?.poolIngestStatus) &&
      !input.retryPoolSubmit
    ) {
      return existing;
    }

    if (
      input.skipPoolRetry &&
      isPoolIngestPending(existing?.poolIngestStatus)
    ) {
      return existing;
    }

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
        retryPoolSubmit: input.retryPoolSubmit,
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

export async function ingestProductSourceForLogistics(input: {
  shopName: string;
  profile: ProductLogisticsProfile;
}): Promise<{
  identity: ProductSourceIdentity | null;
  ready: boolean;
  ingesting: boolean;
}> {
  const variants = input.profile.variantDecisions ?? [];
  const sample =
    variants.find((v) => v.tangbuySkuId?.trim() && v.tangbuyGoodsId?.trim()) ??
    variants.find((v) => v.tangbuySkuId?.trim()) ??
    variants[0];

  let identity = await backfillProductSourceIdentity({
    shopName: input.shopName,
    thirdPlatformItemId: input.profile.thirdPlatformItemId,
    tangbuyProductId:
      input.profile.tangbuyProductId ?? sample?.tangbuyGoodsId ?? null,
    tangbuySkuId: sample?.tangbuySkuId ?? null,
    detailUrl: input.profile.detailUrl ?? null,
    titleHint: input.profile.title,
    retryPoolSubmit: true,
    skipPoolRetry: false,
  });

  if (!identity?.internalGoodsId?.trim()) {
    const { resolveCatalogMatchViaAdminApi } = await import(
      "@/lib/catalog-product-resolve"
    );
    const offerId =
      identity?.offerId1688?.trim() ||
      extractOfferIdFromUrl(input.profile.detailUrl) ||
      (isOfferId1688(sample?.tangbuyGoodsId) ? sample!.tangbuyGoodsId!.trim() : null) ||
      (isOfferId1688(input.profile.tangbuyProductId)
        ? input.profile.tangbuyProductId!.trim()
        : null);
    if (offerId) {
      const hit = await resolveCatalogMatchViaAdminApi({
        offerId1688: offerId,
        tangbuySkuId: sample?.tangbuySkuId,
      });
      if (hit) {
        const merged: ProductSourceIdentity = {
          ...(identity ?? {}),
          internalGoodsId: hit.internalGoodsId,
          catalogItemId: hit.catalogItemId,
          tangbuyCatalogUrl: hit.tangbuyCatalogUrl,
          tangbuySkuId: hit.tangbuySkuId,
          offerId1688: hit.offerId1688,
          dataSource: hit.dataSource ?? "PREFERRED",
          resolvedVia: hit.resolvedVia,
          poolIngestStatus: "already_exists",
          resolvedAt: new Date().toISOString(),
        };
        await persistIdentity(
          input.shopName,
          input.profile.thirdPlatformItemId,
          merged
        );
        identity = merged;
      }
    }
  }

  const ready = Boolean(identity?.internalGoodsId?.trim());
  const ingesting =
    !ready && isPoolIngestPending(identity?.poolIngestStatus ?? null);

  return { identity, ready, ingesting };
}

export { isInternalGoodsId, isOfferId1688, resolveInternalGoodsIdByOfferSku };
