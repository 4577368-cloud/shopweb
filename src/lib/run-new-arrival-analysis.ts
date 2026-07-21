import { api } from "@/lib/api";
import { isMatchJobActive, pollMatchJobUntilDone } from "@/lib/match-queue-poll";
import {
  indexMirrorProducts,
  partitionNewArrivalReadiness,
} from "@/lib/new-arrival-analysis-preflight";
import {
  buildNewArrivalAnalysisResult,
  type NewArrivalAnalysisResult,
  type NewArrivalAnalysisSource,
} from "@/lib/new-arrival-analysis-result";
import { mergeProductBaseline } from "@/lib/shop-product-mirror-baseline";
import type { ImageBindingView, MatchJobProgress, ShopMirrorProduct } from "@/lib/types";

export const NEW_ARRIVAL_NOT_READY = "NEW_ARRIVAL_NOT_READY";

const READINESS_POLL_MS = 5_000;
const AUTO_READINESS_MAX_WAIT_MS = 120_000;
const BINDING_REFRESH_MS = 1_000;
const BINDING_REFRESH_TRIES = 5;

export function isNewArrivalNotReadyError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === NEW_ARRIVAL_NOT_READY
  );
}

function throwNotReady(message: string): never {
  const err = new Error(message);
  (err as Error & { code?: string }).code = NEW_ARRIVAL_NOT_READY;
  throw err;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadVariantReadyIds(
  shopName: string,
  itemIds: string[]
): Promise<Set<string>> {
  const ready = new Set<string>();
  await Promise.all(
    itemIds.map(async (itemId) => {
      try {
        const detail = await api.getShopProductDetail(shopName, itemId);
        if (detail.variants?.length) ready.add(itemId);
      } catch {
        // keep deferred until detail is available
      }
    })
  );
  return ready;
}

async function waitForReadiness(
  shopName: string,
  itemIds: string[],
  loadSummary: () => Promise<{
    products: ShopMirrorProduct[];
    bindings: Record<string, ImageBindingView>;
  }>,
  source: NewArrivalAnalysisSource
) {
  const maxWaitMs = source === "auto" ? AUTO_READINESS_MAX_WAIT_MS : 0;
  const deadline = Date.now() + maxWaitMs;

  while (true) {
    const { products } = await loadSummary();
    const byId = indexMirrorProducts(products);
    const variantReadyIds = await loadVariantReadyIds(shopName, itemIds);
    const partition = partitionNewArrivalReadiness(itemIds, byId, variantReadyIds);
    if (partition.readyIds.length > 0) {
      return partition;
    }
    if (maxWaitMs === 0 || Date.now() >= deadline) {
      throwNotReady(
        source === "auto"
          ? "新商品主图或变体尚未同步完成，将稍后自动重试关联"
          : "新商品主图或变体尚未同步完成，请稍后再试"
      );
    }
    await sleep(READINESS_POLL_MS);
  }
}

async function refreshBindingsAfterJob(
  loadSummary: () => Promise<{
    products: ShopMirrorProduct[];
    bindings: Record<string, ImageBindingView>;
  }>,
  expectedLinked: number
) {
  let last = await loadSummary();
  if (expectedLinked <= 0) return last.bindings;
  for (let i = 0; i < BINDING_REFRESH_TRIES; i++) {
    const boundCount = Object.values(last.bindings).filter((b) => b.bound).length;
    if (boundCount >= expectedLinked) return last.bindings;
    await sleep(BINDING_REFRESH_MS);
    last = await loadSummary();
  }
  return last.bindings;
}

function shouldRetryLater(job: MatchJobProgress, readyIds: string[]): boolean {
  if (readyIds.length === 0) return true;
  if (job.processed <= 0) return true;
  if (job.linked > 0) return false;
  return job.skipped + job.failed >= job.processed;
}

export async function runNewArrivalAnalysis(options: {
  shopName: string;
  itemIds: string[];
  source: NewArrivalAnalysisSource;
  loadSummary: () => Promise<{
    products: ShopMirrorProduct[];
    bindings: Record<string, ImageBindingView>;
  }>;
}): Promise<NewArrivalAnalysisResult> {
  const { shopName, itemIds, source, loadSummary } = options;
  if (itemIds.length === 0) {
    throw new Error("暂无待关联新商品");
  }

  const { readyIds, deferredIds } = await waitForReadiness(
    shopName,
    itemIds,
    loadSummary,
    source
  );

  const active = await api.getActiveMatchJob(shopName);
  if (active?.jobId && isMatchJobActive(active.jobStatus)) {
    await pollMatchJobUntilDone(active.jobId);
  }

  const started = await api.startMatchQueue(shopName, { thirdPlatformItemIds: readyIds });
  let finalJob = started;
  if (started.jobId) {
    if (isMatchJobActive(started.jobStatus)) {
      finalJob = await pollMatchJobUntilDone(started.jobId);
    } else {
      finalJob = await api.getMatchJob(started.jobId);
    }
  }

  if (shouldRetryLater(finalJob, readyIds)) {
    throwNotReady("图搜队列未能自动关联，将稍后重试");
  }

  const bindings = await refreshBindingsAfterJob(loadSummary, finalJob.linked);
  const result = buildNewArrivalAnalysisResult({
    attemptedIds: readyIds,
    deferredIds,
    bindingsByItemId: bindings,
    source,
    job: finalJob,
  });

  if (result.pending > 0) {
    mergeProductBaseline(shopName, result.pendingItemIds);
  }

  return result;
}
