import { buildCopyResponseLanguageRule } from "@/lib/agents/runtime/response-language";
import type { AgentCopyFields } from "@/lib/agents/runtime/types";

export type { AgentCopyFields } from "@/lib/agents/runtime/types";

export function parseAgentCopyFields(raw: string): AgentCopyFields {
  const cleaned = stripCodeFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("无法解析 LLM JSON");
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM JSON 不是对象");
  }
  const obj = parsed as Record<string, unknown>;
  const summary = asNonEmptyString(obj.summary, 80);
  const explanation = asStringArray(obj.explanation, 1, 6, 200);
  const nextSteps = asStringArray(obj.nextSteps, 0, 4, 120);
  return { summary, explanation, nextSteps };
}

/** Shared JSON user payload for copy enrichment. */
export function buildCopyEnrichUserPayload(opts: {
  intent: string;
  agentId: string;
  context: unknown;
  fallback: AgentCopyFields;
  actionHint: Record<string, unknown>;
}): string {
  return JSON.stringify(
    {
      task: "根据 intent 与 pageContext，重写 summary / explanation / nextSteps 文案。",
      intent: opts.intent,
      agentId: opts.agentId,
      pageContext: opts.context,
      lockedActionHint: opts.actionHint,
      templateFallback: opts.fallback,
    },
    null,
    2
  );
}

export function buildCopyEnrichConstraints(opts?: {
  userText?: string;
  fallbackLocale?: string | null;
}): string {
  const languageRule =
    opts?.userText != null
      ? buildCopyResponseLanguageRule(opts.userText, opts.fallbackLocale)
      : "Write summary, explanation, and nextSteps in the same language as the user's message.";
  return `Hard constraints (must follow):
1. Only use facts and numbers from PageContext in the user message; do not invent data.
2. Do not output or rewrite action fields (suggestedAction / targetTab / openDrawer / highlightArea).
3. Do not claim configuration is done or pretend any action was executed.
4. When information is insufficient, use conservative wording; do not guess.
5. ${languageRule} Keep tone concise and actionable.
6. Output a single JSON object with only these fields:
   - summary: string (one-line headline, ≤80 chars)
   - explanation: string[] (2–5 bullets)
   - nextSteps: string[] (1–3 suggested next steps; do not pretend executed)
7. No markdown, code fences, or extra keys.`;
}

/** @deprecated use buildCopyEnrichConstraints */
export const COPY_ENRICH_CONSTRAINTS = buildCopyEnrichConstraints();

function stripCodeFence(s: string): string {
  const t = s.trim();
  if (!t.startsWith("```")) return t;
  return t
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function asNonEmptyString(v: unknown, max: number): string {
  if (typeof v !== "string" || !v.trim()) {
    throw new Error("summary 无效");
  }
  return v.trim().slice(0, max);
}

function asStringArray(
  v: unknown,
  min: number,
  maxItems: number,
  maxLen: number
): string[] {
  if (!Array.isArray(v)) throw new Error("数组字段无效");
  const items = v
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim().slice(0, maxLen))
    .slice(0, maxItems);
  if (items.length < min) throw new Error("数组条目过少");
  return items;
}
