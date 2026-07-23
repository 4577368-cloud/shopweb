import type { ChatMessage } from "@/lib/agents/llm/openai-compatible";
import { chatCompletionJson } from "@/lib/agents/llm/openai-compatible";
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  classifyByRules,
  DEFAULT_SHORT_INPUT_MAX,
  parseConstrainedIntentId,
  type ClassifyByRulesOptions,
} from "@/lib/agents/runtime/classify";
import { buildResponseLanguageRule } from "@/lib/agents/runtime/response-language";
import type {
  IntentClassifyResult,
  PageIntentDef,
} from "@/lib/agents/runtime/types";

export interface HybridClassifyOptions<TIntent extends string>
  extends ClassifyByRulesOptions<TIntent> {
  intents: PageIntentDef<TIntent>[];
  allowed: ReadonlySet<TIntent>;
  logPrefix?: string;
  llmTimeoutMs?: number;
  defaultClarify?: string;
  fallbackLocale?: string | null;
}

/**
 * Rules first → constrained LLM → clarify (never invents actions).
 * Server-only when LLM path runs.
 */
export async function classifyHybrid<TIntent extends string>(
  raw: string,
  opts: HybridClassifyOptions<TIntent>
): Promise<IntentClassifyResult<TIntent>> {
  const text = raw.trim().slice(0, opts.maxLength ?? DEFAULT_SHORT_INPUT_MAX);
  const byRules = classifyByRules(raw, opts);
  if (byRules.confidence === "high") return byRules;

  const responseLanguageRule = buildResponseLanguageRule(text, opts.fallbackLocale);

  try {
    const content = await chatCompletionJson({
      messages: [
        {
          role: "system",
          content: buildClassifySystemPrompt(
            opts.intents,
            opts.fallbackIntent,
            responseLanguageRule
          ),
        },
        {
          role: "user",
          content: buildClassifyUserPrompt(raw, opts.intents, opts.maxLength),
        },
      ] satisfies ChatMessage[],
      temperature: 0,
      timeoutMs: opts.llmTimeoutMs ?? 8_000,
    });
    const intent = parseConstrainedIntentId(content, opts.allowed);
    if (intent) {
      return { intent, confidence: "high", source: "llm" };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        opts.logPrefix ?? "[page-agent-classify]",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    intent: opts.fallbackIntent,
    confidence: "none",
    source: "default",
    clarify:
      byRules.clarify ??
      opts.defaultClarify ??
      "暂时无法理解该问题。请点击上方任务，或换个更短的说法。",
  };
}
