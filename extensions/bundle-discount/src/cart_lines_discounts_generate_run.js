/**
 * Cart-line product discounts (Discount Function API).
 * Track A: tangbuy_bundle.discount_percent on kit parent
 * Track B: tangbuy_combo.config (qty_discount / variant_pair)
 * Mix: tangbuy_mix.rule — pool-wide percent when combined qty >= minQty
 */

const DiscountClass = {
  Product: "PRODUCT",
  Order: "ORDER",
  Shipping: "SHIPPING",
};

const ProductDiscountSelectionStrategy = {
  First: "FIRST",
  Maximum: "MAXIMUM",
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
 */
function parseJson(raw) {
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
 */
function numericId(id) {
  if (!id) return "";
  const parts = String(id).split("/");
  return parts[parts.length - 1] || String(id);
}

/**
 * @param {any} input
 */
export function cartLinesDiscountsGenerateRun(input) {
  const discountClasses = input?.discount?.discountClasses ?? [];
  const hasProduct = discountClasses.includes(DiscountClass.Product);
  if (!hasProduct) {
    return { operations: [] };
  }

  const lines = input?.cart?.lines ?? [];
  if (!lines.length) {
    return { operations: [] };
  }

  /** @type {Map<string, number>} */
  const qtyByProduct = new Map();
  /** @type {Set<string>} */
  const variantIdsInCart = new Set();
  /** @type {Map<string, { minQty: number, percent: number, lineIds: string[] }>} */
  const mixByCampaign = new Map();

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

    const mix = parseJson(line.merchandise.product?.mixRule?.value);
    if (!mix || mix.kind !== "mix_match" || !mix.campaignId) continue;
    const pricing = mix.pricing;
    if (!pricing || pricing.type !== "percent") continue;
    const percent = parsePercent(pricing.percent);
    if (percent == null) continue;
    const minQty = Math.max(2, Number(mix.minQty) || 2);
    const key = String(mix.campaignId);
    let bucket = mixByCampaign.get(key);
    if (!bucket) {
      bucket = { minQty, percent, lineIds: [] };
      mixByCampaign.set(key, bucket);
    }
    if (line.id) bucket.lineIds.push(line.id);
    // Prefer strictest min / first percent seen
    bucket.minQty = Math.max(bucket.minQty, minQty);
  }

  /** Sum qty for mix campaigns: all lines that carry that campaignId */
  /** @type {Map<string, number>} */
  const mixQty = new Map();
  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const mix = parseJson(line.merchandise.product?.mixRule?.value);
    if (!mix?.campaignId || mix.kind !== "mix_match") continue;
    const key = String(mix.campaignId);
    mixQty.set(key, (mixQty.get(key) ?? 0) + (line.quantity || 0));
  }

  /** @type {Array<{ message: string; targets: Array<{ cartLine: { id: string } }>; value: { percentage: { value: number } } }>} */
  const candidates = [];
  /** @type {Set<string>} */
  const seenLines = new Set();

  for (const [campaignId, bucket] of mixByCampaign.entries()) {
    const cartQty = mixQty.get(campaignId) ?? 0;
    if (cartQty < bucket.minQty) continue;
    for (const lineId of bucket.lineIds) {
      if (!lineId || seenLines.has(lineId)) continue;
      candidates.push({
        message: "Mix & match",
        targets: [{ cartLine: { id: lineId } }],
        value: { percentage: { value: bucket.percent } },
      });
      seenLines.add(lineId);
    }
  }

  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const lineId = line.id;
    const variantId = line.merchandise.id;
    if (!lineId || !variantId || seenLines.has(lineId)) continue;

    const product = line.merchandise.product;
    if (!product) continue;

    const bundlePct = parsePercent(product.bundleDiscount?.value);
    if (bundlePct != null) {
      candidates.push({
        message: "Kit discount",
        targets: [{ cartLine: { id: lineId } }],
        value: { percentage: { value: bundlePct } },
      });
      seenLines.add(lineId);
      continue;
    }

    const combo = parseJson(product.comboConfig?.value);
    if (!combo) continue;
    const comboPct = parsePercent(combo.discountPercent);
    if (comboPct == null) continue;

    if (combo.kind === "qty_discount") {
      const minQty = Math.max(2, Number(combo.qty) || 2);
      const productId = numericId(product.id);
      const cartQty = qtyByProduct.get(productId) ?? 0;
      if (cartQty < minQty) continue;

      candidates.push({
        message: "Quantity discount",
        targets: [{ cartLine: { id: lineId } }],
        value: { percentage: { value: comboPct } },
      });
      seenLines.add(lineId);
      continue;
    }

    if (combo.kind === "variant_pair") {
      const needed = (combo.variantIds ?? [])
        .map((id) => numericId(String(id)))
        .filter(Boolean);
      if (needed.length < 2) continue;
      if (!needed.every((id) => variantIdsInCart.has(id))) continue;
      if (!needed.includes(numericId(variantId))) continue;

      candidates.push({
        message: "Combo discount",
        targets: [{ cartLine: { id: lineId } }],
        value: { percentage: { value: comboPct } },
      });
      seenLines.add(lineId);
    }
  }

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
