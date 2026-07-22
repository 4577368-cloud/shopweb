import type { BatchLinkProgress } from "@/lib/batch-link/types";
import type {
  NewArrivalAnalysisResult,
  NewArrivalAnalysisSource,
} from "@/lib/new-arrival-analysis-result";
import { isPendingImageBinding } from "@/lib/shop-product-binding-stats";
import type { ImageBindingView } from "@/lib/types";

export function buildNewArrivalResultFromBatch(
  progress: BatchLinkProgress,
  bindingsByItemId: Record<string, ImageBindingView>
): NewArrivalAnalysisResult {
  const source: NewArrivalAnalysisSource =
    progress.source === "auto" ? "auto" : "manual";
  const pendingItemIds: string[] = [];
  const unmatchedItemIds: string[] = [];

  for (const id of progress.sessionOrder) {
    const binding = bindingsByItemId[id];
    const cardState = progress.cardStates[id]?.state;
    if (isPendingImageBinding(binding)) pendingItemIds.push(id);
    else if (cardState === "needs_review" || cardState === "failed") {
      unmatchedItemIds.push(id);
    } else if (!binding?.bound) unmatchedItemIds.push(id);
  }

  return {
    total: progress.sessionOrder.length + progress.deferredIds.length,
    pending: pendingItemIds.length,
    unmatched: unmatchedItemIds.length,
    deferred: progress.deferredIds.length,
    pendingItemIds,
    unmatchedItemIds,
    deferredItemIds: progress.deferredIds,
    source,
  };
}
