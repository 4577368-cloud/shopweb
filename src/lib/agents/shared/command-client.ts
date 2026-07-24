import type { CommandClassifyResult } from "./command-plan";

/**
 * Command classify with a pluggable priority.
 * - "rule-first" (default): rules short-circuit, LLM is only a fallback. Keeps
 *   the historical behaviour for products / logistics rails.
 * - "llm-first": route to the model first so free-form natural language is
 *   understood; fall back to rules only when the LLM is unavailable or errors.
 *   Used by the sku-align rail to raise natural-language capability.
 * Shared by products / logistics / sku-align command rails.
 */
export async function classifyCommandInput<
  TResult extends CommandClassifyResult,
>(
  text: string,
  opts: {
    maxLength?: number;
    rulesClassify: (clipped: string) => TResult;
    apiPath: string;
    context?: unknown;
    locale?: string | null;
    priority?: "rule-first" | "llm-first";
  }
): Promise<TResult> {
  const clipped = text.trim().slice(0, opts.maxLength ?? 200);
  const local = opts.rulesClassify(clipped);

  const callApi = async (): Promise<TResult | null> => {
    try {
      const res = await fetch(opts.apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clipped,
          context: opts.context ?? null,
          locale: opts.locale ?? null,
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as TResult;
    } catch {
      return null;
    }
  };

  if (opts.priority === "llm-first") {
    const data = await callApi();
    const hasResult =
      !!data &&
      ((data.confidence === "high" &&
        (data.draft ||
          ((data as { steps?: unknown[] }).steps?.length ?? 0) > 0)) ||
        (data as { clarify?: unknown }).clarify);
    if (hasResult) return data;
    return local;
  }

  if (local.confidence === "high" && local.draft) return local;

  const data = await callApi();
  if (!data) return local;
  if (data?.confidence === "high" && data.draft) return data;
  return data?.clarify ? data : local;
}
