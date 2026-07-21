import { api } from "@/lib/api";

export interface ShopScanContext {
  orderCount: number | null;
  unfulfilledOrderCount: number | null;
  loaded: boolean;
}

export const EMPTY_SHOP_SCAN_CONTEXT: ShopScanContext = {
  orderCount: null,
  unfulfilledOrderCount: null,
  loaded: false,
};

function isUnfulfilled(fulfillmentStatus?: string | null): boolean {
  const s = (fulfillmentStatus ?? "").trim().toUpperCase();
  if (!s) return true;
  return (
    s === "UNFULFILLED" ||
    s === "PARTIAL" ||
    s === "PARTIALLY_FULFILLED" ||
    s === "IN_PROGRESS"
  );
}

/** Pull persisted Shopify order headers for scan-page shop context. */
export async function fetchShopScanContext(
  shopName: string
): Promise<ShopScanContext> {
  try {
    const orders = await api.listShopOrders(shopName);
    const unfulfilled = orders.filter((o) => isUnfulfilled(o.fulfillmentStatus)).length;
    return {
      orderCount: orders.length,
      unfulfilledOrderCount: unfulfilled,
      loaded: true,
    };
  } catch {
    return { ...EMPTY_SHOP_SCAN_CONTEXT, loaded: true };
  }
}
