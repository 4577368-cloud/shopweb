/** Shared command plan shape — all page command rails render this. */
export type CommandSensitivity = "high" | "low";

export interface BaseCommandPlan {
  operation: string;
  targetLabel: string;
  detailLines: string[];
  executable: boolean;
  clarify?: string;
  draft: {
    intent: string;
    confirmationRequired?: boolean;
  };
}

export interface CommandClassifyResult<TDraft = unknown> {
  confidence: "high" | "low" | "none";
  source?: string;
  draft?: TDraft;
  /** Plain string for simple rules; sku-align also returns a structured object. */
  clarify?: unknown;
}
