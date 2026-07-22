import type { ChatMessage } from "@/lib/agents/llm/openai-compatible";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import {
  buildCommandClassifySystemPrompt,
  classifyProductCommandByRules,
  parseProductCommandDraft,
  type CommandClassifyContext,
} from "@/lib/agents/products/classify-command";
import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import type {
  ProductCommandClassifyResult,
  ProductCommandDraft,
} from "@/lib/agents/products/command-schema";
import { parseTargetLangFromText } from "@/lib/translate/lang-codes";

function coerceProductCommandDraft(
  text: string,
  draft: ProductCommandDraft
): ProductCommandDraft {
  let next = draft;
  const batch =
    /(所有|全部|批量|每个|所有商品|全部商品|批量商品|一次性|统一|统统|全部改成|全部换成|给所有|都给|每个商品|都改|统一改|都改掉|全部改)/i.test(
      text
    );

  if (batch && next.intent === "update_product_copy") {
    next = {
      ...next,
      intent: "batch_update_product_copy",
      targetScope: "all",
      params: {
        ...next.params,
        batchFilter: next.params.batchFilter ?? "all",
      },
    };
  }

  if (
    (next.intent === "update_product_copy" ||
      next.intent === "batch_update_product_copy") &&
    (next.params.copyAction ?? "translate") === "translate" &&
    !next.params.copyTargetLang
  ) {
    const lang = parseTargetLangFromText(text);
    if (lang) {
      next = { ...next, params: { ...next.params, copyTargetLang: lang } };
    }
  }

  return next;
}

/**
 * Hybrid command classify — rules for unambiguous ops, LLM for write ops & ambiguous input.
 * Server-only when LLM runs.
 */
export async function classifyProductCommand(
  raw: string,
  ctx?: CommandClassifyContext | null
): Promise<ProductCommandClassifyResult> {
  const text = raw.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX);
  const byRules = classifyProductCommandByRules(text);
  if (byRules.confidence === "high" && byRules.draft) {
    return { ...byRules, draft: coerceProductCommandDraft(text, byRules.draft) };
  }

  try {
    const content = await chatCompletionJson({
      messages: [
        { role: "system", content: buildCommandClassifySystemPrompt(ctx) },
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
      return {
        confidence: "high",
        source: "llm",
        draft: coerceProductCommandDraft(text, draft),
      };
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
      "未识别为页面命令。可试试：只看待确认 / 给这个商品再找候选 / 翻译这个商品标题 / 把售价改成 9.9 美元。",
  };
}
