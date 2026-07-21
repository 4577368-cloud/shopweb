import {
  profitPerOrderPurchaseDisplay,
  parseGatewayPrice,
} from "@/lib/agents/products/match-rank";
import {
  costInPurchaseDisplayCurrency,
  formatPurchaseCostMoney,
  resolvePurchaseCostDisplayContext,
} from "@/lib/purchase-cost-display";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

export interface CandidateSummary {
  productId: string;
  title: string | null;
  priceCny: number | null;
  matchScore: number | null;
  rank: number;
  soldCount?: number | null;
  repurchaseRate?: string | null;
  inventory?: number | null;
}

function sortCandidatesByRanking(a: CandidateSummary, b: CandidateSummary): number {
  const scoreDiff = (b.matchScore ?? 0) - (a.matchScore ?? 0);
  if (scoreDiff !== 0) return scoreDiff;
  const soldDiff = (b.soldCount ?? 0) - (a.soldCount ?? 0);
  if (soldDiff !== 0) return soldDiff;
  return a.rank - b.rank;
}

export function pickTopCandidate(
  candidates: CandidateSummary[]
): CandidateSummary | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(sortCandidatesByRanking)[0]!;
}

export interface ProductFocusSnapshot {
  productId: string;
  title: string;
  shopCurrency: string | null;
  shopPrice: number | null;
  purchaseCurrency: string;
  purchaseCost: number | null;
  purchaseCostLabel: string | null;
  profitPerOrder: number | null;
  profitCurrency: string | null;
  profitLabel: string | null;
  bindState: "unbound" | "pending" | "confirmed";
  matchScore: number | null;
  matchScoreLabel: string | null;
  imageSource: string | null;
  querySource: string | null;
  boundOfferPriceCny: string | null;
  riskFlags: string[];
  rankingReasons: string[];
}

function formatMatchScore(score?: number | null): string | null {
  if (score == null || Number.isNaN(score) || score <= 0) return null;
  if (score <= 1) return `${Math.round(score * 100)}%`;
  return `${Math.round(Math.min(score, 100))}%`;
}

export function buildProductFocusSnapshot(
  product: ShopMirrorProduct,
  binding: ImageBindingView | null | undefined
): ProductFocusSnapshot {
  const shopCurrency = product.currency ?? null;
  const shopPrice = product.minPrice ?? product.maxPrice ?? null;
  const purchaseCtx = resolvePurchaseCostDisplayContext(shopCurrency);
  const costCny =
    parseGatewayPrice(binding?.offerPrice) ??
    parseGatewayPrice(binding?.offerPrice ?? null);
  const purchaseCost = costInPurchaseDisplayCurrency(costCny, purchaseCtx);
  const profit = profitPerOrderPurchaseDisplay(shopPrice, shopCurrency, costCny);

  let bindState: ProductFocusSnapshot["bindState"] = "unbound";
  if (binding?.bound) {
    bindState = binding.bindStatus === "PENDING" ? "pending" : "confirmed";
  }

  const riskFlags: string[] = [];
  if (bindState === "pending") riskFlags.push("AI 推荐待你确认，尚未生效");
  if (bindState === "unbound") riskFlags.push("尚未绑定货源");
  if (!product.primaryImageUrl) riskFlags.push("商品无主图，图搜受限");
  const ms = binding?.matchScore ?? null;
  const matchScoreLabel = formatMatchScore(ms);
  if (ms != null && ms > 0 && ms <= 1 && ms < 0.55) {
    riskFlags.push(`匹配度偏低（${matchScoreLabel}）`);
  }
  if (binding?.bound && !binding.offerImageUrl) {
    riskFlags.push("货源图快照缺失，展示可能不完整");
  }
  if (profit != null && profit.amount < 0) {
    riskFlags.push("按当前 Shopify 售价估算为负利润");
  }

  const rankingReasons: string[] = [];
  if (matchScoreLabel) rankingReasons.push(`图搜匹配度 ${matchScoreLabel}`);
  if (binding?.imageSource === "SHOPIFY") {
    rankingReasons.push("按 Shopify 主图图搜命中");
  } else if (binding?.imageSource === "ORIGINAL") {
    rankingReasons.push("按货源原图图搜命中");
  }
  if (purchaseCost != null) {
    rankingReasons.push(
      `采购成本约 ${formatPurchaseCostMoney(purchaseCost, purchaseCtx.currency)}（仅成本展示，不含倍率加价）`
    );
  }
  if (profit != null && profit.amount >= 0) {
    rankingReasons.push(
      `在现有 Shopify 售价下每单获利约 ${profit.amount.toFixed(2)} ${profit.currency}`
    );
  }

  return {
    productId: product.thirdPlatformItemId,
    title: (product.title ?? "").trim() || product.thirdPlatformItemId,
    shopCurrency,
    shopPrice,
    purchaseCurrency: purchaseCtx.currency,
    purchaseCost,
    purchaseCostLabel:
      purchaseCost != null
        ? formatPurchaseCostMoney(purchaseCost, purchaseCtx.currency)
        : binding?.offerPrice
          ? `¥${binding.offerPrice}`
          : null,
    profitPerOrder: profit?.amount ?? null,
    profitCurrency: profit?.currency ?? null,
    profitLabel:
      profit != null
        ? `${profit.amount.toFixed(2)} ${profit.currency}`
        : null,
    bindState,
    matchScore: ms,
    matchScoreLabel,
    imageSource: binding?.imageSource ?? null,
    querySource: binding?.querySource ?? null,
    boundOfferPriceCny: binding?.offerPrice ?? null,
    riskFlags,
    rankingReasons,
  };
}

/** Rule-based compare lines — no LLM math. */
export function buildCandidateCompareLines(
  focus: ProductFocusSnapshot,
  candidates: CandidateSummary[],
  currentCandidateId?: string | null
): string[] {
  if (candidates.length === 0) {
    return ["尚未展开候选列表；可先打开图搜托盘查看多个货源再对比。"];
  }
  const top = pickTopCandidate(candidates) ?? candidates[0]!;
  const current =
    candidates.find((c) => c.productId === currentCandidateId) ?? top;
  const lines: string[] = [];
  lines.push(
    `当前查看：${current.title || current.productId}${
      current.matchScore != null ? `（匹配 ${formatMatchScore(current.matchScore)}）` : ""
    }`
  );
  if (top.productId !== current.productId) {
    lines.push(
      `系统首推：${top.title || top.productId}${
        top.matchScore != null ? `（匹配 ${formatMatchScore(top.matchScore)}）` : ""
      } — 综合匹配度更高`
    );
  } else {
    lines.push("当前候选与系统首推一致，综合匹配度最高。");
  }
  const cheaper = candidates
    .filter((c) => c.priceCny != null && current.priceCny != null)
    .sort((a, b) => (a.priceCny ?? 0) - (b.priceCny ?? 0))[0];
  if (
    cheaper &&
    cheaper.productId !== current.productId &&
    cheaper.priceCny != null &&
    current.priceCny != null &&
    cheaper.priceCny < current.priceCny
  ) {
    lines.push(
      `另有更低成本候选（约 ¥${cheaper.priceCny}），但匹配度或供应信号弱于当前推荐`
    );
  }
  if (focus.bindState === "pending") {
    lines.push("该关联仍为待确认，你可确认、改绑或驳回后重搜");
  }
  return lines;
}
