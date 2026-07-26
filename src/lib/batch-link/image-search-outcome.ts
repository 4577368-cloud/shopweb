import { classifyMatchConfidence } from "@/lib/batch-link/confidence";
import type { ImageSearchPipelineResult } from "@/lib/batch-link/image-search-pipeline";
import {
  candidateStorageKey,
  isImageScorePending,
  passesImageRecommendGate,
} from "@/lib/batch-link/image-match";

/** Whether image-search results are safe to present as a strong recommendation. */
export type ImageSearchReliability = "reliable" | "weak" | "failed";

export function assessImageSearchReliability(
  pipeline: Pick<
    ImageSearchPipelineResult,
    "error" | "rankedItems" | "topScore" | "imageScores"
  >
): ImageSearchReliability {
  if (pipeline.error?.trim()) return "failed";
  if (!pipeline.rankedItems.length) return "failed";

  const top = pipeline.rankedItems[0];
  if (!top) return "failed";

  if (classifyMatchConfidence(pipeline.topScore) === "none") return "weak";

  const topImage = pipeline.imageScores[candidateStorageKey(top)];
  if (!isImageScorePending(topImage) && !passesImageRecommendGate(topImage)) {
    return "weak";
  }

  return "reliable";
}

export function shouldPromptAccountManagerForImageSearch(
  pipeline: Pick<
    ImageSearchPipelineResult,
    "error" | "rankedItems" | "topScore" | "imageScores"
  > | null,
  opts?: { treatEmptyAsFailed?: boolean }
): boolean {
  if (!pipeline) return Boolean(opts?.treatEmptyAsFailed);
  const reliability = assessImageSearchReliability(pipeline);
  return reliability === "failed" || reliability === "weak";
}
