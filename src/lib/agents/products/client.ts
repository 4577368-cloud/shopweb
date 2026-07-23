import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { routeProductsIntent } from "@/lib/agents/products/orchestrator";
import { classifyProductsIntentByRules, PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  classifyPageShortInput,
  fetchPageAgentCopy,
  type ClientAgentResponse,
} from "@/lib/agents/runtime";
import { createTranslator } from "@/i18n/server";

export type { ClientAgentResponse };

/**
 * Client entry: ask the server to enrich copy via LLM (keys stay server-side).
 */
export async function fetchProductsAgentResponse(
  intent: ProductsIntentId,
  context: ProductsPageContext,
  opts?: { userText?: string; locale?: string | null }
): Promise<ClientAgentResponse> {
  const t = createTranslator(opts?.locale);
  return fetchPageAgentCopy({
    endpoint: "/api/agents/products/copy",
    intent,
    context,
    fallback: (id, ctx) => routeProductsIntent(id, ctx, t),
    userText: opts?.userText,
    locale: opts?.locale,
  });
}

/**
 * Map short NL input → fixed products intent.
 */
export async function classifyProductsShortInput(
  text: string,
  locale?: string | null
) {
  return classifyPageShortInput({
    text,
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    classifyLocal: classifyProductsIntentByRules,
    classifyEndpoint: "/api/agents/products/classify",
    locale,
  });
}
