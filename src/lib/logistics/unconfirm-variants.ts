import { aggregateDecisionCounts } from "@/lib/logistics/decision-engine";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  VariantLogisticsDecision,
} from "@/lib/types";

/** Reopen a confirmed SKU for human reselect — keep quote lines, force needs_review. */
export function unconfirmVariantDecision(
  variant: VariantLogisticsDecision
): VariantLogisticsDecision {
  if (!variant.decisionConfirmed && variant.decisionStatus !== "confirmed") {
    return variant;
  }
  return {
    ...variant,
    decisionConfirmed: false,
    decisionStatus: "needs_review",
    decisionReason: "用户重选线路",
    acceptedAt: undefined,
  };
}

/** Clear confirmations for the given SKU ids (quotes retained). */
export function unconfirmVariantsInAnalysis(
  analysis: LogisticsAnalysis,
  variantIds: string[]
): LogisticsAnalysis {
  const idSet = new Set(variantIds.filter(Boolean));
  if (idSet.size === 0) return analysis;

  const productProfiles = (analysis.productProfiles ?? []).map((product) => {
    const variantDecisions = (product.variantDecisions ?? []).map((variant) =>
      idSet.has(variant.thirdPlatformSkuId)
        ? unconfirmVariantDecision(variant)
        : variant
    );
    return {
      ...product,
      variantDecisions,
      decisionStatusCounts: aggregateDecisionCounts(variantDecisions),
    };
  });

  const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
    pending_sku: 0,
    pending_postal_meta: 0,
    ready_for_quote: 0,
    confirmed: 0,
    restricted: 0,
    needs_review: 0,
  };
  for (const p of productProfiles) {
    for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
      decisionStatusCounts[status as LogisticsDecisionStatus] += count;
    }
  }

  return {
    ...analysis,
    productProfiles,
    totalVariants: productProfiles.reduce((sum, p) => sum + p.totalVariants, 0),
    decisionStatusCounts,
  };
}
