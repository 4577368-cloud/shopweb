import { classifyCommandInput } from "@/lib/agents/shared/command-client";
import {
  classifySkuCommandByRules,
  type SkuCommandClassifyContext,
} from "@/lib/agents/sku-align/classify-command";
import type { SkuCommandClassifyResult } from "@/lib/agents/sku-align/command-schema";

export async function classifySkuCommandInput(
  text: string,
  ctx?: SkuCommandClassifyContext | null
): Promise<SkuCommandClassifyResult> {
  return classifyCommandInput(text, {
    rulesClassify: classifySkuCommandByRules,
    apiPath: "/api/agents/sku-align/command",
    context: ctx ?? null,
  });
}
