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
  if (fetched === null) return previous;
  return fetched;
}
