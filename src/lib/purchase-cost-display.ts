/**
 * Purchase-cost display for「我的 Shopify」tab only.
 *
 * Converts CNY procurement cost → shop display currency using default FX.
 * No multiplier, no addend, no listing strategy — cost display only.
 */

/** CNY per 1 unit of display currency (÷ only). Not used for listing sale price. */
export const DEFAULT_PURCHASE_FX = {
  USD: 6.45,
  EUR: 7.34,
} as const;

export const DEFAULT_PURCHASE_CURRENCY_FALLBACK = "USD";

export interface PurchaseCostDisplayContext {
  currency: string;
  exchangeRate: number;
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

export function resolvePurchaseCostDisplayContext(
  shopCurrency?: string | null
): PurchaseCostDisplayContext {
  const currency = resolvePurchaseDisplayCurrency(shopCurrency);
  return {
    currency,
    exchangeRate: resolvePurchaseDisplayFxRate(currency),
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
