import { classifyCommandInput } from "@/lib/agents/shared/command-client";
import {
  classifySkuCommandByRules,
  type SkuCommandClassifyContext,
} from "@/lib/agents/sku-align/classify-command";
import type { SkuCommandClassifyResult } from "@/lib/agents/sku-align/command-schema";

export async function classifySkuCommandInput(
  text: string,
  ctx?: SkuCommandClassifyContext | null,
  locale?: string | null
): Promise<SkuCommandClassifyResult> {
  return classifyCommandInput<SkuCommandClassifyResult>(text, {
    rulesClassify: classifySkuCommandByRules,
    apiPath: "/api/agents/sku-align/command",
    context: ctx ?? null,
    locale,
    priority: "llm-first",
  });
}
