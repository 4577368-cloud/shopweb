import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

const BASELINE_PREFIX = "tangbuy.products.baseline.";

export type NewArrivalStats = {
  /** Mirror rows not present at last analysis baseline. */
  newArrivalCount: number;
  /** New arrivals without any binding yet (= 待分析新商品). */
  pendingNewAnalysisCount: number;
  newArrivalIds: Set<string>;
  pendingNewAnalysisIds: Set<string>;
};

export function readProductBaseline(shop: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${BASELINE_PREFIX}${shop}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function writeProductBaseline(shop: string, itemIds: Iterable<string>): void {
  if (typeof window === "undefined") return;
  try {
    const ids = Array.from(new Set(itemIds));
    localStorage.setItem(`${BASELINE_PREFIX}${shop}`, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

/** Merge analyzed item ids into the existing baseline without replacing it. */
export function mergeProductBaseline(shop: string, itemIds: Iterable<string>): void {
  const merged = readProductBaseline(shop);
  for (const id of itemIds) {
    if (id) merged.add(id);
  }
  writeProductBaseline(shop, merged);
}

/**
 * One-time migration: if user already scanned but has no baseline yet, seed from
 * current mirror without surfacing a false "all products are new" banner.
 */
export function seedProductBaselineIfEmpty(
  shop: string,
  products: ShopMirrorProduct[]
): boolean {
  const existing = readProductBaseline(shop);
  if (existing.size > 0) return false;
  writeProductBaseline(
    shop,
    products.map((p) => p.thirdPlatformItemId)
  );
  return true;
}

/** Compare current mirror against the last analysis baseline. */
export function computeNewArrivalStats(
  products: ShopMirrorProduct[],
  bindingsByItemId: Record<string, ImageBindingView>,
  baseline: Set<string>
): NewArrivalStats {
  const newArrivalIds = new Set<string>();
  const pendingNewAnalysisIds = new Set<string>();

  for (const p of products) {
    const id = p.thirdPlatformItemId;
    if (!id || baseline.has(id)) continue;
    newArrivalIds.add(id);
    const binding = bindingsByItemId[id];
    if (!binding?.bound) pendingNewAnalysisIds.add(id);
  }

  return {
    newArrivalCount: newArrivalIds.size,
    pendingNewAnalysisCount: pendingNewAnalysisIds.size,
    newArrivalIds,
    pendingNewAnalysisIds,
  };
}
