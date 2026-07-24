import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  classifyProductCommandByRules,
  type CommandClassifyContext,
} from "@/lib/agents/products/classify-command";
import { classifyCommandInput } from "@/lib/agents/shared/command-client";
import type { ProductCommandClassifyResult } from "@/lib/agents/products/command-schema";

/**
 * Client: rule classify first, then server LLM structured command JSON.
 */
export async function classifyProductCommandInput(
  text: string,
  ctx?: CommandClassifyContext | null,
  locale?: string | null
): Promise<ProductCommandClassifyResult> {
  return classifyCommandInput(text, {
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    rulesClassify: classifyProductCommandByRules,
    apiPath: "/api/agents/products/command",
    context: ctx ?? null,
    locale,
    priority: "llm-first",
  });
}
