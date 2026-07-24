import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
import type { ShopInfo } from "@/lib/types";

/** Stable per-shop key for scan gates + workflow caches (prefer myshopify domain). */
export function workflowScanShopKey(
  shop: Pick<ShopInfo, "name" | "domain">
): string {
  return productsMirrorShopKey(shop.name, shop.domain);
}
