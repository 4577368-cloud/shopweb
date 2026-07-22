import type { LogisticsEstimateResult } from "@/lib/api";
import type { LogisticsAnalysis } from "@/lib/types";

const PREFIX = "logistics-quotes:v2:";

function storageKey(shopName: string, scopeKey: string): string {
  return `${PREFIX}${shopName}:${scopeKey}`;
}

export function readQuoteCache(
  shopName: string,
  scopeKey: string
): Map<string, LogisticsEstimateResult> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(storageKey(shopName, scopeKey));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as LogisticsEstimateResult[];
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed.map((r) => [r.thirdPlatformSkuId, r]));
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
    const rows = [...results.values()];
    localStorage.setItem(storageKey(shopName, scopeKey), JSON.stringify(rows));
  } catch {
    // ignore quota / private mode
  }
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
