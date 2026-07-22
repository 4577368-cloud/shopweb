import { api } from "@/lib/api";
import type { ShopProductDetail } from "@/lib/types";

export type ShopifyListingStatusTarget = "DRAFT" | "ARCHIVED";

export const LISTING_STATUS_LABELS: Record<ShopifyListingStatusTarget, string> = {
  DRAFT: "草稿（前台不可见）",
  ARCHIVED: "归档下架",
};

export const LISTING_STATUS_SHORT: Record<ShopifyListingStatusTarget, string> = {
  DRAFT: "DRAFT",
  ARCHIVED: "ARCHIVED",
};

export function normalizeShopStatus(
  status?: string | null
): string {
  return (status ?? "ACTIVE").trim().toUpperCase() || "ACTIVE";
}

export function isActiveShopStatus(status?: string | null): boolean {
  return normalizeShopStatus(status) === "ACTIVE";
}

export function formatStatusTransition(
  from: string | null | undefined,
  to: ShopifyListingStatusTarget
): string {
  const fromLabel = normalizeShopStatus(from);
  return `${fromLabel} → ${LISTING_STATUS_SHORT[to]}（${LISTING_STATUS_LABELS[to]}）`;
}

export async function writeShopProductStatus(
  shopName: string,
  productId: string,
  targetStatus: ShopifyListingStatusTarget
): Promise<ShopProductDetail> {
  return api.updateShopProduct(shopName, {
    itemId: productId,
    status: targetStatus,
  });
}
