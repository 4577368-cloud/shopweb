import { api } from "@/lib/api";
import { normalizeMatchScore } from "@/lib/agents/products/match-rank";
import {
  applyImageUrlMatchFloor,
  candidateStorageKey,
  rankCandidatesWithImageGate,
  resolveTopAutoBindScore,
} from "@/lib/batch-link/image-match";
import {
  enrich1688CandidateWithCatalogIdentity,
  searchCatalogImageCandidates,
} from "@/lib/catalog-product-resolve";
import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";
import type {
  ImageSearchProduct,
  ImageSearchResult,
  ShopMirrorProduct,
} from "@/lib/types";

export interface ImageSearchPipelineResult {
  result: ImageSearchResult | null;
  /** Title / text similarity scores (LLM or API). */
  matchScores: Record<string, number>;
  /** Visual similarity scores after gate inputs. */
  imageScores: Record<string, number | null>;
  rankedItems: ImageSearchProduct[];
  topScore: number | null;
  error: string | null;
  catalogHitCount?: number;
}

const CATALOG_SCORE_BOOST = 12;

function imageSearchError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "图搜失败，请稍后重试";
}

async function scoreTitleCandidates(
  item: Pick<ShopMirrorProduct, "title" | "primaryImageUrl">,
  items: ImageSearchProduct[],
  initialScores: Record<string, number> = {}
): Promise<Record<string, number>> {
  let scores = { ...initialScores };
  for (const c of items) {
    const key = candidateStorageKey(c);
    const n = normalizeMatchScore(c.similarityScore);
    if (n != null && scores[key] == null) scores[key] = n;
    if (c.catalogSource && scores[key] != null) {
      scores[key] = Math.min(100, scores[key]! + CATALOG_SCORE_BOOST);
    }
  }

  const needLlm = items.filter((c) => scores[candidateStorageKey(c)] == null);
  if (needLlm.length === 0) return scores;

  try {
    const scoreRes = await fetch("/api/agents/products/match-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopTitle: item.title ?? "",
        shopImageUrl: item.primaryImageUrl ?? "",
        candidates: needLlm.map((c) => ({
          productId: candidateStorageKey(c),
          title: c.title,
          imageUrl: c.imageUrl,
        })),
      }),
    });
    if (scoreRes.ok) {
      const body = (await scoreRes.json()) as { scores?: Record<string, number> };
      const fromLlm = body.scores ?? {};
      for (const c of needLlm) {
        const key = candidateStorageKey(c);
        const raw = fromLlm[c.productId] ?? fromLlm[key];
        if (raw != null) {
          scores[key] = c.catalogSource
            ? Math.min(100, raw + CATALOG_SCORE_BOOST)
            : raw;
        }
      }
    }
  } catch {
    /* keep whatever we have */
  }

  return scores;
}

async function scoreImageCandidates(
  shopImageUrl: string | null | undefined,
  items: ImageSearchProduct[]
): Promise<Record<string, number | null>> {
  const scores: Record<string, number | null> = {};
  for (const c of items) {
    const key = candidateStorageKey(c);
    const apiScore = normalizeMatchScore(c.similarityScore);
    scores[key] = apiScore;
    applyImageUrlMatchFloor(shopImageUrl, c, scores);
  }

  const needRemote = items.filter((c) => scores[candidateStorageKey(c)] == null);
  if (needRemote.length === 0 || !shopImageUrl?.trim()) return scores;

  try {
    const res = await fetch("/api/batch-link/image-match-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopImageUrl,
        candidates: needRemote.map((c) => ({
          productId: candidateStorageKey(c),
          imageUrl: c.imageUrl,
          similarityScore: c.similarityScore,
        })),
      }),
    });
    if (res.ok) {
      const body = (await res.json()) as {
        scores?: Record<string, number | null>;
      };
      for (const c of needRemote) {
        const key = candidateStorageKey(c);
        const raw = body.scores?.[key] ?? body.scores?.[c.productId];
        if (raw != null) scores[key] = raw;
        applyImageUrlMatchFloor(shopImageUrl, c, scores);
      }
    }
  } catch {
    for (const c of needRemote) {
      applyImageUrlMatchFloor(shopImageUrl, c, scores);
    }
  }

  return scores;
}

function dedupeCandidates(items: ImageSearchProduct[]): ImageSearchProduct[] {
  const out: ImageSearchProduct[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = candidateStorageKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Shared image-search pipeline:
 * 1) Tangbuy 商品库 keyword 优先
 * 2) 1688 图搜 fallback
 * 3) Title score (LLM auxiliary) + image score (API / URL / pHash / vision)
 * 4) Rank with image hard gate + image-first ordering
 */
export async function runImageSearchPipeline(
  shopName: string,
  item: Pick<ShopMirrorProduct, "thirdPlatformItemId" | "title" | "primaryImageUrl">,
  limit = 5
): Promise<ImageSearchPipelineResult> {
  try {
    const catalogHits = isMallGatewayConfigured()
      ? await searchCatalogImageCandidates(item.title ?? "", limit)
      : [];

    const res = await api.imageSearch(shopName, item.thirdPlatformItemId, limit);

    const enriched1688 = await Promise.all(
      res.items.map((c) =>
        enrich1688CandidateWithCatalogIdentity(c, item.title, shopName)
      )
    );

    const merged = dedupeCandidates([...catalogHits, ...enriched1688]);
    const titleScores = await scoreTitleCandidates(item, merged);
    const imageScores = await scoreImageCandidates(item.primaryImageUrl, merged);
    const ranked = rankCandidatesWithImageGate(merged, titleScores, imageScores);
    const topScore = resolveTopAutoBindScore(ranked, titleScores, imageScores);

    return {
      result: {
        ...res,
        items: ranked,
        appliedQuery:
          catalogHits.length > 0
            ? [res.appliedQuery, "商品库优先"].filter(Boolean).join(" · ")
            : res.appliedQuery,
      },
      matchScores: titleScores,
      imageScores,
      rankedItems: ranked,
      topScore,
      catalogHitCount: catalogHits.length,
      error: null,
    };
  } catch (err) {
    return {
      result: null,
      matchScores: {},
      imageScores: {},
      rankedItems: [],
      topScore: null,
      error: imageSearchError(err),
    };
  }
}
