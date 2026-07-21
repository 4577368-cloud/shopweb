import type { ChatMessage } from "@/lib/agents/llm/openai-compatible";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import {
  buildCommandClassifySystemPrompt,
  classifyProductCommandByRules,
  parseProductCommandDraft,
} from "@/lib/agents/products/classify-command";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import type { ProductCommandClassifyResult } from "@/lib/agents/products/command-schema";

/**
 * Hybrid command classify — rules first, structured LLM JSON fallback.
 * Server-only when LLM runs.
 */
export async function classifyProductCommand(
  raw: string
): Promise<ProductCommandClassifyResult> {
  const text = raw.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX);
  const byRules = classifyProductCommandByRules(text);
  if (byRules.confidence === "high" && byRules.draft) return byRules;

  try {
    const content = await chatCompletionJson({
      messages: [
        { role: "system", content: buildCommandClassifySystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({ userText: text }),
        },
      ] satisfies ChatMessage[],
      temperature: 0,
      timeoutMs: 8_000,
    });
    const draft = parseProductCommandDraft(content);
    if (draft) {
      return { confidence: "high", source: "llm", draft };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[products-command-classify]",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    confidence: "none",
    source: "default",
    clarify:
      byRules.clarify ??
      "未识别为页面命令。可试试：只看待确认 / 给这个商品再找候选 / 把售价改成 9.9 美元。",
  };
}
