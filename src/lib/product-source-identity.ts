import type { ImageBindingView, ProductSourceIdentity } from "@/lib/types";

export type { ProductSourceIdentity };

const STORAGE_PREFIX = "product-source-identity:v1:";

export function identityStorageKey(shopName: string, thirdPlatformItemId: string): string {
  return `${STORAGE_PREFIX}${shopName.trim()}:${thirdPlatformItemId.trim()}`;
}

export function readProductSourceIdentity(
  shopName: string,
  thirdPlatformItemId: string
): ProductSourceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(
      identityStorageKey(shopName, thirdPlatformItemId)
    );
    if (!raw) return null;
    return JSON.parse(raw) as ProductSourceIdentity;
  } catch {
    return null;
  }
}

export function writeProductSourceIdentity(
  shopName: string,
  thirdPlatformItemId: string,
  identity: ProductSourceIdentity
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      identityStorageKey(shopName, thirdPlatformItemId),
      JSON.stringify({
        ...identity,
        resolvedAt: identity.resolvedAt ?? new Date().toISOString(),
      })
    );
    window.dispatchEvent(
      new CustomEvent("product-source-identity-updated", {
        detail: {
          shopName: shopName.trim(),
          thirdPlatformItemId: thirdPlatformItemId.trim(),
        },
      })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function mergeIdentityIntoBinding(
  binding: ImageBindingView,
  identity: ProductSourceIdentity | null | undefined
): ImageBindingView {
  if (!identity) return binding;
  return {
    ...binding,
    sourceIdentity: { ...binding.sourceIdentity, ...identity },
  };
}

export function mergeStoredIdentityIntoBinding(
  shopName: string,
  thirdPlatformItemId: string,
  binding: ImageBindingView
): ImageBindingView {
  const stored = readProductSourceIdentity(shopName, thirdPlatformItemId);
  return mergeIdentityIntoBinding(binding, stored);
}

/** Prefer stored identity, then inline binding fields. */
export function resolveEstimateGoodsIdFromIdentity(
  identity: ProductSourceIdentity | null | undefined,
  tangbuyProductId?: string | null
): string | null {
  const fromIdentity = identity?.internalGoodsId?.trim();
  if (fromIdentity) return fromIdentity;
  const raw = tangbuyProductId?.trim() ?? "";
  if (raw && /^\d{14,}$/.test(raw)) return raw;
  return null;
}
