import type { LogisticsEstimateResult } from "@/lib/api";
import {
  GOODS_INGESTING_MESSAGE,
  GOODS_SOURCE_NOT_READY_USER_MESSAGE,
  isGatewayGoodsNotReadyMessage,
} from "@/lib/logistics/estimate-goods-block";
import type { LogisticsAnalysis } from "@/lib/types";

export type PipelineFailureBucket =
  | "ingesting"
  | "goodsBlock"
  | "noLine"
  | "gateway"
  | "accept";

export type PipelineFailureBuckets = Record<PipelineFailureBucket, number>;

export type PipelineIssueSample = {
  skuId: string;
  label: string;
  bucket: PipelineFailureBucket;
  reason: string;
};

export const EMPTY_FAILURE_BUCKETS: PipelineFailureBuckets = {
  ingesting: 0,
  goodsBlock: 0,
  noLine: 0,
  gateway: 0,
  accept: 0,
};

export function createEmptyFailureBuckets(): PipelineFailureBuckets {
  return { ...EMPTY_FAILURE_BUCKETS };
}

export function classifyQuoteFailure(
  result: LogisticsEstimateResult | null | undefined
): PipelineFailureBucket | null {
  if (!result) return "gateway";
  if (result.quoteStatus === "INGESTING") return "ingesting";
  if (result.recommendedLine) return null;

  const msg = result.errorMessage?.trim() ?? "";
  if (
    msg === GOODS_INGESTING_MESSAGE ||
    msg === GOODS_SOURCE_NOT_READY_USER_MESSAGE ||
    isGatewayGoodsNotReadyMessage(msg) ||
    /入库|商品库|货源尚未/i.test(msg)
  ) {
    return "goodsBlock";
  }
  if (!msg) return "noLine";
  return "gateway";
}

export function quoteFailureReason(
  result: LogisticsEstimateResult | null | undefined,
  bucket: PipelineFailureBucket
): string {
  const msg = result?.errorMessage?.trim();
  if (msg) return msg;
  switch (bucket) {
    case "ingesting":
      return GOODS_INGESTING_MESSAGE;
    case "goodsBlock":
      return GOODS_SOURCE_NOT_READY_USER_MESSAGE;
    case "noLine":
      return "无可用线路";
    case "gateway":
      return "网关报价失败";
    case "accept":
      return "自动确认失败";
    default:
      return "报价失败";
  }
}

export function buildVariantLabelMap(
  analysis: LogisticsAnalysis | null,
  productId: string
): Map<string, string> {
  const out = new Map<string, string>();
  const product = analysis?.productProfiles?.find(
    (p) => p.thirdPlatformItemId === productId
  );
  for (const variant of product?.variantDecisions ?? []) {
    const label =
      variant.optionLabel?.trim() ||
      variant.thirdPlatformSkuId.slice(-8);
    out.set(variant.thirdPlatformSkuId, label);
  }
  return out;
}

const BUCKET_PRIORITY: PipelineFailureBucket[] = [
  "goodsBlock",
  "ingesting",
  "gateway",
  "noLine",
  "accept",
];

function bucketPriority(bucket: PipelineFailureBucket): number {
  return BUCKET_PRIORITY.indexOf(bucket);
}

export function setProductFailure(
  productFailures: Map<string, PipelineFailureBucket>,
  productId: string,
  bucket: PipelineFailureBucket
): void {
  const prev = productFailures.get(productId);
  if (prev == null || bucketPriority(bucket) < bucketPriority(prev)) {
    productFailures.set(productId, bucket);
  }
}

/** One product → one failure bucket (mutually exclusive); pick highest-priority issue. */
export function mergeProductQuoteFailures(
  productFailures: Map<string, PipelineFailureBucket>,
  skuIds: string[],
  skuToProductId: Map<string, string>,
  quotes: Map<string, LogisticsEstimateResult>
): void {
  for (const skuId of skuIds) {
    const bucket = classifyQuoteFailure(quotes.get(skuId));
    if (!bucket) continue;
    const productId = skuToProductId.get(skuId);
    if (!productId) continue;
    const prev = productFailures.get(productId);
    if (prev == null || bucketPriority(bucket) < bucketPriority(prev)) {
      productFailures.set(productId, bucket);
    }
  }
}

export function bucketsFromProductFailures(
  productFailures: Map<string, PipelineFailureBucket>
): PipelineFailureBuckets {
  const buckets = createEmptyFailureBuckets();
  for (const bucket of productFailures.values()) {
    buckets[bucket] += 1;
  }
  return buckets;
}

export function countProductsWithIngestingSkus(
  skuIds: string[],
  skuToProductId: Map<string, string>,
  quotes: Map<string, LogisticsEstimateResult>
): number {
  const products = new Set<string>();
  for (const skuId of skuIds) {
    if (quotes.get(skuId)?.quoteStatus !== "INGESTING") continue;
    const productId = skuToProductId.get(skuId);
    if (productId) products.add(productId);
  }
  return products.size;
}

export function activeProductTitles(
  ids: string[],
  titleById: Map<string, string>,
  max = 3
): string[] {
  return ids
    .map((id) => titleById.get(id)?.trim())
    .filter((title): title is string => Boolean(title))
    .slice(0, max);
}
