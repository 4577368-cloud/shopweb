import type { PricingTemplate } from "@/lib/types";
import {
  DEFAULT_1688_DISPLAY_MULTIPLIER,
  TANGBUY_DISPLAY_MULTIPLIER,
  type SourcingSearchHit,
  type SourcingSource,
} from "@/lib/sourcing/types";

export function displayMultiplierForSource(
  source: SourcingSource,
  override?: number | null
): number {
  if (override != null && Number.isFinite(override) && override > 0) {
    return override;
  }
  return source === "1688"
    ? DEFAULT_1688_DISPLAY_MULTIPLIER
    : TANGBUY_DISPLAY_MULTIPLIER;
}

/** Procurement cost in listing target currency (FX only). */
export function sourcingProcurementDisplay(
  costCny: number | null | undefined,
  template: PricingTemplate | null | undefined
): number | null {
  if (costCny == null || !Number.isFinite(costCny) || costCny <= 0) return null;
  const rate = template?.exchangeRate;
  if (!Number.isFinite(rate) || !rate || rate <= 0) return null;
  return Math.round((costCny / rate + Number.EPSILON) * 100) / 100;
}

/**
 * Discover suggested price — source-specific markup on procurement (1× / 1.2×).
 * Separate from shop pricing template multiplier/addend.
 */
export function sourcingDisplayPrice(
  costCny: number | null | undefined,
  template: PricingTemplate | null | undefined,
  multiplier: number
): number | null {
  const base = sourcingProcurementDisplay(costCny, template);
  if (base == null) return null;
  return Math.round((base * multiplier + Number.EPSILON) * 100) / 100;
}

export function pricingLinesForHit(
  hit: SourcingSearchHit,
  template: PricingTemplate | null | undefined
): {
  procurementDisplay: number | null;
  displayPrice: number | null;
  targetCurrency: string;
} {
  const targetCurrency = (template?.targetCurrency ?? "USD").toUpperCase();
  return {
    procurementDisplay: sourcingProcurementDisplay(hit.costCny, template),
    displayPrice: sourcingDisplayPrice(
      hit.costCny,
      template,
      hit.displayMultiplier
    ),
    targetCurrency,
  };
}
