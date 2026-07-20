import type { AgentResponse } from "@/lib/agents/types";
import type {
  AgentCopySource,
  IntentClassifyResult,
} from "@/lib/agents/runtime/types";

export interface ClientAgentResponse extends AgentResponse {
  copySource?: AgentCopySource;
}

/**
 * Generic client fetch for page copy API with local template fallback.
 */
export async function fetchPageAgentCopy<TIntent extends string, TContext>(opts: {
  endpoint: string;
  intent: TIntent;
  context: TContext;
  fallback: (intent: TIntent, context: TContext) => AgentResponse;
}): Promise<ClientAgentResponse> {
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: opts.intent, context: opts.context }),
    });
    if (!res.ok) {
      return { ...opts.fallback(opts.intent, opts.context), copySource: "template" };
    }
    const data = (await res.json()) as ClientAgentResponse;
    if (
      typeof data?.summary !== "string" ||
      !Array.isArray(data.explanation) ||
      !Array.isArray(data.nextSteps) ||
      !data.suggestedAction
    ) {
      return { ...opts.fallback(opts.intent, opts.context), copySource: "template" };
    }
    return data;
  } catch {
    return { ...opts.fallback(opts.intent, opts.context), copySource: "template" };
  }
}

/**
 * Client classify: local rules first; on miss hit page classify API.
 */
export async function classifyPageShortInput<TIntent extends string>(opts: {
  text: string;
  maxLength: number;
  classifyLocal: (text: string) => IntentClassifyResult<TIntent>;
  classifyEndpoint: string;
}): Promise<IntentClassifyResult<TIntent>> {
  const clipped = opts.text.trim().slice(0, opts.maxLength);
  const local = opts.classifyLocal(clipped);
  if (local.confidence === "high") return local;

  try {
    const res = await fetch(opts.classifyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clipped }),
    });
    if (!res.ok) return local;
    const data = (await res.json()) as IntentClassifyResult<TIntent>;
    if (!data?.intent) return local;
    return data;
  } catch {
    return local;
  }
}
