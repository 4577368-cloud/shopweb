/**
 * Purchase-cost display for「我的 Shopify」tab only.
 *
 * Converts CNY procurement cost → shop display currency.
 * When a non-default pricing template is configured, uses the same FX as listing
 * pricing (no multiplier, no addend). Otherwise falls back to shop-currency defaults.
 */

import type { PricingTemplate } from "@/lib/types";

/** CNY per 1 unit of display currency (÷ only). Not used for listing sale price. */
export const DEFAULT_PURCHASE_FX = {
  USD: 6.45,
  EUR: 7.34,
} as const;

export const DEFAULT_PURCHASE_CURRENCY_FALLBACK = "USD";

export interface PurchaseCostDisplayContext {
  currency: string;
  exchangeRate: number;
  /** True when FX comes from the saved pricing template (not shop default). */
  fromPricingTemplate: boolean;
}

export function normalizeCurrencyCode(raw?: string | null): string | null {
  const cur = (raw ?? "").trim().toUpperCase();
  return cur || null;
}

/** Resolve display currency from Shopify product / shop currency. */
export function resolvePurchaseDisplayCurrency(shopCurrency?: string | null): string {
  const cur = normalizeCurrencyCode(shopCurrency);
  if (cur === "USD") return "USD";
  if (cur === "EUR") return "EUR";
  return DEFAULT_PURCHASE_CURRENCY_FALLBACK;
}

/** Default FX for purchase-cost display (never applies multiplier/addend). */
export function resolvePurchaseDisplayFxRate(currency: string): number {
  const cur = currency.toUpperCase();
  if (cur === "EUR") return DEFAULT_PURCHASE_FX.EUR;
  return DEFAULT_PURCHASE_FX.USD;
}

export function isEffectivePricingTemplate(
  template: PricingTemplate | null | undefined
): template is PricingTemplate {
  return (
    template != null &&
    !template.isDefault &&
    Number.isFinite(template.exchangeRate) &&
    template.exchangeRate > 0
  );
}

export function resolvePurchaseCostDisplayContext(
  shopCurrency?: string | null,
  pricingTemplate?: PricingTemplate | null
): PurchaseCostDisplayContext {
  if (isEffectivePricingTemplate(pricingTemplate)) {
    const currency =
      normalizeCurrencyCode(pricingTemplate.targetCurrency) ??
      resolvePurchaseDisplayCurrency(shopCurrency);
    return {
      currency,
      exchangeRate: pricingTemplate.exchangeRate,
      fromPricingTemplate: true,
    };
  }
  const currency = resolvePurchaseDisplayCurrency(shopCurrency);
  return {
    currency,
    exchangeRate: resolvePurchaseDisplayFxRate(currency),
    fromPricingTemplate: false,
  };
}

/** CNY cost → purchase-display currency (÷ rate only). */
export function costInPurchaseDisplayCurrency(
  costCny: number | null | undefined,
  ctx: PurchaseCostDisplayContext
): number | null {
  if (costCny == null || !Number.isFinite(costCny) || costCny <= 0) return null;
  const rate = ctx.exchangeRate;
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return costCny / rate;
}

export function formatPurchaseCostMoney(
  amount: number,
  currency: string,
  decimals = 2
): string {
  return `${amount.toFixed(decimals)} ${currency}`;
}

/** Shopify listing price with shop currency code (matches selection page). */
export function formatShopListingPrice(
  price?: number | null,
  shopCurrency?: string | null
): string {
  if (price == null || Number.isNaN(price)) return "—";
  const cur = normalizeCurrencyCode(shopCurrency);
  return cur ? `${price.toFixed(2)} ${cur}` : price.toFixed(2);
}

/** CNY procurement cost → shop display currency string (no「采购价」prefix). */
export function formatSourceCostInShopCurrency(
  costCny: number | null | undefined,
  shopCurrency?: string | null,
  pricingTemplate?: PricingTemplate | null
): string | null {
  const ctx = resolvePurchaseCostDisplayContext(shopCurrency, pricingTemplate);
  const inTarget = costInPurchaseDisplayCurrency(costCny, ctx);
  if (inTarget == null) return null;
  return formatPurchaseCostMoney(inTarget, ctx.currency);
}
