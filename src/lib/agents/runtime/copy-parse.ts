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

export const COPY_ENRICH_CONSTRAINTS = `硬性约束（必须遵守）：
1. 只能使用用户消息里提供的 PageContext 中的事实与数字；不得编造不存在的数据。
2. 不得输出或改写任何执行动作字段（suggestedAction / targetTab / openDrawer / highlightArea）。
3. 不得声称已完成配置或假装执行了任何操作。
4. 信息不足时用保守表述，不要猜测。
5. 语气简洁、可执行、中文。
6. 只输出一个 JSON 对象，字段仅限：
   - summary: string（一句话标题，≤40字）
   - explanation: string[]（2～5 条解释）
   - nextSteps: string[]（1～3 条下一步文案，只描述建议，不假装已执行）
7. 不要输出 markdown、代码块或其它键。`;

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
