import { api } from "@/lib/api";
import { promotePendingImageBinding } from "@/lib/batch-link/promote-pending-binding";
import { isPendingImageBinding } from "@/lib/shop-product-binding-stats";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

/** Product IDs with AI-suggested bindings awaiting human ack. */
export function listPendingAckProductIds(
  products: ShopMirrorProduct[],
  bindings: Record<string, ImageBindingView>
): string[] {
  return products
    .filter((p) => isPendingImageBinding(bindings[p.thirdPlatformItemId]))
    .map((p) => p.thirdPlatformItemId);
}

export async function batchAckPendingBindings(
  shopName: string,
  productIds: string[],
  bindings: Record<string, ImageBindingView> = {}
): Promise<{ ok: number; failed: string[] }> {
  if (productIds.length === 0) return { ok: 0, failed: [] };
  const failed: string[] = [];
  let ok = 0;
  for (const id of productIds) {
    const binding = bindings[id];
    try {
      if (binding?.bound && binding.bindStatus === "PENDING") {
        await promotePendingImageBinding(shopName, id, binding);
      } else {
        await api.ackImageBinding(shopName, id);
      }
      ok += 1;
    } catch {
      failed.push(id);
    }
  }
  return { ok, failed };
}

/** Apply ACTIVE status locally for rows acked successfully. */
export function applyBatchAckToBindings(
  bindings: Record<string, ImageBindingView>,
  productIds: string[],
  failed: string[]
): Record<string, ImageBindingView> {
  const failedSet = new Set(failed);
  let changed = false;
  const next = { ...bindings };
  for (const id of productIds) {
    if (failedSet.has(id)) continue;
    const prev = next[id];
    if (!prev?.bound) continue;
    next[id] = { ...prev, bindStatus: "ACTIVE" };
    changed = true;
  }
  return changed ? next : bindings;
}
