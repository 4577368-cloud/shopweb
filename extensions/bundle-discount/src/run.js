// @ts-check
/**
 * Tangbuy Bundle / Combo Discount Function.
 * Track A: product metafield `tangbuy_bundle.discount_percent`
 * Track B: product metafield `tangbuy_combo.config` (qty_discount when cart qty >= threshold)
 *
 * Target: purchase.product-discount.run
 * Does not affect Tangbuy procurement / OrderBindingResolver.
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
 *           bundleDiscount?: { value?: string | null } | null;
 *           comboConfig?: { value?: string | null } | null;
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
 * @param {unknown} raw
 * @returns {number | null}
 */
function parsePercent(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const pct = Number.parseFloat(String(raw));
  if (!Number.isFinite(pct) || pct <= 0) return null;
  return Math.min(100, pct);
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ kind?: string; qty?: number; discountPercent?: number; variantIds?: string[] } | null}
 */
function parseComboConfig(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {string | undefined} id
 * @returns {string}
 */
function numericId(id) {
  if (!id) return "";
  const parts = String(id).split("/");
  return parts[parts.length - 1] || String(id);
}

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  /** @type {FunctionRunResult["discounts"]} */
  const discounts = [];
  /** @type {Set<string>} */
  const seenTargets = new Set();

  const lines = input.cart?.lines ?? [];

  /** Cart quantities by product numeric id (for combo qty thresholds). */
  /** @type {Map<string, number>} */
  const qtyByProduct = new Map();
  /** @type {Set<string>} */
  const variantIdsInCart = new Set();

  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const productId = numericId(line.merchandise.product?.id);
    const variantId = line.merchandise.id;
    if (variantId) variantIdsInCart.add(numericId(variantId));
    if (!productId) continue;
    qtyByProduct.set(
      productId,
      (qtyByProduct.get(productId) ?? 0) + (line.quantity || 0)
    );
  }

  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const variantId = line.merchandise.id;
    if (!variantId) continue;
    if (seenTargets.has(variantId)) continue;

    const product = line.merchandise.product;
    if (!product) continue;

    // Track A — Fixed Kit parent discount %
    const bundlePct = parsePercent(product.bundleDiscount?.value);
    if (bundlePct != null) {
      discounts.push({
        targets: [{ productVariant: { id: variantId } }],
        value: { percentage: { value: String(bundlePct) } },
        message: "Kit discount",
      });
      seenTargets.add(variantId);
      continue;
    }

    // Track B — same-product combo
    const combo = parseComboConfig(product.comboConfig?.value);
    if (!combo) continue;

    const comboPct = parsePercent(combo.discountPercent);
    if (comboPct == null) continue;

    if (combo.kind === "qty_discount") {
      const minQty = Math.max(2, Number(combo.qty) || 2);
      const productId = numericId(product.id);
      const cartQty = qtyByProduct.get(productId) ?? 0;
      if (cartQty < minQty) continue;

      discounts.push({
        targets: [{ productVariant: { id: variantId } }],
        value: { percentage: { value: String(comboPct) } },
        message: "Quantity discount",
      });
      seenTargets.add(variantId);
      continue;
    }

    if (combo.kind === "variant_pair") {
      const needed = (combo.variantIds ?? [])
        .map((id) => numericId(String(id)))
        .filter(Boolean);
      if (needed.length < 2) continue;
      const allPresent = needed.every((id) => variantIdsInCart.has(id));
      if (!allPresent) continue;
      // Apply once to the current line's variant if it is one of the pair.
      if (!needed.includes(numericId(variantId))) continue;

      discounts.push({
        targets: [{ productVariant: { id: variantId } }],
        value: { percentage: { value: String(comboPct) } },
        message: "Combo discount",
      });
      seenTargets.add(variantId);
    }
  }

  if (!discounts.length) return EMPTY_DISCOUNT;

  return {
    discountApplicationStrategy: "FIRST",
    discounts,
  };
}
