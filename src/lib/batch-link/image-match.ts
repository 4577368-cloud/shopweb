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

/** Auto-bind floor when image search ranked first but scores are still pending. */
export const IMAGE_SEARCH_RANK_AUTO_FLOOR = HIGH_MATCH_THRESHOLD;

export function candidateStorageKey(c: Pick<ImageSearchProduct, "productId" | "internalGoodsId">): string {
  return c.internalGoodsId || c.productId;
}

/** True when visual similarity has not arrived yet (slow API / vision path). */
export function isImageScorePending(imageScore: number | null | undefined): boolean {
  return imageScore == null;
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

/** Recommend / 首推: pending scores trust image-search rank; only explicit low scores block. */
export function passesImageRecommendGate(imageScore: number | null | undefined): boolean {
  if (isImageScorePending(imageScore)) return true;
  return (imageScore as number) >= IMAGE_MATCH_RECOMMEND_MIN;
}

/** Auto-bind: pending scores do not cap title — image-search ordering is the primary signal. */
export function passesImageAutoGate(imageScore: number | null | undefined): boolean {
  if (isImageScorePending(imageScore)) return true;
  return (imageScore as number) >= IMAGE_MATCH_AUTO_MIN;
}

/** Cap title score for auto-bind only when a verified image score fails the gate. */
export function effectiveAutoBindTitleScore(
  titleScore: number | null | undefined,
  imageScore: number | null | undefined
): number | null {
  if (titleScore == null || Number.isNaN(titleScore)) return null;
  const title = Math.max(1, Math.min(100, Math.round(titleScore)));
  if (isImageScorePending(imageScore)) return title;
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

function parseRepurchase(raw?: string | null): number {
  if (!raw) return 0;
  const n = Number.parseFloat(String(raw).replace("%", "").trim());
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sort priority for ranking:
 * 2 = verified pass or pending (trust search rank)
 * 1 = verified fail — sink to tail
 */
function imageGateSortTier(imageScore: number | null | undefined): number {
  if (isImageScorePending(imageScore)) return 2;
  return passesImageRecommendGate(imageScore) ? 2 : 1;
}

/**
 * Rank candidates for auto-bind:
 * - Pending image scores keep image-search order (not sunk as "unverified")
 * - Verified low scores sink
 * - Tie-break: image score → title → monthly sold → repurchase → search index
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
      const tierA = imageGateSortTier(imageA);
      const tierB = imageGateSortTier(imageB);
      if (tierA !== tierB) return tierB - tierA;

      const imgA = imageA ?? -1;
      const imgB = imageB ?? -1;
      if (imgA !== imgB) return imgB - imgA;

      const titleA = titleScores[keyA] ?? 0;
      const titleB = titleScores[keyB] ?? 0;
      if (titleA !== titleB) return titleB - titleA;

      const soldA = a.item.soldCount ?? 0;
      const soldB = b.item.soldCount ?? 0;
      if (soldA !== soldB) return soldB - soldA;

      const repA = parseRepurchase(a.item.repurchaseRate);
      const repB = parseRepurchase(b.item.repurchaseRate);
      if (repA !== repB) return repB - repA;

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
  const effective = effectiveAutoBindTitleScore(title, image);
  if (isImageScorePending(image)) {
    return Math.max(effective ?? 0, IMAGE_SEARCH_RANK_AUTO_FLOOR);
  }
  return effective;
}

type MatchLabelTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

export function formatTitleMatchLabel(
  t: MatchLabelTranslate,
  score: number | null | undefined
): string | null {
  if (score == null || score <= 0) return null;
  return t("batchLink.titleScore", { score: Math.round(score) });
}

export function formatImageMatchLabel(
  t: MatchLabelTranslate,
  score: number | null | undefined
): string | null {
  if (score == null || score <= 0) return null;
  return t("batchLink.imageScore", { score: Math.round(score) });
}

/** Only block UI when a verified score exists and is below threshold. */
export function imageGateBlockedHint(
  t: MatchLabelTranslate,
  imageScore: number | null | undefined
): string | null {
  if (passesImageRecommendGate(imageScore)) return null;
  if (isImageScorePending(imageScore)) return null;
  return t("batchLink.imageBelowGate", { score: Math.round(imageScore!) });
}
