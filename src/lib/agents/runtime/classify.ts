import type {
  IntentClassifyResult,
  IntentKeywordRule,
  PageIntentDef,
} from "@/lib/agents/runtime/types";

export const DEFAULT_SHORT_INPUT_MAX = 80;

export interface ClassifyByRulesOptions<TIntent extends string> {
  maxLength?: number;
  rules: IntentKeywordRule<TIntent>[];
  /** Used when confidence is none (placeholder only — do not auto-run) */
  fallbackIntent: TIntent;
  emptyClarify: string;
  missClarify: string;
}

/**
 * Rule-only classify. Safe on client or server.
 * Order of rules matters — put more specific patterns first.
 */
export function classifyByRules<TIntent extends string>(
  raw: string,
  opts: ClassifyByRulesOptions<TIntent>
): IntentClassifyResult<TIntent> {
  const max = opts.maxLength ?? DEFAULT_SHORT_INPUT_MAX;
  const text = raw.trim().slice(0, max);
  if (!text) {
    return {
      intent: opts.fallbackIntent,
      confidence: "none",
      source: "rules",
      clarify: opts.emptyClarify,
    };
  }

  for (const rule of opts.rules) {
    if (rule.patterns.some((p) => p.test(text))) {
      return { intent: rule.intent, confidence: "high", source: "rules" };
    }
  }

  return {
    intent: opts.fallbackIntent,
    confidence: "none",
    source: "rules",
    clarify: opts.missClarify,
  };
}

export function isIntentId<TIntent extends string>(
  v: unknown,
  allowed: ReadonlySet<TIntent>
): v is TIntent {
  return typeof v === "string" && allowed.has(v as TIntent);
}

/** Parse LLM classify output into a constrained intent id. */
export function parseConstrainedIntentId<TIntent extends string>(
  raw: string,
  allowed: ReadonlySet<TIntent>
): TIntent | null {
  const cleaned = raw.trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const json =
      start >= 0 && end > start
        ? cleaned.slice(start, end + 1)
        : cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const obj = JSON.parse(json) as { intent?: unknown };
    if (isIntentId(obj.intent, allowed)) return obj.intent;
  } catch {
    // fall through
  }
  const bare = cleaned.replace(/["'`]/g, "").trim();
  if (isIntentId(bare, allowed)) return bare;
  return null;
}

export function buildClassifySystemPrompt<TIntent extends string>(
  intents: PageIntentDef<TIntent>[],
  fallbackIntent: TIntent,
  responseLanguageRule?: string
): string {
  const ids = intents.map((i) => i.id).join(" | ");
  const langBlock = responseLanguageRule
    ? `\n${responseLanguageRule}\n`
    : "\nUnderstand user input in any language.\n";
  return `You are an intent classifier. Map the user's short message to exactly one of these intents:
${ids}

Rules:
1. Output JSON only: {"intent":"<id>"}
2. intent must be one of the enum values above — no other values
3. Do not output actions, explanations, or suggestedAction
4. If unsure, output {"intent":"${fallbackIntent}"}${langBlock}`;
}

export function buildClassifyUserPrompt<TIntent extends string>(
  text: string,
  intents: PageIntentDef<TIntent>[],
  maxLength = DEFAULT_SHORT_INPUT_MAX
): string {
  return JSON.stringify({
    userText: text.slice(0, maxLength),
    intents: intents.map((i) => ({
      id: i.id,
      label: i.label,
      description: i.description,
    })),
  });
}
