import type { ShopInfo } from "@/lib/types";

/**
 * Backend indexes shops by OAuth short name (e.g. `easybrandkit`), case-sensitive.
 * Accept display names (`Easybrandkit`) and full domains (`*.myshopify.com`).
 */
export function normalizeShopApiName(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.myshopify\.com\/?$/i, "");
}

/** Short shop key from a myshopify domain — use for `shop.name` when hydrating from domain only. */
export function shopApiNameFromDomain(domain: string): string {
  const normalized = normalizeShopApiName(domain);
  if (normalized.includes(".")) {
    return normalized.split(".")[0] ?? normalized;
  }
  return normalized;
}

/** API shopName param — matches logistics/products pages (short name preferred). */
export function resolveShopApiName(shop: Pick<ShopInfo, "name" | "domain">): string {
  const raw = shop.name?.trim() || shop.domain?.trim() || "";
  return normalizeShopApiName(raw);
}
