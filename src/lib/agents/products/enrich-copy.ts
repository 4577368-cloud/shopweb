import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { routeProductsIntent } from "@/lib/agents/products/orchestrator";
import {
  buildProductsCopySystemPrompt,
  buildProductsCopyUserPrompt,
} from "@/lib/agents/products/copy-prompt";
import { productsContextFingerprint } from "@/lib/agents/products/classify-service";
import { productsCopyCache } from "@/lib/agents/products/copy-cache";
import {
  resolveEnrichedAgentResponse,
  type EnrichedAgentResponse,
} from "@/lib/agents/runtime";

export type { EnrichedAgentResponse };
export type { AgentCopySource } from "@/lib/agents/runtime";

/**
 * Products enrich entry — uses shared pipeline; page-specific prompts / tokens.
 */
export async function resolveProductsAgentResponse(
  intent: ProductsIntentId,
  context: ProductsPageContext
): Promise<EnrichedAgentResponse> {
  return resolveEnrichedAgentResponse({
    pageKey: "products",
    intent,
    context,
    route: routeProductsIntent,
    fingerprint: productsContextFingerprint,
    buildSystemPrompt: (base) => buildProductsCopySystemPrompt(base.agentId),
    buildUserPrompt: (intentId, ctx, base, fallback) =>
      buildProductsCopyUserPrompt({
        intent: intentId,
        agentId: base.agentId,
        context: ctx,
        fallback,
        actionHint: {
          suggestedActionLabel: base.suggestedAction.label,
          openDrawer: base.openDrawer ?? null,
          targetTab: base.targetTab ?? null,
        },
      }),
    factCheck: {
      enabled: true,
      allowedTokens: (ctx) => [
        ctx.analyzedCount,
        ctx.matchedCount,
        ctx.pendingCount,
        ctx.unboundCount,
        ctx.pricing.exchangeRate,
        ctx.pricing.multiplier,
        ctx.pricing.addend,
        ctx.pricing.targetCurrency,
        ctx.purchaseDisplay.exchangeRate,
        ctx.purchaseDisplay.currency,
        ctx.focusProduct?.purchaseCost,
        ctx.focusProduct?.profitPerOrder,
        ctx.focusProduct?.matchScore,
        ctx.scanHandoff?.productCount,
        ctx.scanHandoff?.matchedCount,
        ctx.scanHandoff?.pendingCount,
      ],
      harvestText: (ctx) => [
        ctx.pricing.summaryLine,
        ctx.purchaseDisplay.summaryLine,
        ...ctx.recommendedCategoryNames,
        ...ctx.filterSummary,
        ...(ctx.focusProduct?.rankingReasons ?? []),
        ...(ctx.focusProduct?.riskFlags ?? []),
      ],
    },
    cache: productsCopyCache,
    logPrefix: "[products-agent-copy] fallback to template:",
  });
}
