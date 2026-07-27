import { api } from "@/lib/api";
import { extractOfferIdFromUrl } from "@/lib/catalog-product-resolve";
import {
  catalogUrlFromGoodsId,
  ensurePoolIngestForLogistics,
  pollResolveGoodsIdAfterPool,
} from "@/lib/tangbuy/preferred-pool";
import {
  resolvePublishSnapshot,
  toPublishSnapshot,
} from "@/lib/tangbuy-mall-gateway";
import {
  needsPricingSetup,
  PRICING_TEMPLATE_REQUIRED,
} from "@/lib/listing-pricing";
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
  /** 优选池已提交，goodsId 尚未就绪——与商品关联一样可稍后查验，不算失败 */
  awaitingPool?: boolean;
  result?: PublishResult;
  error?: string;
  catalogItem?: CatalogRecommendation;
  poolStatus?: string;
}

const POOL_FAILED =
  "货源未能加入 Tangbuy 商品库，请稍后重试「加入并上架」。";
const POOL_CONFIG =
  "本地未配置 Tangbuy 入库凭证，无法自动加入商品库。";

function hardPoolError(
  poolStatus?: string | null,
  upstream?: string | null
): string {
  const raw = upstream?.trim() ?? "";
  if (poolStatus === "skipped" || /TANGBUY_ADMIN|未配置|凭证/i.test(raw)) {
    return POOL_CONFIG;
  }
  if (/获取不到该商品信息|商品信息/.test(raw)) {
    return "该货源暂时无法入库（上游获取不到商品信息），请换一个同款重试。";
  }
  if (/I\/O error|HTTP response code: 500|gateway|不可达|502|500/i.test(raw)) {
    return "Tangbuy 入库服务暂时不可用，请稍后再试「加入并上架」。";
  }
  if (raw && raw.length < 160 && !/java\.lang|Exception|at /.test(raw)) {
    return `入库失败：${raw}`;
  }
  return POOL_FAILED;
}

async function resolve1688ToCatalogItem(
  hit: SourcingSearchHit,
  shopName: string,
  template: PricingTemplate | null | undefined,
  onPhase?: (phase: PublishSourcingPhase) => void
): Promise<
  | { item: CatalogRecommendation; poolStatus: string }
  | { awaitingPool: true; poolStatus: string }
  | { error: string; poolStatus?: string }
> {
  const offerId =
    hit.offerId1688?.trim() ||
    extractOfferIdFromUrl(hit.detailUrl1688) ||
    null;
  if (!offerId) {
    return { error: POOL_FAILED };
  }

  onPhase?.("pool_ingest");
  // 前台只提交入库，不阻塞轮询（索引常需数十秒，对用户不友好）
  const identity = await ensurePoolIngestForLogistics({
    offerId1688: offerId,
    tangbuySkuId: hit.skuId,
    titleHint: hit.title,
    shopName,
    retryPoolSubmit: true,
    skipPoolPoll: true,
  });

  const poolStatus = identity.poolIngestStatus ?? "pending_resolve";
  if (poolStatus === "failed" || poolStatus === "skipped") {
    const upstream = identity.poolIngestError?.trim() || null;
    if (typeof console !== "undefined") {
      console.error(
        `[sourcing/publish] pool ingest failed offerId=${offerId} status=${poolStatus}` +
          (upstream ? ` error=${upstream}` : "")
      );
    }
    return {
      error: hardPoolError(poolStatus, upstream),
      poolStatus,
    };
  }

  let goodsId = identity.internalGoodsId?.trim() ?? null;
  if (!goodsId) {
    // 仅做一次即时反查；查不到则交给后台，UI 立刻结束等待
    onPhase?.("pool_poll");
    const match = await pollResolveGoodsIdAfterPool({
      offerId1688: offerId,
      tangbuySkuId: hit.skuId,
      titleHint: hit.title,
      shopName,
      quick: true,
    });
    goodsId = match?.internalGoodsId?.trim() ?? null;
  }

  if (!goodsId) {
    return { awaitingPool: true, poolStatus: "pending_resolve" };
  }

  const enrichedHit: SourcingSearchHit = {
    ...hit,
    candidateId: goodsId,
    goodsId,
    tangbuyUrl: catalogUrlFromGoodsId(goodsId),
    poolIngestStatus: "resolved",
  };
  return {
    item: hitToCatalogRecommendation(enrichedHit, template),
    poolStatus: "resolved",
  };
}

/**
 * Publish orchestrator — Tangbuy direct; 1688 must enter preferred pool first.
 * Never writes Shopify from a raw 1688 offer id.
 *
 * When pool ingest is accepted but catalog index is slow, returns
 * `{ ok: true, awaitingPool: true }` so UI can treat it as in-progress.
 */
export async function publishSourcingHit(
  input: PublishSourcingHitInput
): Promise<PublishSourcingHitResult> {
  const { hit, shopName, template, onPhase } = input;
  onPhase?.("preparing");

  // Discover / list-to-Shopify must use a saved markup template — system default
  // is near purchase cost and can list at a loss after fees.
  if (needsPricingSetup(template)) {
    onPhase?.("failed");
    return { ok: false, error: PRICING_TEMPLATE_REQUIRED };
  }

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
      return { ok: false, error: resolved.error, poolStatus: resolved.poolStatus };
    }
    if ("awaitingPool" in resolved) {
      onPhase?.("pool_poll");
      return {
        ok: true,
        awaitingPool: true,
        poolStatus: resolved.poolStatus,
      };
    }
    catalogItem = resolved.item;
    poolStatus = resolved.poolStatus;
  } else {
    const candidateId = hit.candidateId?.trim() || hit.goodsId?.trim();
    if (!candidateId) {
      return { ok: false, error: POOL_FAILED };
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
    return { ok: false, error: msg, catalogItem, poolStatus };
  }
}

/**
 * After {@link publishSourcingHit} returns `awaitingPool`, keep polling the preferred-pool
 * index in the background and retry publish once goodsId is ready. Fire-and-forget.
 */
export function continuePublishAfterPoolInBackground(
  input: PublishSourcingHitInput,
  opts?: {
    onPublished?: (productId: string, item: CatalogRecommendation) => void;
    onPublishing?: () => void;
  }
): void {
  void (async () => {
    const offerId =
      input.hit.offerId1688?.trim() ||
      extractOfferIdFromUrl(input.hit.detailUrl1688) ||
      null;
    if (!offerId) return;
    const match = await pollResolveGoodsIdAfterPool({
      offerId1688: offerId,
      tangbuySkuId: input.hit.skuId,
      titleHint: input.hit.title,
      shopName: input.shopName,
    });
    const goodsId = match?.internalGoodsId?.trim();
    if (!goodsId) return;
    const retryHit: SourcingSearchHit = {
      ...input.hit,
      source: "tangbuy",
      candidateId: goodsId,
      goodsId,
      tangbuyUrl: catalogUrlFromGoodsId(goodsId),
    };
    const retry = await publishSourcingHit({
      ...input,
      hit: retryHit,
    });
    if (!retry.ok || !retry.result) return;
    const productId = retry.result.shopifyProductId?.trim();
    if (
      retry.result.publishStatus === "PUBLISHED" &&
      productId &&
      retry.catalogItem
    ) {
      opts?.onPublished?.(productId, retry.catalogItem);
    } else if (retry.result.publishStatus === "PUBLISHING") {
      opts?.onPublishing?.();
    }
  })();
}
