import type { PricingTemplate } from "@/lib/types";

type RoundingStrategy = "HALF_UP" | "CEIL" | "FLOOR" | "CHARM_99";

/** Mirrors backend PriceCalculator pipeline (CNY cost ÷ rate × multiplier + addend → rounded sale). */
export function calculateSalePrice(
  cost: number | null | undefined,
  template: Pick<
    PricingTemplate,
    "exchangeRate" | "multiplier" | "addend" | "roundingStrategy" | "decimals"
  >
): number | null {
  if (cost == null || !Number.isFinite(cost)) return null;
  const rate = template.exchangeRate ?? 0;
  if (rate <= 0) return null;
  const multiplier = template.multiplier ?? 1;
  const addend = template.addend ?? 0;
  const decimals = template.decimals ?? 2;

  const converted = cost / rate;
  const marked = converted * multiplier + addend;
  return applyRounding(marked, template.roundingStrategy as RoundingStrategy, decimals);
}

function applyRounding(
  marked: number,
  strategy: RoundingStrategy,
  decimals: number
): number {
  switch (strategy) {
    case "CEIL":
      return ceilToDecimals(marked, decimals);
    case "FLOOR":
      return floorToDecimals(marked, decimals);
    case "CHARM_99":
      return charm99(marked);
    case "HALF_UP":
    default:
      return roundHalfUp(marked, decimals);
  }
}

function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ceilToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.ceil(value * factor - Number.EPSILON) / factor;
}

function floorToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor + Number.EPSILON) / factor;
}

/** Ceil to integer, then N - 0.01; clamped to 0.00. */
function charm99(marked: number): number {
  const ceilInt = Math.ceil(marked - Number.EPSILON);
  const result = Math.max(0, ceilInt - 0.01);
  return roundHalfUp(result, 2);
}
