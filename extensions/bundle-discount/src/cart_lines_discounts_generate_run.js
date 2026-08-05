/**
 * Cart-line product discounts (Discount Function API).
 * Track A: tangbuy_bundle.discount_percent on kit parent
 * Track B: tangbuy_combo.config (qty_discount / variant_pair)
 * Mix: tangbuy_mix.rule — pool-wide percent OR fixed_price when qty >= minQty
 * Gift: tangbuy_gift.rule — 100% off gift variant when trigger qty >= minQty
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
 * @param {any} line
 */
function lineSubtotal(line) {
  const raw = line?.cost?.subtotalAmount?.amount;
  const n = Number.parseFloat(String(raw ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Split `total` across `weights` so parts sum exactly (cents-safe to 2dp).
 * @param {number} total
 * @param {number[]} weights
 * @returns {number[]}
 */
function allocateByWeight(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sumW <= 0 || !weights.length) {
    return weights.map(() => 0);
  }
  const raw = weights.map((w) => (total * w) / sumW);
  const rounded = raw.map((x) => Math.floor(x * 100) / 100);
  let allocated = rounded.reduce((a, b) => a + b, 0);
  let remainder = Math.round((total - allocated) * 100);
  // Give leftover cents to largest shares first
  const order = rounded
    .map((v, i) => ({ i, v }))
    .sort((a, b) => b.v - a.v);
  let idx = 0;
  while (remainder > 0 && order.length) {
    rounded[order[idx % order.length].i] =
      Math.round((rounded[order[idx % order.length].i] + 0.01) * 100) / 100;
    remainder -= 1;
    idx += 1;
  }
  return rounded;
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

  /**
   * @typedef {{
   *   minQty: number,
   *   mode: 'percent' | 'fixed_price',
   *   percent: number | null,
   *   amount: number | null,
   *   lineIds: string[],
   *   lineSubs: number[],
   * }} MixBucket
   */
  /** @type {Map<string, MixBucket>} */
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
    if (!pricing || typeof pricing !== "object") continue;

    const minQty = Math.max(2, Number(mix.minQty) || 2);
    const key = String(mix.campaignId);
    let bucket = mixByCampaign.get(key);

    if (pricing.type === "percent") {
      const percent = parsePercent(pricing.percent);
      if (percent == null) continue;
      if (!bucket) {
        bucket = {
          minQty,
          mode: "percent",
          percent,
          amount: null,
          lineIds: [],
          lineSubs: [],
        };
        mixByCampaign.set(key, bucket);
      }
      if (bucket.mode !== "percent") continue;
      if (line.id) {
        bucket.lineIds.push(line.id);
        bucket.lineSubs.push(lineSubtotal(line));
      }
      bucket.minQty = Math.max(bucket.minQty, minQty);
      if (bucket.percent == null) bucket.percent = percent;
    } else if (pricing.type === "fixed_price") {
      const amount = Number.parseFloat(String(pricing.amount ?? ""));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      if (!bucket) {
        bucket = {
          minQty,
          mode: "fixed_price",
          percent: null,
          amount,
          lineIds: [],
          lineSubs: [],
        };
        mixByCampaign.set(key, bucket);
      }
      if (bucket.mode !== "fixed_price") continue;
      if (line.id) {
        bucket.lineIds.push(line.id);
        bucket.lineSubs.push(lineSubtotal(line));
      }
      bucket.minQty = Math.max(bucket.minQty, minQty);
      if (bucket.amount == null) bucket.amount = amount;
    }
  }

  /** @type {Map<string, number>} */
  const mixQty = new Map();
  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const mix = parseJson(line.merchandise.product?.mixRule?.value);
    if (!mix?.campaignId || mix.kind !== "mix_match") continue;
    const key = String(mix.campaignId);
    mixQty.set(key, (mixQty.get(key) ?? 0) + (line.quantity || 0));
  }

  /**
   * @type {Array<{
   *   message: string;
   *   targets: Array<{ cartLine: { id: string; quantity?: number } }>;
   *   value:
   *     | { percentage: { value: number } }
   *     | { fixedAmount: { amount: string; appliesToEachItem: boolean } };
   * }>}
   */
  const candidates = [];
  /** @type {Set<string>} */
  const seenLines = new Set();

  for (const [campaignId, bucket] of mixByCampaign.entries()) {
    const cartQty = mixQty.get(campaignId) ?? 0;
    if (cartQty < bucket.minQty) continue;

    if (bucket.mode === "percent" && bucket.percent != null) {
      for (const lineId of bucket.lineIds) {
        if (!lineId || seenLines.has(lineId)) continue;
        candidates.push({
          message: "Mix & match",
          targets: [{ cartLine: { id: lineId } }],
          value: { percentage: { value: bucket.percent } },
        });
        seenLines.add(lineId);
      }
      continue;
    }

    if (bucket.mode === "fixed_price" && bucket.amount != null) {
      const poolSubtotal = bucket.lineSubs.reduce((a, b) => a + b, 0);
      const target = bucket.amount;
      const discountTotal = poolSubtotal - target;
      if (discountTotal <= 0.009 || poolSubtotal <= 0) continue;

      const shares = allocateByWeight(discountTotal, bucket.lineSubs);
      for (let i = 0; i < bucket.lineIds.length; i++) {
        const lineId = bucket.lineIds[i];
        const share = shares[i] ?? 0;
        if (!lineId || seenLines.has(lineId) || share <= 0) continue;
        candidates.push({
          message: "Mix flat price",
          targets: [{ cartLine: { id: lineId } }],
          value: {
            fixedAmount: {
              amount: share.toFixed(2),
              appliesToEachItem: false,
            },
          },
        });
        seenLines.add(lineId);
      }
    }
  }

  // Gift: 100% off gift variant lines when trigger qty is met
  /** @type {Array<{ giftVariantId: string, giftQty: number, minQty: number, triggerProductId: string }>} */
  const giftOffers = [];
  for (const line of lines) {
    if (line.merchandise?.__typename !== "ProductVariant") continue;
    const gift = parseJson(line.merchandise.product?.giftRule?.value);
    if (!gift || gift.kind !== "qty_gift") continue;
    const giftVariantId = numericId(String(gift.giftVariantId ?? ""));
    const triggerProductId = numericId(
      String(gift.triggerProductId ?? line.merchandise.product?.id ?? "")
    );
    if (!giftVariantId || !triggerProductId) continue;
    const minQty = Math.max(1, Number(gift.minQty) || 1);
    const giftQty = Math.max(1, Number(gift.giftQty) || 1);
    giftOffers.push({ giftVariantId, giftQty, minQty, triggerProductId });
  }

  for (const offer of giftOffers) {
    const triggerQty = qtyByProduct.get(offer.triggerProductId) ?? 0;
    if (triggerQty < offer.minQty) continue;
    let remaining = offer.giftQty;
    for (const line of lines) {
      if (remaining <= 0) break;
      if (line.merchandise?.__typename !== "ProductVariant") continue;
      const lineId = line.id;
      const variantId = numericId(line.merchandise.id);
      if (!lineId || !variantId || seenLines.has(lineId)) continue;
      if (variantId !== offer.giftVariantId) continue;
      const qty = Math.max(0, line.quantity || 0);
      if (qty <= 0) continue;
      const applyQty = Math.min(qty, remaining);
      candidates.push({
        message: "Free gift",
        targets: [{ cartLine: { id: lineId, quantity: applyQty } }],
        value: { percentage: { value: 100 } },
      });
      seenLines.add(lineId);
      remaining -= applyQty;
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
