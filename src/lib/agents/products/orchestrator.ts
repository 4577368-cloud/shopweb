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
