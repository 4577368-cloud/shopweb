/** Relative listing-price adjust (e.g. 价格加1 → each variant +1). */

export type ListingPriceAdjust = {
  /** Signed delta in listing currency (e.g. +1 or -1). */
  delta: number;
  currency?: string;
};

function normalizeCurrency(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  if (s === "$" || s === "usd" || s === "美元" || s === "美金") return "USD";
  if (s === "eur" || s === "欧元") return "EUR";
  if (s === "gbp" || s === "英镑") return "GBP";
  if (s === "cny" || s === "元") return "CNY";
  return raw.trim().toUpperCase();
}

const CURRENCY =
  "(美元|美金|USD|usd|\\$|EUR|eur|欧元|GBP|gbp|英镑|CNY|cny|元)?";

/** Absolute set phrases — do not treat as relative adjust. */
export function looksLikeAbsoluteListingPriceSet(text: string): boolean {
  return /(?:改价|调价|定价)\s*(?:成|为|到)\s*\d|(?:价格|售价|卖价|上架价)\s*(?:改(?:成|为)|设为|设置为|调到)\s*\d|(?:改成|改为|设为|设置为|调整到)\s*\d|set\s+(?:(?:the|this)\s+)?(?:price|listing)\s+to\s*\d|price\s*(?:to|=)\s*\d/i.test(
    text
  );
}

/**
 * Parse「价格加1」「售价减 2」「加价1美元」「increase by 1」.
 * Prefer calling this before absolute set parsers.
 */
export function parseListingPriceAdjust(
  text: string
): ListingPriceAdjust | null {
  if (looksLikeAbsoluteListingPriceSet(text)) return null;

  const addPatterns = [
    // 「把商品价格加1」「售价增加 1.5 美元」「本页价格都加1」
    new RegExp(
      `(?:价格|售价|卖价|上架价|商品(?:的)?(?:价格|售价)?).{0,16}?(?:加|增加|上调|提高|涨)\\s*(\\d+(?:\\.\\d+)?)\\s*${CURRENCY}`,
      "i"
    ),
    // 「加价1」「涨价 2」
    new RegExp(`(?:加价|涨价)\\s*(\\d+(?:\\.\\d+)?)\\s*${CURRENCY}`, "i"),
    // 「increase/add/raise by 1」
    /(?:price|listing(?:\s*price)?)\s*(?:increase|raise|add|plus)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*(USD|usd|\$|EUR|eur|GBP|gbp)?/i,
    /(?:increase|raise|add)\s+(?:(?:the|this)\s+)?(?:price|listing)\s*(?:by\s*)?(\d+(?:\.\d+)?)/i,
    /\+\s*(\d+(?:\.\d+)?)\s*(美元|美金|USD|usd|\$)?/,
  ];

  const subPatterns = [
    new RegExp(
      `(?:价格|售价|卖价|上架价|商品(?:的)?(?:价格|售价)?).{0,16}?(?:减|减少|下调|降低|降)\\s*(\\d+(?:\\.\\d+)?)\\s*${CURRENCY}`,
      "i"
    ),
    new RegExp(`(?:减价|降价)\\s*(\\d+(?:\\.\\d+)?)\\s*${CURRENCY}`, "i"),
    /(?:price|listing(?:\s*price)?)\s*(?:decrease|lower|reduce|minus|subtract)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*(USD|usd|\$|EUR|eur|GBP|gbp)?/i,
    /(?:decrease|lower|reduce)\s+(?:(?:the|this)\s+)?(?:price|listing)\s*(?:by\s*)?(\d+(?:\.\d+)?)/i,
    /-\s*(\d+(?:\.\d+)?)\s*(美元|美金|USD|usd|\$)?/,
  ];

  for (const p of addPatterns) {
    const m = text.match(p);
    if (!m) continue;
    const amount = Number(m[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { delta: amount, currency: normalizeCurrency(m[2]) };
  }

  for (const p of subPatterns) {
    const m = text.match(p);
    if (!m) continue;
    const amount = Number(m[1]);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    return { delta: -amount, currency: normalizeCurrency(m[2]) };
  }

  return null;
}

export function applyPriceDelta(price: number, delta: number): number {
  const next = Math.round((price + delta) * 100) / 100;
  return next;
}

export function formatPriceRange(
  min: number | null | undefined,
  max: number | null | undefined
): string | null {
  if (min == null || !Number.isFinite(min)) return null;
  if (max == null || !Number.isFinite(max) || Math.abs(max - min) < 0.005) {
    return min.toFixed(2);
  }
  return `${min.toFixed(2)}–${max.toFixed(2)}`;
}
