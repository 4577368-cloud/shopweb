export interface ProductCatalogEntry {
  productId: string;
  title: string;
  bindState?: string;
  shopStatus?: string | null;
}

export type ProductTargetResolution =
  | { status: "resolved"; productId: string; title: string }
  | { status: "ambiguous"; matches: ProductCatalogEntry[] }
  | { status: "missing" };

/** User means the currently focused product — not a title search. */
const CURRENT_PRODUCT_REF =
  /(?:这个|当前|该|此)\s*商品|这个\s*品|当前\s*品/i;

const PRICE_FIELD_WORDS =
  /^(价格|售价|卖价|标价|定价|listing\s*price|price)$/i;

function isPriceFieldWord(hint: string): boolean {
  return PRICE_FIELD_WORDS.test(hint.trim());
}

export function refersToCurrentProduct(text: string): boolean {
  return CURRENT_PRODUCT_REF.test(text);
}

/** Extract a product title hint from NL, e.g. 「把拖鞋的售价改成 9.9」 */
export function extractProductTitleHint(text: string): string | null {
  // 「这个商品价格改为 22.9」— 商品是泛指，不是标题
  if (refersToCurrentProduct(text) && /(?:价格|售价|卖价|改|设为)/.test(text)) {
    return null;
  }

  const patterns = [
    /把[「"'](.+?)[」"']的(?:商品)?(?:售价|价格|卖价)/,
    /把(.+?)的(?:商品)?(?:售价|价格|卖价)/,
    /给[「"'](.+?)[」"'](?:这个)?商品/,
    /给(.+?)(?:这个)?商品(?:再|重)/,
    /看[「"'](.+?)[」"'](?:这个)?商品/,
    /聚焦[「"'](.+?)[」"']/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    const hint = m?.[1]?.trim();
    if (!hint || hint.length < 2) continue;
    if (/^(这个|当前|该|此)$/.test(hint)) continue;
    if (isPriceFieldWord(hint)) continue;
    return hint;
  }
  return null;
}

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Resolve a product from catalog by title hint — rules only, no LLM invention.
 */
export function resolveProductByTitleHint(
  hint: string,
  catalog: ProductCatalogEntry[]
): ProductTargetResolution {
  if (isPriceFieldWord(hint)) return { status: "missing" };

  const q = normalizeTitle(hint);
  if (!q || catalog.length === 0) return { status: "missing" };

  const exact = catalog.filter((c) => normalizeTitle(c.title) === q);
  if (exact.length === 1) {
    return { status: "resolved", productId: exact[0]!.productId, title: exact[0]!.title };
  }

  const contains = catalog.filter((c) => normalizeTitle(c.title).includes(q));
  if (contains.length === 1) {
    return {
      status: "resolved",
      productId: contains[0]!.productId,
      title: contains[0]!.title,
    };
  }
  if (contains.length > 1) {
    return { status: "ambiguous", matches: contains.slice(0, 5) };
  }

  const reverse = catalog.filter((c) => q.includes(normalizeTitle(c.title)));
  if (reverse.length === 1) {
    return {
      status: "resolved",
      productId: reverse[0]!.productId,
      title: reverse[0]!.title,
    };
  }
  if (reverse.length > 1) {
    return { status: "ambiguous", matches: reverse.slice(0, 5) };
  }

  return { status: "missing" };
}
