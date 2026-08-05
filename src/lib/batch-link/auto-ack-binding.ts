import { api } from "@/lib/api";
import type { ImageBindingView } from "@/lib/types";

/**
 * @deprecated High-score PENDING rows are no longer auto-acked.
 * All AI auto-links stay PENDING until the merchant confirms (single or batch).
 * Kept as a always-false helper so call sites compile during migration.
 */
export function isHighConfidencePendingBinding(
  _binding: ImageBindingView
): boolean {
  return false;
}

/** Promote a PENDING binding to ACTIVE (single-card confirm). Fail-open. */
export async function ackAutoLinkedBinding(
  shopName: string,
  itemId: string,
  view: ImageBindingView
): Promise<ImageBindingView> {
  if (view.bindStatus !== "PENDING") return view;
  try {
    await api.ackImageBinding(shopName, itemId);
    return { ...view, bindStatus: "ACTIVE" };
  } catch {
    return view;
  }
}

/**
 * No-op: do not silently promote high-match PENDING rows.
 * Merchants confirm via「确认无误」or「批量确认」.
 */
export async function autoAckHighConfidencePendingBindings(
  _shopName: string,
  bindings: Record<string, ImageBindingView>
): Promise<Record<string, ImageBindingView>> {
  return bindings;
}
