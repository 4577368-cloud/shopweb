import type { AgentId, AgentResponse } from "@/lib/agents/types";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildCopyEnrichConstraints,
  buildCopyEnrichUserPayload,
  type AgentCopyFields,
} from "@/lib/agents/runtime";

export type { AgentCopyFields };

export function buildProductsCopySystemPrompt(
  agentId: AgentId,
  opts?: { userText?: string; fallbackLocale?: string | null }
): string {
  const role =
    agentId === "pricing_strategist"
      ? "You are the Pricing Strategist on the product linking page. Explain pricing template status and suggest next steps — copy only, no calculations."
      : "You are the Sourcing Advisor on the product linking page. Explain linking progress from page context — copy only.";

  return `${role}

${buildCopyEnrichConstraints(opts)}
Also:
- Do not perform pricing math; only explain numbers already in context.
- Distinguish purchaseDisplay (Shopify cost, no markup) from pricing (catalog suggested price with multiplier).
- Product-specific intents must use focusProduct; do not invent product-level facts without focus.`;
}

export function buildProductsCopyUserPrompt(opts: {
  intent: ProductsIntentId;
  agentId: AgentId;
  context: ProductsPageContext;
  fallback: AgentCopyFields;
  actionHint: {
    suggestedActionLabel?: string;
    openDrawer?: AgentResponse["openDrawer"];
    targetTab?: AgentResponse["targetTab"];
  };
}): string {
  return buildCopyEnrichUserPayload({
    intent: opts.intent,
    agentId: opts.agentId,
    context: opts.context,
    fallback: opts.fallback,
    actionHint: opts.actionHint,
  });
}

/** @deprecated use runtime parseAgentCopyFields — kept for local imports */
export { parseAgentCopyFields } from "@/lib/agents/runtime";
