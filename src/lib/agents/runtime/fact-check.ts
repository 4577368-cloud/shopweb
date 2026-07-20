import type { AgentCopyFields } from "@/lib/agents/runtime/types";

export interface FactCheckOptions {
  /** Tokens (numbers / codes) allowed to appear in copy */
  allowedTokens: Iterable<string | number | null | undefined>;
  /** Extra free-text to harvest digits/codes from (summary lines, etc.) */
  harvestText?: string[];
  exemptNumbers?: ReadonlySet<string>;
}

const DEFAULT_EXEMPT = new Set(["0", "1", "2", "3"]);

/**
 * Light fact check: numbers in LLM copy must appear in allowed tokens.
 * Page packs supply tokens from their PageContext — not hard-coded here.
 */
export function assertCopyGrounded(
  copy: AgentCopyFields,
  opts: FactCheckOptions
): void {
  const allowed = new Set<string>();
  const add = (v: string | number | null | undefined) => {
    if (v == null) return;
    const s = String(v);
    allowed.add(s);
    if (s.includes(".")) allowed.add(s.split(".")[0]!);
  };

  for (const t of opts.allowedTokens) add(t);

  const hay = (opts.harvestText ?? []).join(" ");
  for (const m of hay.match(/\d+(?:\.\d+)?/g) ?? []) allowed.add(m);
  for (const m of hay.match(/[A-Z]{3}/g) ?? []) allowed.add(m);

  const exempt = opts.exemptNumbers ?? DEFAULT_EXEMPT;
  const blob = [copy.summary, ...copy.explanation, ...copy.nextSteps].join(
    "\n"
  );
  const numbers = blob.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of numbers) {
    if (exempt.has(n)) continue;
    if (!allowed.has(n)) {
      throw new Error(`文案含未在 context 中的数字：${n}`);
    }
  }
}

/** Collect numeric/string tokens from a plain object (shallow + nested one level). */
export function collectTokensFromUnknown(
  value: unknown,
  into: Set<string> = new Set()
): Set<string> {
  if (value == null) return into;
  if (typeof value === "number" || typeof value === "string") {
    into.add(String(value));
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTokensFromUnknown(item, into);
    return into;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (
        typeof v === "number" ||
        typeof v === "string" ||
        Array.isArray(v) ||
        (v != null && typeof v === "object")
      ) {
        collectTokensFromUnknown(v, into);
      }
    }
  }
  return into;
}
