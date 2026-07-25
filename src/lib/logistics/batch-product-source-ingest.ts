import type { LogisticsEstimateResult } from "@/lib/api";
import { ingestProductSourceForLogistics } from "@/lib/logistics/resolve-estimate-goods-id";
import { mapWithConcurrency } from "@/lib/logistics/estimate-batch";
import { productSourceIngestPhase } from "@/lib/tangbuy/catalog-ingest-display";
import type { LogisticsAnalysis, ProductLogisticsProfile } from "@/lib/types";

const BATCH_CONCURRENCY = 2;
const MAX_PRODUCTS_PER_RUN = 24;

export function collectProfilesNeedingCatalogIngest(input: {
  shopName: string;
  analysis: LogisticsAnalysis | null | undefined;
  quoteResults: Map<string, LogisticsEstimateResult>;
}): ProductLogisticsProfile[] {
  const shop = input.shopName.trim();
  if (!shop || !input.analysis?.productProfiles?.length) return [];

  const out: ProductLogisticsProfile[] = [];
  for (const profile of input.analysis.productProfiles) {
    const variants = profile.variantDecisions ?? [];
    const hasBinding = variants.some(
      (v) => v.tangbuySkuId?.trim() && v.tangbuyGoodsId?.trim()
    );
    if (!hasBinding) continue;
    const phase = productSourceIngestPhase({
      shopName: shop,
      thirdPlatformItemId: profile.thirdPlatformItemId,
      variants,
      quoteResults: input.quoteResults,
    });
    if (phase === "not_in_catalog") {
      out.push(profile);
    }
  }
  return out;
}

export type BatchProductSourceIngestResult = {
  attempted: number;
  ready: number;
  ingesting: number;
  failed: number;
  readyProductIds: string[];
};

export async function batchIngestProductSourcesForLogistics(input: {
  shopName: string;
  profiles: ProductLogisticsProfile[];
}): Promise<BatchProductSourceIngestResult> {
  const shopName = input.shopName.trim();
  const slice = input.profiles.slice(0, MAX_PRODUCTS_PER_RUN);
  const result: BatchProductSourceIngestResult = {
    attempted: slice.length,
    ready: 0,
    ingesting: 0,
    failed: 0,
    readyProductIds: [],
  };
  if (!shopName || slice.length === 0) return result;

  await mapWithConcurrency(slice, BATCH_CONCURRENCY, async (profile) => {
    try {
      const { ready, ingesting } = await ingestProductSourceForLogistics({
        shopName,
        profile,
      });
      if (ready) {
        result.ready += 1;
        result.readyProductIds.push(profile.thirdPlatformItemId);
      } else if (ingesting) result.ingesting += 1;
      else result.failed += 1;
    } catch {
      result.failed += 1;
    }
  });

  return result;
}

const sessionRan = new Set<string>();

/** Once per browser session per shop — warms catalog before quote pipeline. */
export function shouldRunLogisticsBatchPreIngest(shopName: string): boolean {
  const shop = shopName.trim();
  if (!shop) return false;
  if (sessionRan.has(shop)) return false;
  if (typeof window !== "undefined") {
    const key = `tangbuy.logistics.batchPreIngest.${shop}`;
    try {
      if (window.sessionStorage.getItem(key) === "1") {
        sessionRan.add(shop);
        return false;
      }
    } catch {
      // ignore
    }
  }
  return true;
}

export function markLogisticsBatchPreIngestRan(shopName: string): void {
  const shop = shopName.trim();
  if (!shop) return;
  sessionRan.add(shop);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(`tangbuy.logistics.batchPreIngest.${shop}`, "1");
    } catch {
      // ignore
    }
  }
}
