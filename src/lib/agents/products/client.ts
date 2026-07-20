import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { routeProductsIntent } from "@/lib/agents/products/orchestrator";
import { classifyProductsIntentByRules, PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  classifyPageShortInput,
  fetchPageAgentCopy,
  type ClientAgentResponse,
} from "@/lib/agents/runtime";

export type { ClientAgentResponse };

/**
 * Client entry: ask the server to enrich copy via LLM (keys stay server-side).
 */
export async function fetchProductsAgentResponse(
  intent: ProductsIntentId,
  context: ProductsPageContext
): Promise<ClientAgentResponse> {
  return fetchPageAgentCopy({
    endpoint: "/api/agents/products/copy",
    intent,
    context,
    fallback: routeProductsIntent,
  });
}

/**
 * Map short NL input → fixed products intent.
 */
export async function classifyProductsShortInput(text: string) {
  return classifyPageShortInput({
    text,
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    classifyLocal: classifyProductsIntentByRules,
    classifyEndpoint: "/api/agents/products/classify",
  });
}
