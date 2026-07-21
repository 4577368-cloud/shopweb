import { profitPerOrderPurchaseDisplay } from "@/lib/agents/products/match-rank";
import type { CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";
import { pickTopCandidate } from "@/lib/agents/products/product-focus-snapshot";

export interface CandidateTrayExplainContext {
  shopPrice: number | null;
  shopCurrency: string | null;
  recommendedProductId: string | null;
  currentCandidateId: string | null;
  boundOfferId: string | null;
  bindPending: boolean;
}

function pickCheapestCandidate(
  candidates: CandidateSummary[]
): CandidateSummary | null {
  const priced = candidates.filter((c) => c.priceCny != null && c.priceCny > 0);
  if (priced.length === 0) return null;
  return [...priced].sort((a, b) => (a.priceCny ?? 0) - (b.priceCny ?? 0))[0]!;
}

/**
 * One-line tray explain — qualitative only; no duplicate of match % or price on card.
 * Returns null when there is no grounded reason.
 */
export function buildCandidateTrayInlineReason(
  candidate: CandidateSummary,
  all: CandidateSummary[],
  ctx: CandidateTrayExplainContext
): string | null {
  const top = pickTopCandidate(all);
  if (!top) return null;

  const isTop = candidate.productId === top.productId;
  const isBound = ctx.boundOfferId === candidate.productId;
  const cheapest = pickCheapestCandidate(all);

  if (isBound) {
    return ctx.bindPending ? "待你确认的关联" : "当前已关联货源";
  }

  const profit = profitPerOrderPurchaseDisplay(
    ctx.shopPrice,
    ctx.shopCurrency,
    candidate.priceCny
  );
  const topProfit = profitPerOrderPurchaseDisplay(
    ctx.shopPrice,
    ctx.shopCurrency,
    top.priceCny
  );

  if (isTop) {
    const cheaperExists =
      cheapest &&
      cheapest.productId !== candidate.productId &&
      cheapest.priceCny != null &&
      candidate.priceCny != null &&
      cheapest.priceCny < candidate.priceCny;

    if (cheaperExists) return "综合匹配优于更低成本选项";
    if (profit != null && profit.amount >= 0) return "匹配与利润空间较均衡";
    if ((candidate.soldCount ?? 0) > 0 || candidate.repurchaseRate) {
      return "供应与销售信号较强";
    }
    if (candidate.matchScore != null && candidate.matchScore > 0) {
      return "图搜综合评分最高";
    }
    return null;
  }

  const isCheapest =
    cheapest?.productId === candidate.productId &&
    top.productId !== candidate.productId;

  if (isCheapest) {
    const topScore = top.matchScore ?? 0;
    const candScore = candidate.matchScore ?? 0;
    if (topScore > candScore) return "成本更低，但匹配弱于首推";
    return "采购成本最低";
  }

  if (
    profit != null &&
    profit.amount < 0 &&
    topProfit != null &&
    topProfit.amount >= 0
  ) {
    return "按当前售价利润空间偏低";
  }

  const topScore = top.matchScore ?? 0;
  const candScore = candidate.matchScore ?? 0;
  if (topScore > candScore + 3) return "匹配度低于首推";

  if ((candidate.inventory ?? 0) > 0 && (top.inventory ?? 0) <= 0) {
    return "库存较稳，可作备选";
  }

  return null;
}

export function buildTrayInlineReasons(
  all: CandidateSummary[],
  ctx: CandidateTrayExplainContext
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of all) {
    const reason = buildCandidateTrayInlineReason(c, all, ctx);
    if (reason) out[c.productId] = reason;
  }
  return out;
}
