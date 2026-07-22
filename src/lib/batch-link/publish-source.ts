import type { ImageBindingView } from "@/lib/types";

export const CATALOG_PUBLISH_BIND_SOURCE = "FROM_PUBLISH";

const PUBLISHED_PREFIX = "tangbuy.catalog-published:v1:";

function storageKey(shopName: string): string {
  return `${PUBLISHED_PREFIX}${shopName.trim()}`;
}

/** Client-side marker for catalog publishes before server binding syncs. */
export function readCatalogPublishedIds(shopName: string): Set<string> {
  if (typeof window === "undefined" || !shopName.trim()) return new Set();
  try {
    const raw = localStorage.getItem(storageKey(shopName));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
  } catch {
    return new Set();
  }
}

export function markCatalogPublished(
  shopName: string,
  thirdPlatformItemId: string
): void {
  if (typeof window === "undefined" || !shopName.trim() || !thirdPlatformItemId.trim()) {
    return;
  }
  const ids = readCatalogPublishedIds(shopName);
  ids.add(thirdPlatformItemId.trim());
  try {
    localStorage.setItem(storageKey(shopName), JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}

/** Tangbuy catalog publish = product already has a 1:1 source; skip image-search linking. */
export function isPublishSourcedBinding(
  binding?: ImageBindingView | null
): boolean {
  if (!binding?.bound) return false;
  if (binding.bindSource === CATALOG_PUBLISH_BIND_SOURCE) return true;

  const identity = binding.sourceIdentity;
  if (identity?.catalogItemId?.trim()) return true;
  if (identity?.tangbuyCatalogUrl?.trim()) return true;

  const dataSource = identity?.dataSource?.trim().toLowerCase() ?? "";
  if (
    dataSource === "catalog" ||
    dataSource === "tangbuy_catalog" ||
    dataSource === "tangbuy"
  ) {
    return true;
  }

  return false;
}

export function isCatalogPublishTracked(
  shopName: string | undefined,
  thirdPlatformItemId: string | undefined
): boolean {
  if (!shopName?.trim() || !thirdPlatformItemId?.trim()) return false;
  return readCatalogPublishedIds(shopName).has(thirdPlatformItemId.trim());
}

/**
 * Product already has a known Tangbuy/catalog source — must not enter batch image link.
 */
export function isAlreadySourcedProduct(
  binding: ImageBindingView | undefined | null,
  shopName: string | undefined,
  thirdPlatformItemId: string
): boolean {
  if (isPublishSourcedBinding(binding)) return true;
  if (isCatalogPublishTracked(shopName, thirdPlatformItemId)) return true;
  return false;
}

export function isEligibleForImageBatchLink(input: {
  thirdPlatformItemId: string;
  primaryImageUrl?: string | null;
  binding?: ImageBindingView | null;
  shopName?: string;
}): boolean {
  const { thirdPlatformItemId, primaryImageUrl, binding, shopName } = input;
  if (!primaryImageUrl?.trim()) return false;
  if (binding?.bound) return false;
  if (isAlreadySourcedProduct(binding, shopName, thirdPlatformItemId)) return false;
  return true;
}
