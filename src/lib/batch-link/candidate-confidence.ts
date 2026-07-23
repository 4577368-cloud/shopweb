import { normalizeMatchScore } from "@/lib/agents/products/match-rank";
import {
  classifyMatchConfidence,
  type MatchConfidenceTier,
} from "@/lib/batch-link/confidence";
import {
  candidateStorageKey,
  effectiveAutoBindTitleScore,
} from "@/lib/batch-link/image-match";
import type { ImageSearchProduct } from "@/lib/types";

export interface CandidateConfidence {
  tier: MatchConfidenceTier;
  titleScore: number | null;
  imageScore: number | null;
  effectiveScore: number | null;
}

export function resolveCandidateConfidence(
  candidate: ImageSearchProduct,
  titleScores: Record<string, number>,
  imageScores: Record<string, number | null>
): CandidateConfidence {
  const key = candidateStorageKey(candidate);
  const titleScore =
    titleScores[key] ?? normalizeMatchScore(candidate.similarityScore) ?? null;
  const imageScore = imageScores[key] ?? null;
  const effectiveScore = effectiveAutoBindTitleScore(titleScore, imageScore);
  return {
    tier: classifyMatchConfidence(effectiveScore),
    titleScore,
    imageScore,
    effectiveScore,
  };
}

/** High-tier batch auto-bind may pool ingest without an extra supplier card. */
export function allowPoolIngestOnConfirm(input: {
  tier: MatchConfidenceTier;
  auto?: boolean;
  catalogSource?: boolean;
  explicitAllow?: boolean;
}): boolean {
  if (input.catalogSource) return false;
  if (input.explicitAllow) return true;
  if (input.auto) return input.tier === "high";
  return input.tier === "high";
}

export function requiresSupplierConfirmBeforePool(
  tier: MatchConfidenceTier,
  catalogSource?: boolean
): boolean {
  if (catalogSource) return false;
  return tier === "medium" || tier === "low";
}
