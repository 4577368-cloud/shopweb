import { createTtlCache } from "@/lib/agents/runtime";
import type { EnrichedAgentResponse } from "@/lib/agents/runtime";

/** Products-scoped copy cache (LLM successes only). */
export const productsCopyCache = createTtlCache<EnrichedAgentResponse>({
  ttlMs: 60_000,
  maxEntries: 80,
});
