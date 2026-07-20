/**
 * Page-agent runtime — shared protocols for constrained task dialogue.
 * Page packs (products / logistics / …) supply intents, context, handlers.
 * Do not put page business rules here.
 */

/** Minimal convention every page context should satisfy. */
export interface BasePageContext {
  /** Stable page key, e.g. "products" | "logistics" | "sync" */
  page: string;
  authorized: boolean;
  shopName: string;
}

export type AgentCopySource = "llm" | "template";

/** Copy-only fields LLM may rewrite; actions stay rule-owned. */
export interface AgentCopyFields {
  summary: string;
  explanation: string[];
  nextSteps: string[];
}

export type IntentClassifySource = "rules" | "llm" | "default";

export interface IntentClassifyResult<TIntent extends string = string> {
  intent: TIntent;
  confidence: "high" | "low" | "none";
  source: IntentClassifySource;
  clarify?: string;
}

export interface PageIntentDef<TIntent extends string = string> {
  id: TIntent;
  label: string;
  description: string;
  /** Page-local agent id string */
  agent: string;
}

export interface IntentKeywordRule<TIntent extends string = string> {
  intent: TIntent;
  patterns: RegExp[];
}
