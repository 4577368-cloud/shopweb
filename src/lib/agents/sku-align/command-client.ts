import { classifyCommandInput } from "@/lib/agents/shared/command-client";
import {
  classifySkuCommandByRules,
  type SkuCommandClassifyContext,
} from "@/lib/agents/sku-align/classify-command";
import type { SkuCommandClassifyResult } from "@/lib/agents/sku-align/command-schema";
import type { TranslateFn } from "@/i18n/server";

export async function classifySkuCommandInput(
  text: string,
  ctx?: SkuCommandClassifyContext | null,
  locale?: string | null,
  t?: TranslateFn
): Promise<SkuCommandClassifyResult> {
  return classifyCommandInput<SkuCommandClassifyResult>(text, {
    rulesClassify: (clipped) => classifySkuCommandByRules(clipped, t),
    apiPath: "/api/agents/sku-align/command",
    context: ctx ?? null,
    locale,
    priority: "llm-first",
  });
}
