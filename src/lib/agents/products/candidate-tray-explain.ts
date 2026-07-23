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

export type CandidateTrayTranslate = (key: string) => string;

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
  ctx: CandidateTrayExplainContext,
  t: CandidateTrayTranslate
): string | null {
  const top = pickTopCandidate(all);
  if (!top) return null;

  const isTop = candidate.productId === top.productId;
  const isBound = ctx.boundOfferId === candidate.productId;
  const cheapest = pickCheapestCandidate(all);

  if (isBound) {
    return ctx.bindPending
      ? t("candidateTray.boundPending")
      : t("candidateTray.boundCurrent");
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

    if (cheaperExists) return t("candidateTray.topBetterThanCheaper");
    if (profit != null && profit.amount >= 0) return t("candidateTray.topBalanced");
    if ((candidate.soldCount ?? 0) > 0 || candidate.repurchaseRate) {
      return t("candidateTray.topSupplySignal");
    }
    if (candidate.matchScore != null && candidate.matchScore > 0) {
      return t("candidateTray.topHighestScore");
    }
    return null;
  }

  const isCheapest =
    cheapest?.productId === candidate.productId &&
    top.productId !== candidate.productId;

  if (isCheapest) {
    const topScore = top.matchScore ?? 0;
    const candScore = candidate.matchScore ?? 0;
    if (topScore > candScore) return t("candidateTray.cheaperWeakerMatch");
    return t("candidateTray.lowestCost");
  }

  if (
    profit != null &&
    profit.amount < 0 &&
    topProfit != null &&
    topProfit.amount >= 0
  ) {
    return t("candidateTray.lowProfit");
  }

  const topScore = top.matchScore ?? 0;
  const candScore = candidate.matchScore ?? 0;
  if (topScore > candScore + 3) return t("candidateTray.lowerTitleScore");

  if ((candidate.inventory ?? 0) > 0 && (top.inventory ?? 0) <= 0) {
    return t("candidateTray.stableInventory");
  }

  return null;
}

export function buildTrayInlineReasons(
  all: CandidateSummary[],
  ctx: CandidateTrayExplainContext,
  t: CandidateTrayTranslate
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of all) {
    const reason = buildCandidateTrayInlineReason(c, all, ctx, t);
    if (reason) out[c.productId] = reason;
  }
  return out;
}
