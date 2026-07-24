import type { PoolIngestStatus, QuoteStatus } from "@/lib/types";

/** User-facing label when 1688 source is not yet in Tangbuy catalog. */
export const GOODS_INGESTING_MESSAGE = "商品入库中";

/** Friendly copy — no offer IDs or admin tokens in the UI. */
export const GOODS_SOURCE_NOT_READY_USER_MESSAGE =
  "货源尚未成功入库，请返回选品页重新确认后再试。";

/** Why logistics estimate cannot run yet (distinct from real quote API failure). */
export type EstimateGoodsBlockReason =
  | "ingesting"
  | "pool_failed"
  | "pool_not_configured"
  | "unresolved_offer";

export function isPoolIngestPending(
  status?: PoolIngestStatus | null
): boolean {
  return (
    status === "submitted" ||
    status === "pending_resolve" ||
    status === "already_exists"
  );
}

/** Terminal pool outcomes — do not re-submit on every page load. */
export function isTerminalPoolIngestStatus(
  status?: PoolIngestStatus | null
): boolean {
  return status === "failed" || status === "skipped";
}

export function quoteStatusForGoodsBlock(
  reason: EstimateGoodsBlockReason
): QuoteStatus {
  if (reason === "ingesting" || reason === "unresolved_offer") {
    return "INGESTING";
  }
  return "FAILED";
}

export function buildEstimateGoodsBlockMessage(
  reason: EstimateGoodsBlockReason,
  _offerId?: string | null
): string {
  switch (reason) {
    case "ingesting":
    case "unresolved_offer":
      return GOODS_INGESTING_MESSAGE;
    case "pool_failed":
    case "pool_not_configured":
      return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
    default:
      return GOODS_INGESTING_MESSAGE;
  }
}

/** Technical detail for browser console — never shown in product UI. */
export function logEstimateGoodsBlockDiagnostic(
  reason: EstimateGoodsBlockReason,
  detail: {
    offerId?: string | null;
    poolIngestStatus?: PoolIngestStatus | null;
    upstreamError?: string | null;
    context?: string;
  }
): void {
  if (typeof console === "undefined") return;
  const payload = {
    reason,
    offerId: detail.offerId?.trim() || undefined,
    poolIngestStatus: detail.poolIngestStatus ?? undefined,
    upstreamError: detail.upstreamError?.trim() || undefined,
    context: detail.context,
  };
  if (reason === "pool_failed" || reason === "pool_not_configured") {
    console.error("[logistics/goods-block]", payload);
  } else {
    console.warn("[logistics/goods-block]", payload);
  }
}

/** Strip technical pool/token/offer details before showing quote errors in UI. */
export function userFacingQuoteErrorMessage(message?: string | null): string | undefined {
  const raw = message?.trim();
  if (!raw) return undefined;
  if (
    raw.includes("1688") ||
    raw.includes("TANGBUY_ADMIN") ||
    raw.includes("商品库登记") ||
    raw.includes("认证失败") ||
    raw.includes("preferred-pool") ||
    raw.includes("HTTP {{") ||
    raw.includes("Request failed")
  ) {
    return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
  }
  return raw;
}

/** Gateway rejected estimate because goodsId is not a catalog internal id yet. */
export function buildGatewayGoodsNotReadyMessage(
  _offerId?: string | null
): string {
  return GOODS_INGESTING_MESSAGE;
}

export function isGatewayGoodsNotReadyMessage(msg?: string | null): boolean {
  if (!msg?.trim()) return false;
  const t = msg.trim();
  return (
    t.includes("商品库") ||
    t.includes("入库中") ||
    t.includes("同步到 Tangbuy") ||
    t.includes("INVALID_GOODS_ID") ||
    t.includes("data: null") ||
    t.includes("internal ID")
  );
}

export function classifyGoodsBlockFromIdentity(
  identity?: import("@/lib/types").ProductSourceIdentity | null
): EstimateGoodsBlockReason {
  if (!identity) return "unresolved_offer";
  if (identity.poolIngestStatus === "skipped") return "pool_not_configured";
  if (identity.poolIngestStatus === "failed") return "pool_failed";
  if (isPoolIngestPending(identity.poolIngestStatus)) return "ingesting";
  return "unresolved_offer";
}
