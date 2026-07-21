import type { ImageSearchProduct } from "@/lib/types";
import {
  costInPurchaseDisplayCurrency,
  resolvePurchaseCostDisplayContext,
} from "@/lib/purchase-cost-display";

/** Profit per order in shop currency (sale − purchase cost). Uses purchase-display FX only. */
export function profitPerOrderPurchaseDisplay(
  shopPrice: number | null | undefined,
  shopCurrency: string | null | undefined,
  costCny: number | null | undefined
): { amount: number; currency: string } | null {
  if (shopPrice == null || shopPrice <= 0) return null;
  const ctx = resolvePurchaseCostDisplayContext(shopCurrency);
  const cost = costInPurchaseDisplayCurrency(costCny, ctx);
  if (cost == null) return null;
  const shopCur = (shopCurrency ?? "").trim().toUpperCase();
  if (shopCur && shopCur !== ctx.currency) return null;
  return { amount: shopPrice - cost, currency: ctx.currency };
}

export function formatTargetMoney(
  amount: number,
  currency: string | null | undefined,
  decimals = 2
): string {
  const cur = (currency ?? "").trim();
  const v = amount.toFixed(decimals);
  return cur ? `${v} ${cur}` : v;
}

function parseRepurchase(raw?: string | null): number {
  if (!raw) return 0;
  const n = Number.parseFloat(String(raw).replace("%", "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Effective 0–100 match score: LLM map → API similarity → 0. */
export function candidateMatchScore(
  c: ImageSearchProduct,
  matchScores?: Record<string, number>
): number {
  const llm = matchScores?.[c.productId];
  if (llm != null && Number.isFinite(llm) && llm > 0) {
    return Math.max(1, Math.min(100, Math.round(llm)));
  }
  return normalizeMatchScore(c.similarityScore) ?? 0;
}

/**
 * Compare candidates: match score first (highest wins), then monthly sold, then repurchase.
 * Returns positive if `a` is better than `b`.
 */
export function compareCandidates(
  a: ImageSearchProduct,
  b: ImageSearchProduct,
  matchScores?: Record<string, number>
): number {
  const scoreDiff = candidateMatchScore(a, matchScores) - candidateMatchScore(b, matchScores);
  if (scoreDiff !== 0) return scoreDiff;
  const soldDiff = (a.soldCount ?? 0) - (b.soldCount ?? 0);
  if (soldDiff !== 0) return soldDiff;
  return parseRepurchase(a.repurchaseRate) - parseRepurchase(b.repurchaseRate);
}

/** Best index under match-score → sold → repurchase. */
export function pickBestCandidateIndex(
  items: ImageSearchProduct[],
  opts?: { matchScores?: Record<string, number> }
): number {
  if (items.length === 0) return 0;
  let bestIdx = 0;
  for (let i = 1; i < items.length; i++) {
    if (compareCandidates(items[i]!, items[bestIdx]!, opts?.matchScores) > 0) {
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** Return a new list with the best candidate first (stable among equals). */
export function rankCandidates(
  items: ImageSearchProduct[],
  opts?: { matchScores?: Record<string, number> }
): ImageSearchProduct[] {
  if (items.length <= 1) return items.slice();
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const cmp = compareCandidates(b.item, a.item, opts?.matchScores);
      return cmp !== 0 ? cmp : a.index - b.index;
    })
    .map((x) => x.item);
}

/** Normalize API similarity (0–1 or absolute) to 0–100; null/0 → null. */
export function normalizeMatchScore(score?: number | null): number | null {
  if (score == null || Number.isNaN(score) || score <= 0) return null;
  if (score <= 1) return Math.round(score * 100);
  return Math.round(Math.min(score, 100));
}

function parseGatewayPrice(raw?: string | null): number | null {
  const nums = (raw ?? "")
    .split(/[^\d.]+/)
    .map((s) => Number.parseFloat(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? Math.min(...nums) : null;
}

export { parseGatewayPrice };
