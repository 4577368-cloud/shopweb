import { api } from "@/lib/api";
import { mergeStoredIdentityIntoBinding } from "@/lib/product-source-identity";
import {
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import type { ImageBindingView } from "@/lib/types";

/** `null` = request failed — caller must keep previous bindings. */
export async function fetchImageBindingsMap(
  shopName: string
): Promise<Record<string, ImageBindingView> | null> {
  const shop = shopName.trim();
  if (!shop) return {};
  try {
    const list = await api.listImageBindings(shop);
    return indexImageBindings(list);
  } catch {
    return null;
  }
}

/** Products panel: server bindings merged with local source-identity cache. */
export async function fetchShopPanelBindingsMap(
  shopName: string
): Promise<Record<string, ImageBindingView> | null> {
  const shop = shopName.trim();
  if (!shop) return {};
  try {
    const list = await api.listImageBindings(shop);
    const map: Record<string, ImageBindingView> = {};
    for (const b of list) {
      if (!b.thirdPlatformItemId) continue;
      map[b.thirdPlatformItemId] = mergeStoredIdentityIntoBinding(
        shop,
        b.thirdPlatformItemId,
        b
      );
    }
    return map;
  } catch {
    return null;
  }
}

export function mergeBindingsOnFetch(
  fetched: Record<string, ImageBindingView> | null,
  previous: Record<string, ImageBindingView>
): Record<string, ImageBindingView> {
  // Request failed — keep whatever we already had (never drop local state on a network error).
  if (fetched === null) return previous;
  // Empty success (no bindings on the server). Do NOT let it wipe locally-cached history: a refresh
  // must not silently discard bindings the user previously confirmed. Only fall back to empty when we
  // also had nothing locally. Unbind is safe because the UI writes { bound: false } into the map on
  // unbind, so this branch preserves that intent rather than resurrecting a removed link.
  if (Object.keys(fetched).length === 0 && Object.keys(previous).length > 0) {
    return previous;
  }
  return fetched;
}
