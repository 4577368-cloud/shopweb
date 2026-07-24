import { api } from "@/lib/api";
import { extractOfferIdFromUrl } from "@/lib/catalog-product-resolve";
import { GOODS_SOURCE_NOT_READY_USER_MESSAGE } from "@/lib/logistics/estimate-goods-block";
import {
  catalogUrlFromGoodsId,
  ensurePoolIngestForLogistics,
  pollResolveGoodsIdAfterPool,
} from "@/lib/tangbuy/preferred-pool";
import {
  resolvePublishSnapshot,
  toPublishSnapshot,
} from "@/lib/tangbuy-mall-gateway";
import { hitToCatalogRecommendation } from "@/lib/sourcing/map-catalog";
import type { SourcingSearchHit } from "@/lib/sourcing/types";
import type { CatalogRecommendation, PricingTemplate, PublishResult } from "@/lib/types";

export type PublishSourcingPhase =
  | "preparing"
  | "pool_ingest"
  | "pool_poll"
  | "publishing"
  | "done"
  | "failed";

export interface PublishSourcingHitInput {
  hit: SourcingSearchHit;
  shopName: string;
  template?: PricingTemplate | null;
  onPhase?: (phase: PublishSourcingPhase) => void;
}

export interface PublishSourcingHitResult {
  ok: boolean;
  result?: PublishResult;
  error?: string;
  catalogItem?: CatalogRecommendation;
  poolStatus?: string;
}

function userFacingPoolError(raw?: string | null): string {
  if (!raw?.trim()) return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
  if (/TANGBUY_ADMIN_TOKEN|admin.?token|凭证|授权/i.test(raw)) {
    return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
  }
  return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
}

async function resolve1688ToCatalogItem(
  hit: SourcingSearchHit,
  shopName: string,
  template: PricingTemplate | null | undefined,
  onPhase?: (phase: PublishSourcingPhase) => void
): Promise<{ item: CatalogRecommendation; poolStatus: string } | { error: string }> {
  const offerId =
    hit.offerId1688?.trim() ||
    extractOfferIdFromUrl(hit.detailUrl1688) ||
    null;
  if (!offerId) {
    return { error: GOODS_SOURCE_NOT_READY_USER_MESSAGE };
  }

  onPhase?.("pool_ingest");
  const identity = await ensurePoolIngestForLogistics({
    offerId1688: offerId,
    tangbuySkuId: hit.skuId,
    titleHint: hit.title,
    shopName,
    retryPoolSubmit: true,
  });

  const poolStatus = identity.poolIngestStatus ?? "pending_resolve";
  if (poolStatus === "failed" || poolStatus === "skipped") {
    if (typeof console !== "undefined") {
      console.error("[sourcing/publish] pool ingest failed", {
        offerId,
        poolStatus,
      });
    }
    return { error: userFacingPoolError() };
  }

  let goodsId = identity.internalGoodsId?.trim() ?? null;
  if (!goodsId) {
    onPhase?.("pool_poll");
    const match = await pollResolveGoodsIdAfterPool({
      offerId1688: offerId,
      tangbuySkuId: hit.skuId,
      titleHint: hit.title,
      shopName,
    });
    goodsId = match?.internalGoodsId?.trim() ?? null;
  }

  if (!goodsId) {
    return {
      error:
        poolStatus === "pending_resolve"
          ? "货源入库中，请稍后再试"
          : GOODS_SOURCE_NOT_READY_USER_MESSAGE,
    };
  }

  const enrichedHit: SourcingSearchHit = {
    ...hit,
    candidateId: goodsId,
    goodsId,
    tangbuyUrl: catalogUrlFromGoodsId(goodsId),
    poolIngestStatus: goodsId ? "resolved" : poolStatus,
  };
  return {
    item: hitToCatalogRecommendation(enrichedHit, template),
    poolStatus: goodsId ? "resolved" : poolStatus,
  };
}

/**
 * Publish orchestrator — Tangbuy direct; 1688 must enter preferred pool first.
 * Never writes Shopify from a raw 1688 offer id.
 */
export async function publishSourcingHit(
  input: PublishSourcingHitInput
): Promise<PublishSourcingHitResult> {
  const { hit, shopName, template, onPhase } = input;
  onPhase?.("preparing");

  let catalogItem: CatalogRecommendation;
  let poolStatus: string | undefined;

  if (hit.source === "1688") {
    const resolved = await resolve1688ToCatalogItem(
      hit,
      shopName,
      template,
      onPhase
    );
    if ("error" in resolved) {
      return { ok: false, error: resolved.error, poolStatus };
    }
    catalogItem = resolved.item;
    poolStatus = resolved.poolStatus;
  } else {
    const candidateId = hit.candidateId?.trim() || hit.goodsId?.trim();
    if (!candidateId) {
      return { ok: false, error: GOODS_SOURCE_NOT_READY_USER_MESSAGE };
    }
    catalogItem = hitToCatalogRecommendation(
      { ...hit, candidateId, goodsId: candidateId },
      template
    );
  }

  onPhase?.("publishing");
  try {
    const snapshot = await resolvePublishSnapshot(catalogItem);
    const result = await api.publishCatalogItem(
      shopName,
      catalogItem.candidateId,
      snapshot ?? toPublishSnapshot(catalogItem)
    );
    onPhase?.("done");
    return { ok: true, result, catalogItem, poolStatus };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "上架失败";
    if (typeof console !== "undefined") {
      console.error("[sourcing/publish]", {
        hitId: hit.hitId,
        error: msg,
      });
    }
    onPhase?.("failed");
    return { ok: false, error: userFacingPoolError(msg), catalogItem, poolStatus };
  }
}
