import type { CommandClassifyResult } from "./command-plan";

/**
 * Rules-first command classify with optional LLM fallback via page API.
 * Used by products / logistics / sku-align command rails.
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
  }
): Promise<TResult> {
  const clipped = text.trim().slice(0, opts.maxLength ?? 200);
  const local = opts.rulesClassify(clipped);
  if (local.confidence === "high" && local.draft) return local;

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
    if (!res.ok) return local;
    const data = (await res.json()) as TResult;
    if (data?.confidence === "high" && data.draft) return data;
    return data?.clarify ? data : local;
  } catch {
    return local;
  }
}
