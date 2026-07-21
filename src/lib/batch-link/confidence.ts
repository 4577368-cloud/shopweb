import {
  HIGH_MATCH_THRESHOLD,
  MEDIUM_MATCH_THRESHOLD,
} from "@/data/mock";

export type MatchConfidenceTier = "high" | "medium" | "low" | "none";

export function classifyMatchConfidence(
  score: number | null | undefined
): MatchConfidenceTier {
  if (score == null || Number.isNaN(score)) return "none";
  if (score >= HIGH_MATCH_THRESHOLD) return "high";
  if (score >= MEDIUM_MATCH_THRESHOLD) return "medium";
  return "low";
}
