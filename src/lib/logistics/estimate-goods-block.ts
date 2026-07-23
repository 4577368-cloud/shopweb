import type { PoolIngestStatus, QuoteStatus } from "@/lib/types";

/** User-facing label when 1688 source is not yet in Tangbuy catalog. */
export const GOODS_INGESTING_MESSAGE = "商品入库中";

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
  offerId?: string | null
): string {
  const offerHint = offerId?.trim() ? `（1688 ${offerId.trim()}）` : "";
  switch (reason) {
    case "ingesting":
    case "unresolved_offer":
      return GOODS_INGESTING_MESSAGE;
    case "pool_failed":
      return (
        `商品库登记失败${offerHint}，暂时无法拉取物流报价。` +
        `请在选品页重新确认货源，或稍后重试。`
      );
    case "pool_not_configured":
      return (
        `尚未配置商品库入池凭证，无法将 1688 货源同步到 Tangbuy 商品库，物流报价暂不可用。` +
        `请联系管理员配置 TANGBUY_ADMIN_TOKEN。`
      );
    default:
      return GOODS_INGESTING_MESSAGE;
  }
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
