import type { AgentId, AgentResponse } from "@/lib/agents/types";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildCopyEnrichUserPayload,
  COPY_ENRICH_CONSTRAINTS,
  type AgentCopyFields,
} from "@/lib/agents/runtime";

export type { AgentCopyFields };

export function buildProductsCopySystemPrompt(agentId: AgentId): string {
  const role =
    agentId === "pricing_strategist"
      ? "你是 Tangbuy 智能选品页的 Pricing Strategist，只解释定价模板状态并给出文案建议。"
      : "你是 Tangbuy 智能选品页的 Sourcing Advisor，只基于页面状态解释选品进度并给出文案建议。";

  return `${role}

${COPY_ENRICH_CONSTRAINTS}
另外：不得做定价计算（不要自行换算售价）；只解释上下文里已有的定价摘要。`;
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
