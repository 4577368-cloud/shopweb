import { classifyCommandInput } from "@/lib/agents/shared/command-client";
import {
  classifyLogisticsCommandByRules,
  type LogisticsCommandClassifyContext,
} from "@/lib/agents/logistics/classify-command";
import type { LogisticsCommandClassifyResult } from "@/lib/agents/logistics/command-schema";

export async function classifyLogisticsCommandInput(
  text: string,
  ctx?: LogisticsCommandClassifyContext | null
): Promise<LogisticsCommandClassifyResult> {
  return classifyCommandInput(text, {
    rulesClassify: classifyLogisticsCommandByRules,
    apiPath: "/api/agents/logistics/command",
    context: ctx ?? null,
  });
}
