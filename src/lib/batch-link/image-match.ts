import {
  HIGH_MATCH_THRESHOLD,
} from "@/data/mock";
import { normalizeMatchScore } from "@/lib/agents/products/match-rank";
import type { ImageSearchProduct } from "@/lib/types";

/** Below this image score a candidate cannot be 首推. */
export const IMAGE_MATCH_RECOMMEND_MIN = 70;

/** Image score required for auto-bind tier (with title score ≥ 85). */
export const IMAGE_MATCH_AUTO_MIN = 85;

/** When shop/candidate image URLs are identical, floor the image score. */
export const IMAGE_URL_MATCH_FLOOR = 80;

export function candidateStorageKey(c: Pick<ImageSearchProduct, "productId" | "internalGoodsId">): string {
  return c.internalGoodsId || c.productId;
}

export function normalizeComparableImageUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  try {
    const u = new URL(url.trim());
    u.hash = "";
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function exactImageUrlMatch(
  shopUrl: string | null | undefined,
  candidateUrl: string | null | undefined
): boolean {
  const a = normalizeComparableImageUrl(shopUrl);
  const b = normalizeComparableImageUrl(candidateUrl);
  return Boolean(a && b && a === b);
}

export function passesImageRecommendGate(imageScore: number | null | undefined): boolean {
  return imageScore != null && imageScore >= IMAGE_MATCH_RECOMMEND_MIN;
}

export function passesImageAutoGate(imageScore: number | null | undefined): boolean {
  return imageScore != null && imageScore >= IMAGE_MATCH_AUTO_MIN;
}

/** Cap title score for auto-bind when image gate fails. */
export function effectiveAutoBindTitleScore(
  titleScore: number | null | undefined,
  imageScore: number | null | undefined
): number | null {
  if (titleScore == null || Number.isNaN(titleScore)) return null;
  const title = Math.max(1, Math.min(100, Math.round(titleScore)));
  if (!passesImageAutoGate(imageScore)) {
    return Math.min(title, HIGH_MATCH_THRESHOLD - 1);
  }
  return title;
}

export function applyImageUrlMatchFloor(
  shopImageUrl: string | null | undefined,
  candidate: Pick<ImageSearchProduct, "imageUrl" | "productId" | "internalGoodsId">,
  imageScores: Record<string, number | null>
): void {
  const key = candidateStorageKey(candidate);
  if (!exactImageUrlMatch(shopImageUrl, candidate.imageUrl)) return;
  const prev = imageScores[key];
  imageScores[key] =
    prev == null ? IMAGE_URL_MATCH_FLOOR : Math.max(prev, IMAGE_URL_MATCH_FLOOR);
}

/**
 * Rank: image-gate pass first, then image score, then title score.
 * Blocked candidates sink to the tail.
 */
export function rankCandidatesWithImageGate(
  items: ImageSearchProduct[],
  titleScores: Record<string, number>,
  imageScores: Record<string, number | null>
): ImageSearchProduct[] {
  if (items.length <= 1) return items.slice();

  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const keyA = candidateStorageKey(a.item);
      const keyB = candidateStorageKey(b.item);
      const imageA = imageScores[keyA];
      const imageB = imageScores[keyB];
      const gateA = passesImageRecommendGate(imageA) ? 1 : 0;
      const gateB = passesImageRecommendGate(imageB) ? 1 : 0;
      if (gateA !== gateB) return gateB - gateA;

      const imgA = imageA ?? -1;
      const imgB = imageB ?? -1;
      if (imgA !== imgB) return imgB - imgA;

      const titleA = titleScores[keyA] ?? 0;
      const titleB = titleScores[keyB] ?? 0;
      if (titleA !== titleB) return titleB - titleA;

      return a.index - b.index;
    })
    .map((x) => x.item);
}

export function resolveTopAutoBindScore(
  ranked: ImageSearchProduct[],
  titleScores: Record<string, number>,
  imageScores: Record<string, number | null>
): number | null {
  const top = ranked[0];
  if (!top) return null;
  const key = candidateStorageKey(top);
  const title =
    titleScores[key] ?? normalizeMatchScore(top.similarityScore) ?? null;
  const image = imageScores[key] ?? null;
  return effectiveAutoBindTitleScore(title, image);
}

export function formatTitleMatchLabel(score: number | null | undefined): string | null {
  if (score == null || score <= 0) return null;
  return `标题 ${Math.round(score)}%`;
}

export function formatImageMatchLabel(score: number | null | undefined): string | null {
  if (score == null || score <= 0) return null;
  return `图像 ${Math.round(score)}%`;
}

export function imageGateBlockedHint(imageScore: number | null | undefined): string | null {
  if (passesImageRecommendGate(imageScore)) return null;
  if (imageScore == null) return "图像未验证";
  return `图像 ${Math.round(imageScore)}% · 未达门槛`;
}
