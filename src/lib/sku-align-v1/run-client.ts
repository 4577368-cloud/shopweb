import { api, ApiError } from "@/lib/api";
import { isSkuAlignV1Unavailable, shouldFallbackToLegacyAlign } from "@/lib/sku-align-v1/compat";
import type {
  SkuAlignRunRequest,
  SkuAlignRunStatus,
} from "@/lib/sku-align-v1/types";

const RUN_POLL_MS = 800;
const RUN_POLL_MAX = 120;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll a V1 alignment run until terminal status. */
export async function pollSkuAlignRun(
  shopName: string,
  runId: number
): Promise<SkuAlignRunStatus> {
  for (let i = 0; i < RUN_POLL_MAX; i++) {
    const status = await api.skuAlignV1RunStatus(shopName, runId);
    if (status.runStatus !== "QUEUED" && status.runStatus !== "RUNNING") {
      return status;
    }
    await sleep(RUN_POLL_MS);
  }
  throw new Error("对齐任务超时，请稍后刷新查看结果");
}

async function legacyAutoAlignBatch(
  shopName: string,
  productIds: string[],
  shouldAbort?: () => boolean
): Promise<SkuAlignRunStatus> {
  let matched = 0;
  let totalVariants = 0;
  let failed = 0;
  let processed = 0;
  for (const productId of productIds) {
    if (shouldAbort?.()) break;
    if (!productId?.trim()) continue;
    processed++;
    try {
      const result = await api.autoAlignSku(shopName, productId.trim());
      matched += result.matchedCount ?? 0;
      totalVariants += result.totalVariants ?? 0;
    } catch {
      failed++;
    }
  }
  const unmapped = Math.max(0, totalVariants - matched);
  const allFailed = processed > 0 && failed >= processed;
  return {
    runId: 0,
    runStatus: shouldAbort?.()
      ? "PARTIAL"
      : allFailed
        ? "FAILED"
        : failed > 0
          ? "PARTIAL"
          : "SUCCEEDED",
    matchedCount: matched,
    suggestedCount: matched,
    unmappedCount: unmapped,
    noSourceCount: 0,
    blockedCount: 0,
    failedCount: failed,
  };
}

export async function enqueueSkuAlignRun(
  shopName: string,
  body: Omit<SkuAlignRunRequest, "shopName">,
  shouldAbort?: () => boolean
): Promise<SkuAlignRunStatus | null> {
  try {
    const accepted = await api.skuAlignV1EnqueueRun({ shopName, ...body });
    if (!accepted.accepted || !accepted.runId) {
      return null;
    }
    return pollSkuAlignRun(shopName, accepted.runId);
  } catch (err) {
    if (!shouldFallbackToLegacyAlign(err)) throw err;
    if (!body.scopeIds?.length) return null;
    return legacyAutoAlignBatch(shopName, body.scopeIds, shouldAbort);
  }
}
