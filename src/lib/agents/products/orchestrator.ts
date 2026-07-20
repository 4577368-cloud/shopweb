import type { AgentResponse } from "@/lib/agents/types";
import {
  intentDef,
  type ProductsIntentId,
} from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { handlePricingStrategist } from "@/lib/agents/products/pricing-strategist";
import { handleSourcingAdvisor } from "@/lib/agents/products/sourcing-advisor";

/**
 * Lightweight rule router: intent + PageContext → agent handler → AgentResponse.
 *
 * Deterministic skeleton (suggestedAction / openDrawer / targetTab / …).
 * Copy enrichment (summary / explanation / nextSteps) happens in
 * resolveProductsAgentResponse /api/agents/products/copy — not here.
 */
export function routeProductsIntent(
  intent: ProductsIntentId,
  ctx: ProductsPageContext
): AgentResponse {
  const def = intentDef(intent);
  if (def.agent === "pricing_strategist") {
    return handlePricingStrategist(intent, ctx);
  }
  return handleSourcingAdvisor(intent, ctx);
}

/**
 * Soft chip ordering: surface the most relevant intents first (still all available).
 */
export function visibleProductChips(ctx: ProductsPageContext): ProductsIntentId[] {
  const ordered: ProductsIntentId[] = [];
  const push = (id: ProductsIntentId) => {
    if (!ordered.includes(id)) ordered.push(id);
  };

  if (!ctx.authorized) {
    push("explain_pricing");
    return ordered;
  }

  if (!ctx.pricing.configured) {
    push("explain_pricing");
    push("configure_pricing");
  }

  push("summarize_shop_status");

  if (ctx.pendingCount > 0) push("go_pending");
  if (ctx.unboundCount > 0) push("go_unbound");

  push("propose_candidate_search");
  push("go_discover");
  push("suggest_filters");

  if (ctx.pricing.configured) {
    push("explain_pricing");
    push("configure_pricing");
  }

  return ordered;
}
