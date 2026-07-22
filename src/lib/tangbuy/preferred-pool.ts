import {
  extractOfferIdFromUrl,
  invalidateCatalogOfferMapCache,
  isInternalGoodsId,
  isOfferId1688,
  resolveInternalGoodsIdByOfferSku,
  resolveProductSourceIdentity,
  type ResolveProductSourceInput,
} from "@/lib/catalog-product-resolve";
import { buildOfferDetailUrl } from "@/lib/logistics/variant-measures";
import { buildTangbuyProductUrl } from "@/lib/tangbuy-mall-gateway";
import type { PoolIngestStatus, ProductSourceIdentity } from "@/lib/types";

/** 入池后反查 goodsId：首次等待 2s，避免索引尚未就绪 */
const POLL_DELAYS_MS = [2000, 4000, 6000, 8000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface PreferredPoolAddResult {
  ok: boolean;
  status: PoolIngestStatus;
  msg?: string;
  error?: string;
  skipped?: boolean;
}

async function submitPreferredPoolAdd(
  offerId1688: string
): Promise<PreferredPoolAddResult> {
  try {
    const res = await fetch("/api/tangbuy/preferred-pool/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerItemId: offerId1688,
        providerType: "alibaba",
      }),
    });
    const body = (await res.json()) as PreferredPoolAddResult & {
      status?: string;
    };
    if (body.ok) {
      return {
        ok: true,
        status:
          body.status === "already_exists" ? "already_exists" : "submitted",
        msg: body.msg,
      };
    }
    if (body.skipped) {
      return { ok: false, status: "skipped", error: body.error, skipped: true };
    }
    return { ok: false, status: "failed", error: body.error ?? "登记失败" };
  } catch (e) {
    return {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : "登记请求失败",
    };
  }
}

/** Poll catalog until offerId+sku resolves to internal goodsId after pool ingest. */
export async function pollResolveGoodsIdAfterPool(input: {
  offerId1688: string;
  tangbuySkuId?: string | null;
  titleHint?: string | null;
  shopName?: string | null;
}): Promise<ReturnType<typeof resolveInternalGoodsIdByOfferSku>> {
  const offerId = input.offerId1688.trim();
  const sku = input.tangbuySkuId?.trim();
  if (!offerId) return null;

  for (const delay of POLL_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    if (sku) {
      try {
        const match = await resolveInternalGoodsIdByOfferSku({
          offerId1688: offerId,
          tangbuySkuId: sku,
          titleHint: input.titleHint,
          shopName: input.shopName,
        });
        if (match) return match;
      } catch {
        // Gateway offline / CORS — stop polling this round quietly.
      }
    }
  }
  return null;
}

function mergePoolResolvedIdentity(
  base: ProductSourceIdentity,
  match: NonNullable<Awaited<ReturnType<typeof resolveInternalGoodsIdByOfferSku>>>,
  poolStatus: PoolIngestStatus
): ProductSourceIdentity {
  const now = new Date().toISOString();
  return {
    ...base,
    internalGoodsId: match.internalGoodsId,
    catalogItemId: match.catalogItemId,
    tangbuyCatalogUrl: match.tangbuyCatalogUrl,
    offerId1688: match.offerId1688,
    tangbuySkuId: match.tangbuySkuId ?? base.tangbuySkuId,
    offerDetailUrl: buildOfferDetailUrl(match.offerId1688),
    dataSource: match.dataSource ?? "PREFERRED",
    resolvedVia: "pool_ingest_resolved",
    resolvedAt: now,
    poolIngestStatus: poolStatus === "already_exists" ? "already_exists" : "resolved",
    poolIngestedAt: base.poolIngestedAt ?? now,
  };
}

/**
 * Resolve product identity; if OUTER 1688 only, silently ingest to preferred pool
 * and poll for internal goodsId (confirm-binding / manual link entry point).
 */
export async function resolveIdentityWithPreferredPool(
  input: ResolveProductSourceInput & { skipPoolIngest?: boolean }
): Promise<ProductSourceIdentity> {
  const identity = await resolveProductSourceIdentity(input);
  if (identity.internalGoodsId?.trim()) {
    return { ...identity, poolIngestStatus: "not_needed" };
  }
  if (input.skipPoolIngest) return identity;

  const offerId =
    identity.offerId1688?.trim() ||
    extractOfferIdFromUrl(input.detailUrl) ||
    (isOfferId1688(input.tangbuyProductId) ? input.tangbuyProductId!.trim() : null);

  if (!offerId) return identity;

  const pool = await submitPreferredPoolAdd(offerId);
  const now = new Date().toISOString();
  const withPoolMeta: ProductSourceIdentity = {
    ...identity,
    offerId1688: offerId,
    poolIngestedAt: now,
    poolIngestStatus: pool.ok ? "pending_resolve" : pool.skipped ? "skipped" : "failed",
  };

  if (!pool.ok && pool.status !== "skipped") {
    return withPoolMeta;
  }

  if (input.shopName?.trim()) {
    invalidateCatalogOfferMapCache(input.shopName);
  }

  const match = await pollResolveGoodsIdAfterPool({
    offerId1688: offerId,
    tangbuySkuId: input.tangbuySkuId,
    titleHint: input.titleHint,
    shopName: input.shopName,
  });

  if (match) {
    return mergePoolResolvedIdentity(withPoolMeta, match, pool.status);
  }

  return {
    ...withPoolMeta,
    poolIngestStatus: "pending_resolve",
  };
}

/**
 * Logistics / backfill: ensure offer is in pool, poll, return updated identity.
 */
export async function ensurePoolIngestForLogistics(input: {
  offerId1688: string;
  tangbuySkuId?: string | null;
  titleHint?: string | null;
  shopName?: string | null;
  existingIdentity?: ProductSourceIdentity | null;
}): Promise<ProductSourceIdentity> {
  const offerId = input.offerId1688.trim();
  const now = new Date().toISOString();
  const base: ProductSourceIdentity = {
    ...(input.existingIdentity ?? {}),
    offerId1688: offerId,
    tangbuySkuId: input.tangbuySkuId ?? input.existingIdentity?.tangbuySkuId ?? null,
    dataSource: input.existingIdentity?.dataSource ?? "OUTER",
    resolvedVia: input.existingIdentity?.resolvedVia ?? "1688_only",
  };

  if (input.existingIdentity?.internalGoodsId?.trim()) {
    return input.existingIdentity;
  }

  const pending = input.existingIdentity?.poolIngestStatus;
  const needsSubmit = !pending || pending === "failed";

  let withPool = input.existingIdentity ?? base;

  if (needsSubmit) {
    const pool = await submitPreferredPoolAdd(offerId);
    withPool = {
      ...base,
      poolIngestedAt: now,
      poolIngestStatus: pool.ok
        ? "pending_resolve"
        : pool.skipped
          ? "skipped"
          : "failed",
    };
    if (!pool.ok && !pool.skipped) return withPool;
    if (input.shopName?.trim()) {
      invalidateCatalogOfferMapCache(input.shopName);
    }
  } else if (pending === "skipped") {
    return { ...withPool, poolIngestStatus: "skipped" };
  }

  const match = await pollResolveGoodsIdAfterPool({
    offerId1688: offerId,
    tangbuySkuId: input.tangbuySkuId,
    titleHint: input.titleHint,
    shopName: input.shopName,
  });

  if (match) {
    return mergePoolResolvedIdentity(withPool, match, "resolved");
  }

  return { ...withPool, poolIngestStatus: "pending_resolve" };
}

/** Retry resolution for bindings that were pool-ingested but goodsId not yet indexed. */
export async function retryPendingPoolResolve(
  identity: ProductSourceIdentity,
  input: {
    tangbuySkuId?: string | null;
    titleHint?: string | null;
    shopName?: string | null;
  }
): Promise<ProductSourceIdentity> {
  if (identity.internalGoodsId?.trim()) return identity;
  if (
    identity.poolIngestStatus !== "pending_resolve" &&
    identity.poolIngestStatus !== "submitted" &&
    identity.poolIngestStatus !== "already_exists"
  ) {
    return identity;
  }

  const offerId = identity.offerId1688?.trim();
  if (!offerId) return identity;

  const match = await pollResolveGoodsIdAfterPool({
    offerId1688: offerId,
    tangbuySkuId: input.tangbuySkuId ?? identity.tangbuySkuId,
    titleHint: input.titleHint,
    shopName: input.shopName,
  });

  if (!match) return identity;

  return mergePoolResolvedIdentity(
    identity,
    match,
    identity.poolIngestStatus === "already_exists"
      ? "already_exists"
      : "resolved"
  );
}

export function catalogUrlFromGoodsId(goodsId: string): string {
  return buildTangbuyProductUrl(goodsId, "PREFERRED");
}

export { isInternalGoodsId, isOfferId1688 };
