/**
 * Purchase-cost display for「我的 Shopify」tab only.
 *
 * Converts CNY procurement cost → display currency using Tangbuy system FX
 * (via pricing template when present). Merchants never edit or see the rate.
 */

import { currencyForUiLocale } from "@/lib/locale-currency";
import type { PricingTemplate } from "@/lib/types";

/** Offline fallbacks: CNY per 1 display unit (÷ only). */
export const DEFAULT_PURCHASE_FX = {
  CNY: 1,
  USD: 6.761905,
  EUR: 7.34,
  GBP: 8.5,
} as const;

export const DEFAULT_PURCHASE_CURRENCY_FALLBACK = "USD";

export interface PurchaseCostDisplayContext {
  currency: string;
  exchangeRate: number;
  /** True when FX comes from the saved pricing template (system-filled). */
  fromPricingTemplate: boolean;
}

export function normalizeCurrencyCode(raw?: string | null): string | null {
  const cur = (raw ?? "").trim().toUpperCase();
  return cur || null;
}

/** Resolve display currency: UI locale → Shopify shop → USD. */
export function resolvePurchaseDisplayCurrency(
  shopCurrency?: string | null,
  uiLocale?: string | null
): string {
  if (uiLocale) {
    return currencyForUiLocale(uiLocale);
  }
  const cur = normalizeCurrencyCode(shopCurrency);
  if (cur === "USD" || cur === "EUR" || cur === "GBP" || cur === "CNY") {
    return cur;
  }
  return DEFAULT_PURCHASE_CURRENCY_FALLBACK;
}

/** Default FX for purchase-cost display (never applies multiplier/addend). */
export function resolvePurchaseDisplayFxRate(currency: string): number {
  const cur = currency.toUpperCase();
  if (cur in DEFAULT_PURCHASE_FX) {
    return DEFAULT_PURCHASE_FX[cur as keyof typeof DEFAULT_PURCHASE_FX];
  }
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
  pricingTemplate?: PricingTemplate | null,
  uiLocale?: string | null
): PurchaseCostDisplayContext {
  const localeCurrency = uiLocale ? currencyForUiLocale(uiLocale) : null;

  if (isEffectivePricingTemplate(pricingTemplate)) {
    const currency =
      localeCurrency ??
      normalizeCurrencyCode(pricingTemplate.targetCurrency) ??
      resolvePurchaseDisplayCurrency(shopCurrency, uiLocale);
    // Prefer live system rate on the template when currencies align.
    const rate =
      normalizeCurrencyCode(pricingTemplate.targetCurrency) === currency
        ? pricingTemplate.exchangeRate
        : resolvePurchaseDisplayFxRate(currency);
    return {
      currency,
      exchangeRate: rate,
      fromPricingTemplate: true,
    };
  }

  const currency = resolvePurchaseDisplayCurrency(shopCurrency, uiLocale);
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
  pricingTemplate?: PricingTemplate | null,
  uiLocale?: string | null
): string | null {
  const ctx = resolvePurchaseCostDisplayContext(
    shopCurrency,
    pricingTemplate,
    uiLocale
  );
  const inTarget = costInPurchaseDisplayCurrency(costCny, ctx);
  if (inTarget == null) return null;
  return formatPurchaseCostMoney(inTarget, ctx.currency);
}
