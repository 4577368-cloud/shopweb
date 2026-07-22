import type { PoolIngestStatus, QuoteStatus } from "@/lib/types";

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
  if (reason === "ingesting") return "INGESTING";
  return "FAILED";
}

export function buildEstimateGoodsBlockMessage(
  reason: EstimateGoodsBlockReason,
  offerId?: string | null
): string {
  const offerHint = offerId?.trim() ? `（1688 ${offerId.trim()}）` : "";
  switch (reason) {
    case "ingesting":
      return (
        `商品入库中${offerHint}：已登记 Tangbuy 商品库，正在同步规格与报价 ID。` +
        `通常需数十秒，请稍后点击「拉取报价」重试，无需重新选品。`
      );
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
    case "unresolved_offer":
      return (
        `货源 ID 尚未解析为商品库 goodsId${offerHint}。` +
        `系统正在尝试登记商品库，请稍后重试拉取报价。`
      );
    default:
      return `无法解析商品库 goodsId${offerHint}，请稍后重试。`;
  }
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
