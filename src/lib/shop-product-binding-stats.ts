import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

/** Per-product binding stats scoped to the current shop product mirror list. */
export type ShopProductBindingStats = {
  /** Products in the current mirror (= 已分析). */
  analyzed: number;
  /** Products with any live binding (= 自动匹配). */
  matched: number;
  pending: number;
  confirmed: number;
  unbound: number;
};

/**
 * Count bindings by iterating the current product list — never orphan bindings
 * for deleted/missing mirror rows (avoids matched > analyzed).
 */
export function computeShopProductBindingStats(
  products: ShopMirrorProduct[],
  bindingsByItemId: Record<string, ImageBindingView>
): ShopProductBindingStats {
  let pending = 0;
  let confirmed = 0;
  for (const p of products) {
    const b = bindingsByItemId[p.thirdPlatformItemId];
    if (!b?.bound) continue;
    if (b.bindStatus === "PENDING") pending += 1;
    else confirmed += 1;
  }
  const analyzed = products.length;
  const matched = pending + confirmed;
  return {
    analyzed,
    matched,
    pending,
    confirmed,
    unbound: Math.max(analyzed - matched, 0),
  };
}

/** AI auto-link awaiting human ack — not legacy ACTIVE / empty bindStatus. */
export function isPendingImageBinding(
  binding?: ImageBindingView | null
): boolean {
  return Boolean(binding?.bound && binding.bindStatus === "PENDING");
}

/** Build item-id → binding map from API list (last row wins per product). */
export function indexImageBindings(
  bindings: ImageBindingView[]
): Record<string, ImageBindingView> {
  const map: Record<string, ImageBindingView> = {};
  for (const b of bindings) {
    if (b.thirdPlatformItemId) map[b.thirdPlatformItemId] = b;
  }
  return map;
}
