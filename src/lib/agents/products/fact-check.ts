import type { AgentCopyFields } from "@/lib/agents/runtime";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { assertCopyGrounded } from "@/lib/agents/runtime";

/**
 * Products fact-check: tokens from page counts / pricing / filters.
 */
export function assertProductsCopyGrounded(
  copy: AgentCopyFields,
  context: ProductsPageContext
): void {
  assertCopyGrounded(copy, {
    allowedTokens: [
      context.analyzedCount,
      context.matchedCount,
      context.pendingCount,
      context.unboundCount,
      context.pricing.exchangeRate,
      context.pricing.multiplier,
      context.pricing.addend,
      context.pricing.targetCurrency,
    ],
    harvestText: [
      context.pricing.summaryLine,
      ...context.recommendedCategoryNames,
      ...context.filterSummary,
    ],
  });
}
