import { partitionNewArrivalReadiness } from "@/lib/new-arrival-analysis-preflight";
import type { ShopMirrorProduct } from "@/lib/types";
import { api } from "@/lib/api";

export type BatchLinkPreflight = {
  readyProducts: ShopMirrorProduct[];
  deferredProducts: ShopMirrorProduct[];
  readyIds: string[];
  deferredIds: string[];
};

/** Gate batch link: new-arrival rows also require variant detail when flagged. */
export function preflightBatchLinkScope(
  products: ShopMirrorProduct[],
  pendingNewAnalysisIds: Set<string>,
  variantReadyIds?: Set<string>
): BatchLinkPreflight {
  const newArrivals = products.filter((p) =>
    pendingNewAnalysisIds.has(p.thirdPlatformItemId)
  );
  const rest = products.filter(
    (p) => !pendingNewAnalysisIds.has(p.thirdPlatformItemId)
  );

  const byId = Object.fromEntries(
    products.map((p) => [p.thirdPlatformItemId, p])
  );

  const partNew = partitionNewArrivalReadiness(
    newArrivals.map((p) => p.thirdPlatformItemId),
    byId,
    variantReadyIds
  );
  const partRest = partitionNewArrivalReadiness(
    rest.map((p) => p.thirdPlatformItemId),
    byId
  );

  const readyIds = [...partNew.readyIds, ...partRest.readyIds];
  const deferredIds = [...partNew.deferredIds, ...partRest.deferredIds];
  const readySet = new Set(readyIds);
  const deferredSet = new Set(deferredIds);

  return {
    readyIds,
    deferredIds,
    readyProducts: products.filter((p) => readySet.has(p.thirdPlatformItemId)),
    deferredProducts: products.filter((p) => deferredSet.has(p.thirdPlatformItemId)),
  };
}

/** Variant detail must exist before auto-confirm can succeed on new arrivals. */
export async function loadVariantReadyIds(
  shopName: string,
  itemIds: string[]
): Promise<Set<string>> {
  const ready = new Set<string>();
  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        const detail = await api.getShopProductDetail(shopName, itemId);
        if (detail.variants?.length) ready.add(itemId);
      } catch {
        // deferred until detail is available
      }
    })
  );
  return ready;
}
