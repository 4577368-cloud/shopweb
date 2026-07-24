import type { SkuProductOverview } from "@/lib/types";

const handoff = new Map<string, SkuProductOverview>();

function key(shop: string, productId: string): string {
  return `${shop}::${productId}`;
}

/** 列表页进入工作台前暂存当前商品 overview，避免重复拉整店列表。 */
export function stashSkuProductHandoff(
  shop: string,
  product: SkuProductOverview
): void {
  handoff.set(key(shop, product.thirdPlatformItemId), product);
}

/** Read handoff without consuming — safe for instant first paint. */
export function peekSkuProductHandoff(
  shop: string,
  productId: string
): SkuProductOverview | null {
  return handoff.get(key(shop, productId)) ?? null;
}

/** 工作台首屏读取并消费 handoff（一次性）。 */
export function takeSkuProductHandoff(
  shop: string,
  productId: string
): SkuProductOverview | null {
  const k = key(shop, productId);
  const found = handoff.get(k) ?? null;
  if (found) handoff.delete(k);
  return found;
}
