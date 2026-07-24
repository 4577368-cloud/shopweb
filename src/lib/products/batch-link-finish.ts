import { formatBatchLinkSummary, type BatchLinkProgress } from "@/lib/batch-link/types";
import { buildNewArrivalResultFromBatch } from "@/lib/batch-link/build-new-arrival-result";
import { formatNewArrivalAnalysisSummary } from "@/lib/new-arrival-analysis-result";
import { mergeProductBaseline } from "@/lib/shop-product-mirror-baseline";
import type { LoadSummaryFn } from "@/hooks/use-products-entry";

export interface HandleProductsBatchLinkFinishParams {
  shopName: string;
  progress: BatchLinkProgress;
  loadSummary: LoadSummaryFn;
  bumpMirrorRefresh: () => void;
  showToast: (message: string) => void;
  clearBatchLinkProgress: () => void;
}

/** After ShopProductsPanel batch link completes: refresh mirror, baseline, toast. */
export async function handleProductsBatchLinkFinish({
  shopName,
  progress,
  loadSummary,
  bumpMirrorRefresh,
  showToast,
  clearBatchLinkProgress,
}: HandleProductsBatchLinkFinishParams): Promise<void> {
  const data = await loadSummary({ force: true });
  if (!data) return;
  const { bindings } = data;
  bumpMirrorRefresh();
  if (progress.sessionOrder.length > 0) {
    mergeProductBaseline(shopName, progress.sessionOrder);
  }
  if (progress.processed > 0) {
    const result = buildNewArrivalResultFromBatch(progress, bindings);
    showToast(
      progress.source === "auto"
        ? formatNewArrivalAnalysisSummary(result)
        : formatBatchLinkSummary(progress)
    );
  }
  window.setTimeout(clearBatchLinkProgress, 2000);
}
