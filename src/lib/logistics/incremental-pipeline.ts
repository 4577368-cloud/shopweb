import type { LogisticsEstimateResult } from "@/lib/api";
import { isVariantException } from "@/lib/logistics/display";
import type {
  LogisticsAnalysis,
  LogisticsTemplate,
  VariantLogisticsDecision,
} from "@/lib/types";

export type PipelineSkuStep = "quote" | "accept";

export type ProductPipelineWork = {
  productId: string;
  title: string;
  quoteVariantIds: string[];
  acceptVariantIds: string[];
};

export type LogisticsPipelineProgress = {
  phase: "idle" | "waiting" | "running" | "done" | "error";
  productIndex: number;
  productTotal: number;
  currentProductId: string | null;
  currentProductTitle: string | null;
  currentSkuStep: PipelineSkuStep | null;
  stats: {
    autoAccepted: number;
    pendingReview: number;
    failed: number;
    skipped: number;
  };
  error: string | null;
};

export const INITIAL_PIPELINE_PROGRESS: LogisticsPipelineProgress = {
  phase: "idle",
  productIndex: 0,
  productTotal: 0,
  currentProductId: null,
  currentProductTitle: null,
  currentSkuStep: null,
  stats: { autoAccepted: 0, pendingReview: 0, failed: 0, skipped: 0 },
  error: null,
};

export function hasSavedLogisticsTemplate(
  templates: LogisticsTemplate[]
): boolean {
  return templates.length > 0;
}

export function canAutoAcceptVariant(
  variant: VariantLogisticsDecision,
  quote?: LogisticsEstimateResult | null
): boolean {
  if (variant.decisionConfirmed) return false;
  if (variant.decisionStatus !== "ready_for_quote") return false;
  if (isVariantException(variant)) return false;
  if (!quote?.recommendedLine) return false;
  if (quote.quoteStatus === "INGESTING") return false;
  return true;
}

function variantHasSkuBinding(variant: VariantLogisticsDecision): boolean {
  return Boolean(variant.tangbuySkuId?.trim() && variant.tangbuyGoodsId?.trim());
}

/** Whether a variant still needs quote fetch in the incremental pipeline. */
export function variantNeedsQuote(
  variant: VariantLogisticsDecision,
  quoteCache: Map<string, LogisticsEstimateResult>
): boolean {
  if (variant.decisionStatus === "pending_sku") return false;
  if (!variantHasSkuBinding(variant)) return false;

  const cached = quoteCache.get(variant.thirdPlatformSkuId);
  if (variant.decisionConfirmed) {
    return !cached?.recommendedLine;
  }

  if (cached?.recommendedLine) return false;

  if (variant.decisionStatus === "ready_for_quote") return true;
  if (isVariantException(variant)) return true;

  return false;
}

/** Ready for quote + cached line — only needs silent accept. */
export function variantNeedsAcceptOnly(
  variant: VariantLogisticsDecision,
  quoteCache: Map<string, LogisticsEstimateResult>
): boolean {
  return canAutoAcceptVariant(
    variant,
    quoteCache.get(variant.thirdPlatformSkuId)
  );
}

export function variantNeedsPipelineWork(
  variant: VariantLogisticsDecision,
  quoteCache: Map<string, LogisticsEstimateResult>
): boolean {
  return (
    variantNeedsQuote(variant, quoteCache) ||
    variantNeedsAcceptOnly(variant, quoteCache)
  );
}

export function computeNeedsWork(
  analysis: LogisticsAnalysis | null | undefined,
  quoteCache: Map<string, LogisticsEstimateResult>
): ProductPipelineWork[] {
  const works: ProductPipelineWork[] = [];

  for (const product of analysis?.productProfiles ?? []) {
    const quoteVariantIds: string[] = [];
    const acceptVariantIds: string[] = [];

    for (const variant of product.variantDecisions ?? []) {
      if (variantNeedsQuote(variant, quoteCache)) {
        quoteVariantIds.push(variant.thirdPlatformSkuId);
      } else if (variantNeedsAcceptOnly(variant, quoteCache)) {
        acceptVariantIds.push(variant.thirdPlatformSkuId);
      }
    }

    if (quoteVariantIds.length > 0 || acceptVariantIds.length > 0) {
      works.push({
        productId: product.thirdPlatformItemId,
        title: product.title?.trim() || product.thirdPlatformItemId,
        quoteVariantIds,
        acceptVariantIds,
      });
    }
  }

  return works;
}

export function countPipelineSkippedVariants(
  analysis: LogisticsAnalysis | null | undefined
): number {
  let count = 0;
  for (const product of analysis?.productProfiles ?? []) {
    for (const variant of product.variantDecisions ?? []) {
      if (variant.decisionStatus === "pending_sku") count += 1;
    }
  }
  return count;
}
