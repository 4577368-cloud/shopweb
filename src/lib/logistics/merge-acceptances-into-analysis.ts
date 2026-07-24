import { aggregateDecisionCounts } from "@/lib/logistics/decision-engine";
import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsLine,
  ProductLogisticsProfile,
  QuoteStatus,
  VariantLogisticsDecision,
} from "@/lib/types";

/** Persisted acceptance row — shared by store + UI merge (no Node deps). */
export interface VariantAcceptanceRecord {
  thirdPlatformSkuId: string;
  thirdPlatformItemId: string;
  acceptedAt: string;
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  quoteStatus?: QuoteStatus;
}

function resolveAcceptedQuoteStatus(
  acceptance: VariantAcceptanceRecord,
  variant: VariantLogisticsDecision
): QuoteStatus {
  const line = acceptance.recommendedLine ?? variant.recommendedLine;
  const hasLine = Boolean(line?.lineName?.trim() || line?.lineCode?.trim());
  const status = acceptance.quoteStatus ?? variant.quoteStatus;
  if (hasLine) return status ?? "SUCCESS";
  if (status === "SUCCESS") return "NOT_REQUESTED";
  return status ?? "NOT_REQUESTED";
}

function applyAcceptancesToProduct(
  product: ProductLogisticsProfile,
  bySku: Map<string, VariantAcceptanceRecord>
): ProductLogisticsProfile {
  const variantDecisions = (product.variantDecisions ?? []).map((variant) => {
    const acceptance = bySku.get(variant.thirdPlatformSkuId);
    if (!acceptance) return variant;
    return {
      ...variant,
      decisionStatus: "confirmed" as const,
      decisionReason: "已接受 AI 决策",
      decisionConfirmed: true,
      acceptedAt: acceptance.acceptedAt,
      quoteStatus: resolveAcceptedQuoteStatus(acceptance, variant),
      recommendedLine: acceptance.recommendedLine ?? variant.recommendedLine,
      alternativeLines:
        acceptance.alternativeLines ?? variant.alternativeLines,
    };
  });

  return {
    ...product,
    variantDecisions,
    decisionStatusCounts: aggregateDecisionCounts(variantDecisions),
  };
}

export function mergeAcceptancesIntoAnalysis(
  analysis: LogisticsAnalysis,
  acceptances: VariantAcceptanceRecord[]
): LogisticsAnalysis {
  if (!acceptances.length) return analysis;
  const bySku = new Map(
    acceptances.map((a) => [a.thirdPlatformSkuId, a] as const)
  );

  const productProfiles = (analysis.productProfiles ?? []).map((product) =>
    applyAcceptancesToProduct(product, bySku)
  );

  const totalVariants = productProfiles.reduce(
    (sum, p) => sum + p.totalVariants,
    0
  );
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
    totalVariants,
    decisionStatusCounts,
  };
}

/** Optimistic UI: mark variants confirmed before accept API returns. */
export function mergeQuoteAcceptancesIntoAnalysis(
  analysis: LogisticsAnalysis,
  quotes: Record<
    string,
    {
      recommendedLine?: LogisticsLine;
      alternativeLines?: LogisticsLine[];
      quoteStatus?: QuoteStatus;
    }
  >,
  variantIds: string[]
): LogisticsAnalysis {
  const productBySku = new Map<string, string>();
  for (const product of analysis.productProfiles ?? []) {
    for (const variant of product.variantDecisions ?? []) {
      productBySku.set(variant.thirdPlatformSkuId, product.thirdPlatformItemId);
    }
  }
  const now = new Date().toISOString();
  const acceptances: VariantAcceptanceRecord[] = [];
  for (const id of variantIds) {
    const quote = quotes[id];
    if (!quote?.recommendedLine) continue;
    acceptances.push({
      thirdPlatformSkuId: id,
      thirdPlatformItemId: productBySku.get(id) ?? "",
      acceptedAt: now,
      recommendedLine: quote.recommendedLine,
      alternativeLines: quote.alternativeLines,
      quoteStatus: quote.quoteStatus,
    });
  }
  return mergeAcceptancesIntoAnalysis(analysis, acceptances);
}
