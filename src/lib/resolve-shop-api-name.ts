import type { ShopInfo } from "@/lib/types";

/** API shopName param — matches logistics/products pages (short name preferred). */
export function resolveShopApiName(shop: Pick<ShopInfo, "name" | "domain">): string {
  return shop.name?.trim() || shop.domain?.trim() || "";
}
