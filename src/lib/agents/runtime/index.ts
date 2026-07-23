export type {
  BasePageContext,
  AgentCopyFields,
  AgentCopySource,
  IntentClassifyResult,
  IntentClassifySource,
  PageIntentDef,
  IntentKeywordRule,
} from "@/lib/agents/runtime/types";

export {
  classifyByRules,
  parseConstrainedIntentId,
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  DEFAULT_SHORT_INPUT_MAX,
} from "@/lib/agents/runtime/classify";

export { classifyHybrid } from "@/lib/agents/runtime/classify-hybrid";

export {
  parseAgentCopyFields,
  buildCopyEnrichUserPayload,
  buildCopyEnrichConstraints,
  COPY_ENRICH_CONSTRAINTS,
} from "@/lib/agents/runtime/copy-parse";

export {
  buildResponseLanguageRule,
  buildCopyResponseLanguageRule,
  detectResponseLanguage,
  responseLanguageName,
} from "@/lib/agents/runtime/response-language";

export {
  assertCopyGrounded,
  collectTokensFromUnknown,
} from "@/lib/agents/runtime/fact-check";

export { createTtlCache, cacheKey } from "@/lib/agents/runtime/cache";

export {
  resolveEnrichedAgentResponse,
  type EnrichedAgentResponse,
  type EnrichPipelineOptions,
} from "@/lib/agents/runtime/enrich";

export {
  fetchPageAgentCopy,
  classifyPageShortInput,
  type ClientAgentResponse,
} from "@/lib/agents/runtime/client";
