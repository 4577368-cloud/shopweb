import type { ShopMirrorProduct } from "@/lib/types";

/** Fields that can receive AI-edit visual feedback on /products. */
export type AiFieldId = "listingPrice" | "title" | "shipping" | "margin" | "strategy";

export interface AiFieldEditRecord {
  productId: string;
  field: AiFieldId;
  previousDisplay: string;
  nextDisplay: string;
  previousValue?: number | null;
  nextValue?: number | null;
  currency?: string | null;
  createdAt: number;
}

export function aiFieldEditKey(productId: string, field: AiFieldId): string {
  return `${productId}:${field}`;
}

export function formatListingMoney(
  amount: number | null | undefined,
  currency?: string | null
): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim();
  const n = amount.toFixed(2);
  if (!cur) return n;
  if (cur === "USD") return `$${n}`;
  if (cur === "EUR") return `€${n}`;
  if (cur === "GBP") return `£${n}`;
  return `${n} ${cur}`;
}

export const AI_FIELD_HIGHLIGHT_MS = 1_000;
export const AI_CARD_RING_MS = 1_200;
export const AI_BEFORE_AFTER_MS = 3_200;
export const AI_PILL_MS = 5_000;
/** Keep single-price placeholder until mirror catches up or this elapses. */
export const AI_EDIT_DISPLAY_HOLD_MS = 8_000;

export function listingPricesCloseEnough(
  a: number | null | undefined,
  b: number | null | undefined
): boolean {
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) < 0.01;
}

/** True when list mirror min/max already includes the edited listing price. */
export function mirrorReflectsListingPriceEdit(
  item: { minPrice?: number | null; maxPrice?: number | null },
  edit: Pick<AiFieldEditRecord, "nextValue">
): boolean {
  const next = edit.nextValue;
  if (next == null || Number.isNaN(next)) return false;
  const { minPrice, maxPrice } = item;
  if (listingPricesCloseEnough(minPrice, next)) return true;
  if (listingPricesCloseEnough(maxPrice, next)) return true;
  if (
    minPrice != null &&
    maxPrice != null &&
    listingPricesCloseEnough(minPrice, maxPrice) &&
    listingPricesCloseEnough(minPrice, next)
  ) {
    return true;
  }
  return false;
}

/** Optimistically adjust list-row extrema after a default-variant price write. */
export function patchMirrorProductListingPrice(
  product: { minPrice?: number | null; maxPrice?: number | null },
  nextPrice: number,
  previousPrice: number | null
): { minPrice?: number | null; maxPrice?: number | null } {
  let minPrice = product.minPrice;
  let maxPrice = product.maxPrice;

  const touchedMin =
    previousPrice != null &&
    minPrice != null &&
    listingPricesCloseEnough(minPrice, previousPrice);
  const touchedMax =
    previousPrice != null &&
    maxPrice != null &&
    listingPricesCloseEnough(maxPrice, previousPrice);

  if (touchedMin) minPrice = nextPrice;
  if (touchedMax) maxPrice = nextPrice;

  if (!touchedMin && !touchedMax) {
    if (
      minPrice != null &&
      maxPrice != null &&
      listingPricesCloseEnough(minPrice, maxPrice)
    ) {
      minPrice = maxPrice = nextPrice;
    } else if (minPrice == null && maxPrice == null) {
      minPrice = maxPrice = nextPrice;
    } else {
      minPrice = nextPrice;
      maxPrice = maxPrice ?? nextPrice;
    }
  }

  return { minPrice, maxPrice };
}

export function formatPriceRange(p: {
  minPrice?: number | null;
  maxPrice?: number | null;
  currency?: string | null;
}): string {
  const { minPrice, maxPrice, currency } = p;
  if (minPrice == null && maxPrice == null) return "—";
  const cur = currency ? ` ${currency}` : "";
  if (minPrice != null && maxPrice != null && minPrice !== maxPrice) {
    return `${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}${cur}`;
  }
  const one = (minPrice ?? maxPrice) as number;
  return `${one.toFixed(2)}${cur}`;
}

/**
 * While an AI listing-price edit is pending, show the single new price (not min–max range).
 * After the edit record clears, fall back to mirror range.
 */
export function resolveListingPriceDisplay(
  item: {
    minPrice?: number | null;
    maxPrice?: number | null;
    currency?: string | null;
  },
  edit?: AiFieldEditRecord | null
): string {
  if (edit?.field === "listingPrice" && edit.nextDisplay) {
    return edit.nextDisplay;
  }
  return formatPriceRange(item);
}

/** Re-apply pending AI listing-price patches after a list refresh. */
export function applyListingEditsToProducts(
  products: ShopMirrorProduct[],
  edits: Record<string, AiFieldEditRecord>
): ShopMirrorProduct[] {
  return products.map((p) => {
    const edit = edits[aiFieldEditKey(p.thirdPlatformItemId, "listingPrice")];
    if (!edit?.nextValue) return p;
    if (mirrorReflectsListingPriceEdit(p, edit)) return p;
    return {
      ...p,
      ...patchMirrorProductListingPrice(
        p,
        edit.nextValue,
        edit.previousValue ?? null
      ),
    };
  });
}
