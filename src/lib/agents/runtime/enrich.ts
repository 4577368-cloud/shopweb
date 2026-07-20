import type { AgentResponse } from "@/lib/agents/types";
import {
  chatCompletionJson,
  LlmUnavailableError,
} from "@/lib/agents/llm/openai-compatible";
import {
  buildCopyEnrichUserPayload,
  parseAgentCopyFields,
} from "@/lib/agents/runtime/copy-parse";
import { assertCopyGrounded } from "@/lib/agents/runtime/fact-check";
import { cacheKey, type TtlCache } from "@/lib/agents/runtime/cache";
import type {
  AgentCopyFields,
  AgentCopySource,
} from "@/lib/agents/runtime/types";

export interface EnrichedAgentResponse extends AgentResponse {
  copySource: AgentCopySource;
}

export interface EnrichPipelineOptions<TIntent extends string, TContext> {
  pageKey: string;
  intent: TIntent;
  context: TContext;
  /** Deterministic rule skeleton (owns actions) */
  route: (intent: TIntent, context: TContext) => AgentResponse;
  /** Context fingerprint for cache */
  fingerprint: (context: TContext) => string;
  buildSystemPrompt: (base: AgentResponse) => string;
  /** Optional page-specific user prompt; default uses shared payload builder */
  buildUserPrompt?: (
    intent: TIntent,
    context: TContext,
    base: AgentResponse,
    fallback: AgentCopyFields
  ) => string;
  /** Enable number grounding; supply tokens from page context */
  factCheck?: {
    enabled: boolean;
    allowedTokens: (context: TContext) => Iterable<string | number | null | undefined>;
    harvestText?: (context: TContext) => string[];
  };
  /** Optional TTL cache — only successful LLM results should be stored by caller policy */
  cache?: TtlCache<EnrichedAgentResponse>;
  logPrefix?: string;
  llmTimeoutMs?: number;
  temperature?: number;
}

/**
 * Shared enrich pipeline: route → (cache) → LLM copy → fact-check → merge.
 * Action fields always come from `route`. Failures fall back to template copy.
 */
export async function resolveEnrichedAgentResponse<
  TIntent extends string,
  TContext,
>(
  opts: EnrichPipelineOptions<TIntent, TContext>
): Promise<EnrichedAgentResponse> {
  const fp = opts.fingerprint(opts.context);
  const key = cacheKey(opts.pageKey, opts.intent, fp);
  const cached = opts.cache?.get(key);
  if (cached) return cached;

  const base = opts.route(opts.intent, opts.context);

  try {
    const copy = await generateCopy(opts, base);
    if (opts.factCheck?.enabled) {
      assertCopyGrounded(copy, {
        allowedTokens: opts.factCheck.allowedTokens(opts.context),
        harvestText: opts.factCheck.harvestText?.(opts.context),
      });
    }
    const enriched: EnrichedAgentResponse = {
      ...base,
      summary: copy.summary,
      explanation: copy.explanation,
      nextSteps: copy.nextSteps,
      copySource: "llm",
    };
    opts.cache?.set(key, enriched);
    return enriched;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        opts.logPrefix ?? "[page-agent-copy]",
        err instanceof Error ? err.message : err
      );
    }
    return { ...base, copySource: "template" };
  }
}

async function generateCopy<TIntent extends string, TContext>(
  opts: EnrichPipelineOptions<TIntent, TContext>,
  base: AgentResponse
): Promise<AgentCopyFields> {
  const fallback: AgentCopyFields = {
    summary: base.summary,
    explanation: base.explanation,
    nextSteps: base.nextSteps,
  };

  const userContent =
    opts.buildUserPrompt?.(opts.intent, opts.context, base, fallback) ??
    buildCopyEnrichUserPayload({
      intent: opts.intent,
      agentId: base.agentId,
      context: opts.context,
      fallback,
      actionHint: {
        suggestedActionLabel: base.suggestedAction.label,
        openDrawer: base.openDrawer ?? null,
        targetTab: base.targetTab ?? null,
      },
    });

  const raw = await chatCompletionJson({
    messages: [
      { role: "system", content: opts.buildSystemPrompt(base) },
      { role: "user", content: userContent },
    ],
    temperature: opts.temperature ?? 0.35,
    timeoutMs: opts.llmTimeoutMs ?? 18_000,
  });

  try {
    return parseAgentCopyFields(raw);
  } catch (err) {
    throw new LlmUnavailableError(
      err instanceof Error ? err.message : "LLM 文案校验失败"
    );
  }
}
