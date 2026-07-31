// @ts-check
/**
 * Tangbuy Bundle Discount Function (scaffold).
 * Reads product metafield `tangbuy_bundle.discount_percent` and applies a
 * percentage product discount to matching cart lines.
 *
 * Target: purchase.product-discount.run
 */

/**
 * @typedef {{
 *   cart: {
 *     lines: Array<{
 *       id: string;
 *       quantity: number;
 *       merchandise: {
 *         __typename: string;
 *         id?: string;
 *         product?: {
 *           id: string;
 *           metafield?: { value?: string | null } | null;
 *         } | null;
 *       };
 *     }>;
 *   };
 * }} RunInput
 *
 * @typedef {{
 *   discountApplicationStrategy: "FIRST" | "MAXIMUM";
 *   discounts: Array<{
 *     targets: Array<{ productVariant: { id: string } }>;
 *     value: { percentage: { value: string } };
 *     message?: string;
 *   }>;
 * }} FunctionRunResult
 */

/** @type {FunctionRunResult} */
const EMPTY_DISCOUNT = {
  discountApplicationStrategy: "FIRST",
  discounts: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  /** @type {FunctionRunResult["discounts"]} */
  const discounts = [];

  for (const line of input.cart?.lines ?? []) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const variantId = line.merchandise.id;
    if (!variantId) continue;

    const raw = line.merchandise.product?.metafield?.value;
    if (raw == null || String(raw).trim() === "") continue;

    const pct = Number.parseFloat(String(raw));
    if (!Number.isFinite(pct) || pct <= 0) continue;

    discounts.push({
      targets: [{ productVariant: { id: variantId } }],
      value: {
        percentage: {
          value: String(Math.min(100, pct)),
        },
      },
      message: "Bundle discount",
    });
  }

  if (!discounts.length) return EMPTY_DISCOUNT;

  return {
    discountApplicationStrategy: "FIRST",
    discounts,
  };
}
