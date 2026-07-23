import { normalizeMatchScore } from "@/lib/agents/products/match-rank";
import { api } from "@/lib/api";
import { HIGH_MATCH_THRESHOLD } from "@/data/mock";
import type { ImageBindingView } from "@/lib/types";

/** PENDING auto-link with title/image score at or above high-match threshold. */
export function isHighConfidencePendingBinding(
  binding: ImageBindingView
): boolean {
  if (!binding.bound || binding.bindStatus !== "PENDING") return false;
  const score = normalizeMatchScore(binding.matchScore);
  return score != null && score >= HIGH_MATCH_THRESHOLD;
}

/** Promote a freshly auto-linked row from PENDING → ACTIVE (fail-open). */
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

/** Silent sweep for server-queue / legacy high-match rows still awaiting ack. */
export async function autoAckHighConfidencePendingBindings(
  shopName: string,
  bindings: Record<string, ImageBindingView>
): Promise<Record<string, ImageBindingView>> {
  const ids = Object.entries(bindings)
    .filter(([, b]) => isHighConfidencePendingBinding(b))
    .map(([id]) => id);
  if (ids.length === 0) return bindings;

  const next = { ...bindings };
  try {
    const result = await api.batchAckImageBindings(shopName, ids);
    for (const id of ids) {
      if (!result.failed.includes(id)) {
        const prev = next[id];
        if (prev?.bound) {
          next[id] = { ...prev, bindStatus: "ACTIVE" };
        }
      }
    }
  } catch {
    // Fail-open — user can still batch-ack manually.
  }
  return next;
}
