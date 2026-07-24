import { peekMirrorCache } from "@/lib/products/mirror-cache";
import type { ProductsSummary } from "@/lib/products/page-constants";
import { computeShopProductBindingStats } from "@/lib/shop-product-binding-stats";

export interface ProductsDisplayMetrics {
  displaySummary: ProductsSummary | null;
  pendingCount: number;
  analyzed: number;
  matched: number;
  unbound: number;
}

/** Derive shop-tab headline counts from persisted summary or mirror cache peek. */
export function selectProductsDisplayMetrics(
  summary: ProductsSummary | null,
  shopMirrorKey: string
): ProductsDisplayMetrics {
  const mirrorSnapshot = peekMirrorCache(shopMirrorKey);
  const displaySummary: ProductsSummary | null =
    summary ??
    (mirrorSnapshot
      ? (() => {
          const stats = computeShopProductBindingStats(
            mirrorSnapshot.items,
            mirrorSnapshot.bindings
          );
          return {
            shopProducts: stats.analyzed,
            confirmedProducts: stats.confirmed,
            pendingProducts: stats.pending,
          };
        })()
      : null);

  const pendingCount = displaySummary?.pendingProducts ?? 0;
  const analyzed = displaySummary?.shopProducts ?? 0;
  const matched =
    displaySummary != null
      ? displaySummary.confirmedProducts + displaySummary.pendingProducts
      : 0;
  const unbound = displaySummary != null ? Math.max(analyzed - matched, 0) : 0;

  return { displaySummary, pendingCount, analyzed, matched, unbound };
}
