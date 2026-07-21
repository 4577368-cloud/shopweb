export type { AgentResponse, AgentId, AgentSuggestedAction, AgentFilterPreset } from "@/lib/agents/types";

export type {
  BasePageContext,
  AgentCopyFields,
  AgentCopySource,
  IntentClassifyResult,
  PageIntentDef,
} from "@/lib/agents/runtime";

export {
  classifyByRules,
  classifyHybrid,
  resolveEnrichedAgentResponse,
  createTtlCache,
  assertCopyGrounded,
  DEFAULT_SHORT_INPUT_MAX,
} from "@/lib/agents/runtime";

export type { ProductsPageContext } from "@/lib/agents/products/page-context";
export { buildProductsPageContext } from "@/lib/agents/products/page-context";
export type { ProductsIntentId } from "@/lib/agents/products/intents";
export { PRODUCTS_INTENTS } from "@/lib/agents/products/intents";
export { routeProductsIntent } from "@/lib/agents/products/orchestrator";
export {
  fetchProductsAgentResponse,
  classifyProductsShortInput,
} from "@/lib/agents/products/client";
export {
  classifyProductsIntentByRules,
  PRODUCTS_SHORT_INPUT_MAX,
} from "@/lib/agents/products/classify-intent";
