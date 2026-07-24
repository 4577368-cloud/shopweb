import type { LogisticsEstimateResult } from "@/lib/api";
import { isGoodsSourceQuoteFailure } from "@/lib/logistics/estimate-goods-block";
import { readProductSourceIdentity } from "@/lib/product-source-identity";
import type { LogisticsAnalysis, VariantLogisticsDecision } from "@/lib/types";

const PREFIX = "logistics-quotes:v2:";

/** 报价缓存有效期：同模板下超过此时长视为过期，读取时失效重拉。 */
export const QUOTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface QuoteCacheEnvelope {
  writtenAt: number;
  entries: LogisticsEstimateResult[];
}

function storageKey(shopName: string, scopeKey: string): string {
  return `${PREFIX}${shopName}:${scopeKey}`;
}

export function readQuoteCache(
  shopName: string,
  scopeKey: string,
  now: number = Date.now()
): Map<string, LogisticsEstimateResult> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(storageKey(shopName, scopeKey));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as QuoteCacheEnvelope;
    if (!parsed || !Array.isArray(parsed.entries)) return new Map();
    if (now - parsed.writtenAt > QUOTE_CACHE_TTL_MS) return new Map();
    return new Map(parsed.entries.map((r) => [r.thirdPlatformSkuId, r]));
  } catch {
    return new Map();
  }
}

export function writeQuoteCache(
  shopName: string,
  scopeKey: string,
  results: Map<string, LogisticsEstimateResult>
): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: QuoteCacheEnvelope = {
      writtenAt: Date.now(),
      entries: [...results.values()],
    };
    localStorage.setItem(storageKey(shopName, scopeKey), JSON.stringify(envelope));
  } catch {
    // ignore quota / private mode
  }
}

function variantLooksGoodsQuoteBlocked(
  variant: VariantLogisticsDecision,
  quote?: LogisticsEstimateResult
): boolean {
  if (quote && isGoodsSourceQuoteFailure(quote)) return true;
  if (quote) return false;
  if (variant.quoteStatus === "INGESTING") return true;
  if (variant.quoteStatus === "FAILED") {
    const hasLine = Boolean(
      variant.recommendedLine?.lineName?.trim() ||
        variant.recommendedLine?.lineCode?.trim()
    );
    return !hasLine;
  }
  return false;
}

/** After catalog ingest, drop stale goods-block quotes and FAILED flags merged into analysis. */
export function applyCatalogIngestQuoteReset(
  analysis: LogisticsAnalysis | null | undefined,
  productId: string,
  quoteResults: Map<string, LogisticsEstimateResult>
): {
  analysis: LogisticsAnalysis | null | undefined;
  quoteResults: Map<string, LogisticsEstimateResult>;
} {
  const pid = productId.trim();
  const nextQuotes = new Map(quoteResults);
  if (!analysis?.productProfiles?.length || !pid) {
    return { analysis, quoteResults: nextQuotes };
  }

  const nextAnalysis: LogisticsAnalysis = {
    ...analysis,
    productProfiles: analysis.productProfiles.map((product) => {
      if (product.thirdPlatformItemId !== pid) return product;
      return {
        ...product,
        variantDecisions: (product.variantDecisions ?? []).map((variant) => {
          const quote = nextQuotes.get(variant.thirdPlatformSkuId);
          if (!variantLooksGoodsQuoteBlocked(variant, quote)) {
            return variant;
          }
          nextQuotes.delete(variant.thirdPlatformSkuId);
          return {
            ...variant,
            quoteStatus: "NOT_REQUESTED",
            recommendedLine: undefined,
            alternativeLines: undefined,
          };
        }),
      };
    }),
  };

  return { analysis: nextAnalysis, quoteResults: nextQuotes };
}

/** Drop cached goods-block / FAILED rows for products that already have internalGoodsId. */
export function stripStaleGoodsBlockedQuotesForIdentities(
  analysis: LogisticsAnalysis,
  quoteResults: Map<string, LogisticsEstimateResult>,
  shopName: string
): {
  analysis: LogisticsAnalysis;
  quoteResults: Map<string, LogisticsEstimateResult>;
} {
  const shop = shopName.trim();
  if (!shop || !analysis.productProfiles?.length) {
    return { analysis, quoteResults };
  }
  let nextAnalysis = analysis;
  let nextQuotes = quoteResults;
  for (const profile of analysis.productProfiles) {
    const itemId = profile.thirdPlatformItemId?.trim();
    if (!itemId) continue;
    const identity = readProductSourceIdentity(shop, itemId);
    if (!identity?.internalGoodsId?.trim()) continue;
    const reset = applyCatalogIngestQuoteReset(nextAnalysis, itemId, nextQuotes);
    nextAnalysis = reset.analysis ?? nextAnalysis;
    nextQuotes = reset.quoteResults;
  }
  return { analysis: nextAnalysis, quoteResults: nextQuotes };
}

export function mergeQuoteResultsIntoAnalysis(
  analysis: LogisticsAnalysis,
  results: Map<string, LogisticsEstimateResult>
): LogisticsAnalysis {
  if (!analysis.productProfiles?.length || results.size === 0) return analysis;

  return {
    ...analysis,
    productProfiles: analysis.productProfiles.map((product) => ({
      ...product,
      variantDecisions: (product.variantDecisions ?? []).map((variant) => {
        const quote = results.get(variant.thirdPlatformSkuId);
        if (!quote) return variant;
        return {
          ...variant,
          quoteStatus: quote.quoteStatus,
          recommendedLine: quote.recommendedLine ?? variant.recommendedLine,
          alternativeLines: quote.alternativeLines ?? variant.alternativeLines,
          estimatedWeightG: quote.estimatedWeightG ?? variant.estimatedWeightG,
          estimatedVolumeCm3:
            quote.estimatedVolumeCm3 ?? variant.estimatedVolumeCm3,
          estimatedLengthCm: quote.estimatedLengthCm ?? variant.estimatedLengthCm,
          estimatedWidthCm: quote.estimatedWidthCm ?? variant.estimatedWidthCm,
          estimatedHeightCm: quote.estimatedHeightCm ?? variant.estimatedHeightCm,
        };
      }),
    })),
  };
}
