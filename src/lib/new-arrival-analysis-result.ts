import type { ImageBindingView, MatchJobProgress } from "@/lib/types";

export type NewArrivalAnalysisSource = "manual" | "auto";

export type NewArrivalAnalysisResult = {
  total: number;
  pending: number;
  unmatched: number;
  deferred: number;
  pendingItemIds: string[];
  unmatchedItemIds: string[];
  deferredItemIds: string[];
  source: NewArrivalAnalysisSource;
};

export function buildNewArrivalAnalysisResult(input: {
  attemptedIds: string[];
  deferredIds: string[];
  bindingsByItemId: Record<string, ImageBindingView>;
  source: NewArrivalAnalysisSource;
  job?: MatchJobProgress | null;
}): NewArrivalAnalysisResult {
  const { attemptedIds, deferredIds, bindingsByItemId, source, job } = input;
  const pendingItemIds: string[] = [];
  const unmatchedItemIds: string[] = [];

  for (const id of attemptedIds) {
    const binding = bindingsByItemId[id];
    if (binding?.bound) pendingItemIds.push(id);
    else unmatchedItemIds.push(id);
  }

  // If the queue reports links but bindings are not visible yet, trust the job.
  if (
    pendingItemIds.length === 0 &&
    job &&
    job.linked > 0 &&
    attemptedIds.length > 0
  ) {
    const fallback = attemptedIds.slice(0, job.linked);
    pendingItemIds.push(...fallback);
    for (const id of fallback) {
      const idx = unmatchedItemIds.indexOf(id);
      if (idx >= 0) unmatchedItemIds.splice(idx, 1);
    }
  }

  return {
    total: attemptedIds.length + deferredIds.length,
    pending: pendingItemIds.length,
    unmatched: unmatchedItemIds.length,
    deferred: deferredIds.length,
    pendingItemIds,
    unmatchedItemIds,
    deferredItemIds: deferredIds,
    source,
  };
}

export function formatNewArrivalAnalysisSummary(result: NewArrivalAnalysisResult): string {
  const lead = result.source === "auto" ? "已自动完成" : "已完成";
  const linked = result.total - result.deferred;
  const parts = [`${lead} ${linked} 个新商品关联`];
  const detail: string[] = [];
  if (result.pending > 0) detail.push(`${result.pending} 个进入待确认`);
  if (result.unmatched > 0) {
    detail.push(`${result.unmatched} 个未能自动关联，可手动查找候选`);
  }
  if (result.deferred > 0) detail.push(`${result.deferred} 个待主图就绪后将自动关联`);
  if (detail.length > 0) parts.push(`其中 ${detail.join("，")}`);
  return parts.join("，");
}
