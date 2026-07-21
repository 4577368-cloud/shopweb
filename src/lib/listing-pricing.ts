import { calculateSalePrice } from "@/lib/price-calculator";
import type { PricingTemplate } from "@/lib/types";

/**
 * Listing / suggested sale price for「发现新品」tab.
 * Uses the full pricing strategy (FX + multiplier + addend + rounding).
 */

export interface ListingPricingContext {
  template: PricingTemplate;
  targetCurrency: string;
  /** false = backend system default, not yet saved by merchant */
  isConfigured: boolean;
}

export function resolveListingPricingContext(
  template: PricingTemplate | null | undefined
): ListingPricingContext | null {
  if (!template) return null;
  return {
    template,
    targetCurrency: (template.targetCurrency ?? "USD").toUpperCase(),
    isConfigured: !template.isDefault,
  };
}

/** Suggested Shopify listing price from CNY procurement cost. */
export function listingSalePrice(
  costCny: number | null | undefined,
  ctx: ListingPricingContext
): number | null {
  return calculateSalePrice(costCny, ctx.template);
}

/**
 * Procurement cost in listing target currency — FX from strategy only, no multiplier/addend.
 * For auxiliary「采购价」line on discover tab (alongside 预估售价).
 */
export function listingPurchaseCostDisplay(
  costCny: number | null | undefined,
  ctx: ListingPricingContext
): number | null {
  if (costCny == null || !Number.isFinite(costCny) || costCny <= 0) return null;
  const rate = ctx.template.exchangeRate;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return Math.round((costCny / rate + Number.EPSILON) * 100) / 100;
}
