import { api } from "@/lib/api";
import {
  normalizeMatchScore,
  rankCandidates,
} from "@/lib/agents/products/match-rank";
import type {
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

export interface ImageSearchPipelineResult {
  result: ImageSearchResult | null;
  matchScores: Record<string, number>;
  rankedItems: ImageSearchProduct[];
  topScore: number | null;
  error: string | null;
}

function imageSearchError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "图搜失败，请稍后重试";
}

/** Shared image-search + LLM score + rank pipeline (same as single-card「查找候选」). */
export async function runImageSearchPipeline(
  shopName: string,
  item: Pick<ShopMirrorProduct, "thirdPlatformItemId" | "title" | "primaryImageUrl">,
  limit = 5
): Promise<ImageSearchPipelineResult> {
  try {
    const res = await api.imageSearch(shopName, item.thirdPlatformItemId, limit);
    let scores: Record<string, number> = {};
    for (const c of res.items) {
      const n = normalizeMatchScore(c.similarityScore);
      if (n != null) scores[c.productId] = n;
    }
    const needLlm = res.items.filter((c) => scores[c.productId] == null);
    if (needLlm.length > 0) {
      try {
        const scoreRes = await fetch("/api/agents/products/match-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopTitle: item.title ?? "",
            shopImageUrl: item.primaryImageUrl ?? "",
            candidates: needLlm.map((c) => ({
              productId: c.productId,
              title: c.title,
              imageUrl: c.imageUrl,
            })),
          }),
        });
        if (scoreRes.ok) {
          const body = (await scoreRes.json()) as {
            scores?: Record<string, number>;
          };
          scores = { ...scores, ...(body.scores ?? {}) };
        }
      } catch {
        /* keep whatever we have */
      }
    }
    const ranked = rankCandidates(res.items, { matchScores: scores });
    const top = ranked[0];
    const topScore =
      top != null
        ? (scores[top.productId] ?? normalizeMatchScore(top.similarityScore))
        : null;
    return {
      result: { ...res, items: ranked },
      matchScores: scores,
      rankedItems: ranked,
      topScore,
      error: null,
    };
  } catch (err) {
    return {
      result: null,
      matchScores: {},
      rankedItems: [],
      topScore: null,
      error: imageSearchError(err),
    };
  }
}
