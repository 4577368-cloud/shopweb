import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import {
  classifyProductCommandByRules,
} from "@/lib/agents/products/classify-command";
import type { ProductCommandClassifyResult } from "@/lib/agents/products/command-schema";

/**
 * Client: rule classify first, then server LLM structured command JSON.
 */
export async function classifyProductCommandInput(
  text: string
): Promise<ProductCommandClassifyResult> {
  const clipped = text.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX);
  const local = classifyProductCommandByRules(clipped);
  if (local.confidence === "high" && local.draft) return local;

  try {
    const res = await fetch("/api/agents/products/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clipped }),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as ProductCommandClassifyResult;
    if (data?.confidence === "high" && data.draft) return data;
    return data?.clarify ? data : local;
  } catch {
    return local;
  }
}
