import type { MatchConfidenceTier } from "@/lib/batch-link/confidence";
import type { BatchLinkCardDrive, BatchLinkCardState } from "@/lib/batch-link/types";

export type BatchLinkTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

const CONFIDENCE_TIER_KEYS: Record<MatchConfidenceTier, string> = {
  high: "batchLink.confidenceHigh",
  medium: "batchLink.confidenceMedium",
  low: "batchLink.confidenceLow",
  none: "batchLink.confidenceNone",
};

const BATCH_STATE_KEYS: Record<BatchLinkCardState, string> = {
  idle: "batchLink.stateIdle",
  queued: "batchLink.stateQueued",
  searching: "batchLink.stateSearching",
  candidates_ready: "batchLink.stateCandidatesReady",
  auto_selecting: "batchLink.stateAutoSelecting",
  binding: "batchLink.stateBinding",
  done: "batchLink.stateDone",
  failed: "batchLink.stateFailed",
  needs_review: "batchLink.stateNeedsReview",
};

export function confidenceTierLabel(
  tier: MatchConfidenceTier,
  t: BatchLinkTranslate
): string {
  return t(CONFIDENCE_TIER_KEYS[tier]);
}

export function batchCardStateLabel(
  state: BatchLinkCardState,
  t: BatchLinkTranslate
): string {
  return t(BATCH_STATE_KEYS[state]);
}

export function formatConfidenceScores(
  t: BatchLinkTranslate,
  input: {
    titleScore?: number | null;
    imageScore?: number | null;
    tier?: MatchConfidenceTier | null;
  }
): string {
  const parts: string[] = [];
  if (input.titleScore != null && input.titleScore > 0) {
    parts.push(t("batchLink.titleScore", { score: Math.round(input.titleScore) }));
  }
  if (input.imageScore != null && input.imageScore > 0) {
    parts.push(t("batchLink.imageScore", { score: Math.round(input.imageScore) }));
  }
  if (input.tier) {
    parts.push(confidenceTierLabel(input.tier, t));
  }
  return parts.join(" · ") || "—";
}

export function formatBatchCardQueueLine(
  t: BatchLinkTranslate,
  drive: BatchLinkCardDrive
): string {
  const stateLabel = batchCardStateLabel(drive.state, t);
  const scores = formatConfidenceScores(t, {
    titleScore: drive.titleScore,
    imageScore: drive.imageScore,
    tier: drive.confidenceTier,
  });
  if (drive.state === "failed" && drive.errorMessage?.trim()) {
    return `${stateLabel} · ${scores} · ${drive.errorMessage.trim()}`;
  }
  return scores !== "—" ? `${stateLabel} · ${scores}` : stateLabel;
}
