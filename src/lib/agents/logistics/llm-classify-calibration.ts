import type {
  LogisticsCommandClassifyResult,
  LogisticsCommandDraft,
  LogisticsDecisionStatus,
} from "./command-schema";
import type { LogisticsCommandClassifyContext } from "./classify-command";

const VALID_STATUS = new Set<LogisticsDecisionStatus>([
  "pending_sku",
  "pending_postal_meta",
  "ready_for_quote",
  "confirmed",
  "restricted",
  "needs_review",
]);

/** Normalize LLM draft and enforce safety invariants before planning. */
export function normalizeLogisticsCommandDraft(
  draft: LogisticsCommandDraft
): LogisticsCommandDraft {
  const params = { ...draft.params };
  if (params.status && !VALID_STATUS.has(params.status)) {
    delete params.status;
  }
  const confirmationRequired =
    draft.intent === "accept_all_ready" ? true : draft.confirmationRequired;
  return {
    ...draft,
    params,
    confirmationRequired,
  };
}

/**
 * LLM parse success ≠ high confidence. Align with rules or keep medium for confirmation.
 */
export function calibrateLogisticsLlmConfidence(
  text: string,
  draft: LogisticsCommandDraft,
  rules: LogisticsCommandClassifyResult,
  context: LogisticsCommandClassifyContext | null
): "high" | "medium" | "none" {
  const trimmed = text.trim();
  if (!trimmed) return "none";

  const normalized = normalizeLogisticsCommandDraft(draft);

  if (rules.confidence === "high" && rules.draft?.intent === normalized.intent) {
    return "high";
  }

  if (
    rules.confidence === "high" &&
    rules.draft &&
    rules.draft.intent !== normalized.intent
  ) {
    return "medium";
  }

  if (normalized.intent === "explain_quote") {
    const hint =
      normalized.params.productTitleHint?.trim() ||
      normalized.productId?.trim() ||
      context?.focusProductTitle?.trim();
    if (!hint) return "medium";
    if (rules.draft?.intent === "explain_quote") return "high";
    return "medium";
  }

  if (normalized.intent === "accept_all_ready") {
    return "medium";
  }

  if (trimmed.length < 5) return "medium";

  return "medium";
}
