import { SCAN_STAGE_PROGRESS_ANIMATION_MS } from "@/components/workbench/scan-stage";
import { hasScanned } from "@/lib/scan/gate";
import { peekMirrorCache } from "@/lib/products/mirror-cache";

export type ProductsPageTab = "shop" | "catalog";

export interface ProductsSummary {
  shopProducts: number;
  confirmedProducts: number;
  pendingProducts: number;
}

export const SCAN_COMPLETION_DWELL_MS = 450;
export const SCAN_FINISH_DELAY_MS =
  SCAN_STAGE_PROGRESS_ANIMATION_MS + SCAN_COMPLETION_DWELL_MS;

export function productsEntryShouldSkipCeremony(
  shopMirrorKey: string,
  legacyShopName: string
): boolean {
  if (hasScanned("products", shopMirrorKey)) return true;
  if (legacyShopName && hasScanned("products", legacyShopName)) return true;
  return Boolean(peekMirrorCache(shopMirrorKey)?.items?.length);
}
