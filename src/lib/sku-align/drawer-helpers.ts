import { extractOfferIdFromUrl } from "@/lib/catalog-product-resolve";
import {
  deriveVariantDisplayState,
  partitionVariantsForDisplay,
} from "@/lib/sku-align/display";
import { supplementGapVariants } from "@/lib/sku-align-v1/supplement-source";
import type { SkuAlignProductDetail } from "@/lib/sku-align-v1/types";
import {
  rankSourceSkuRows,
  type SourceSkuRow,
  type SourceSkuRowRanked,
} from "@/lib/source-sku-matrix";
import { applyLlmToRanked } from "@/lib/sku-align/spec-match-llm";
import type { ImageSearchProduct, SkuVariant } from "@/lib/types";

export const AUTO_SUGGEST_THRESHOLD = 0.8;
export const COVERAGE_MATCH_THRESHOLD = 0.5;

export type DrawerPhase = "primary" | "supplement";

export interface VariantSkuHit {
  variant: SkuVariant;
  hit: SourceSkuRowRanked | null;
}

/** Variants that primary matrix cannot cover — need supplement source. */
export function supplementGapVariantsFromOverview(
  variants: SkuVariant[],
  matrix: SourceSkuRow[],
  v1Detail?: SkuAlignProductDetail | null
): SkuVariant[] {
  const v1Gaps = supplementGapVariants(
    v1Detail ?? { summary: {} as never, variants: [] }
  );
  const v1GapIds = new Set(v1Gaps.map((v) => v.thirdPlatformSkuId));

  return variants.filter((v) => {
    if (v1GapIds.has(v.thirdPlatformSkuId)) return true;
    const state = deriveVariantDisplayState(v);
    if (state !== "unbound" && state !== "needs_review") return false;
    if (!matrix.length) return false;
    const ranked = rankSourceSkuRows(matrix, v.optionLabel, {
      variantPrice: v.price,
      variantImageUrl: v.imageUrl,
    });
    const top = ranked[0];
    return !top || top.matchScore < COVERAGE_MATCH_THRESHOLD;
  });
}

/** Variants still needing attention in primary source (mappable in current matrix). */
export function primaryAttentionVariants(
  variants: SkuVariant[],
  matrix: SourceSkuRow[],
  v1Detail?: SkuAlignProductDetail | null
): SkuVariant[] {
  const supplementGaps = new Set(
    supplementGapVariantsFromOverview(variants, matrix, v1Detail).map(
      (v) => v.thirdPlatformSkuId
    )
  );
  const { attention } = partitionVariantsForDisplay(variants);
  return attention.filter((v) => !supplementGaps.has(v.thirdPlatformSkuId));
}

export function buildAutoSuggestions(
  variants: SkuVariant[],
  matrix: SourceSkuRow[],
  existing: Record<string, string>,
  /** 可选：灰区 LLM 复核置信度（pairKey→0-1），命中则融入排序。 */
  llmByKey?: Record<string, number>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const variant of variants) {
    const current = existing[variant.thirdPlatformSkuId]?.trim();
    if (current) continue;
    const bound = variant.bound?.tangbuySkuId?.trim();
    if (bound) continue;
    let ranked = rankSourceSkuRows(matrix, variant.optionLabel, {
      variantPrice: variant.price,
      variantImageUrl: variant.imageUrl,
    });
    if (llmByKey) ranked = applyLlmToRanked(variant.optionLabel, ranked, llmByKey);
    const top = ranked[0];
    if (top && top.matchScore >= AUTO_SUGGEST_THRESHOLD) {
      out[variant.thirdPlatformSkuId] = top.skuId;
    }
  }
  return out;
}

export function countHighConfidenceSuggestions(
  suggestions: Record<string, string>
): number {
  return Object.keys(suggestions).length;
}

/** Map gap variants to best SKU hit in a candidate matrix. */
export function mapGapHits(
  gapVariants: SkuVariant[],
  matrix: SourceSkuRow[]
): VariantSkuHit[] {
  return gapVariants.map((variant) => {
    const ranked = rankSourceSkuRows(matrix, variant.optionLabel, {
      variantPrice: variant.price,
      variantImageUrl: variant.imageUrl,
    });
    const top = ranked[0];
    const hit =
      top && top.matchScore >= COVERAGE_MATCH_THRESHOLD ? top : null;
    return { variant, hit };
  });
}

export function coverageCount(hits: VariantSkuHit[]): number {
  return hits.filter((h) => h.hit != null).length;
}

export interface RankedCoverageCandidate {
  candidate: ImageSearchProduct;
  hits: VariantSkuHit[];
  coverage: number;
  total: number;
  imageScore: number;
}

export function resolveCandidateOfferId(candidate: ImageSearchProduct): string {
  return (
    candidate.internalGoodsId?.trim() ||
    candidate.offerId1688?.trim() ||
    candidate.productId.trim()
  );
}

function normalizeOfferId(id: string): string {
  return id.trim().toLowerCase();
}

function collectCandidateOfferIds(candidate: ImageSearchProduct): string[] {
  const ids: string[] = [];
  const push = (raw: string | null | undefined) => {
    const id = raw?.trim();
    if (id) ids.push(normalizeOfferId(id));
  };
  push(candidate.internalGoodsId);
  push(candidate.offerId1688);
  push(candidate.productId);
  push(candidate.catalogItemId);
  push(extractOfferIdFromUrl(candidate.detailUrl));
  push(extractOfferIdFromUrl(candidate.tangbuyCatalogUrl));
  return [...new Set(ids)];
}

export interface ExcludedOfferContext {
  tangbuyProductId?: string | null;
  detailUrl?: string | null;
  primaryOfferId?: string | null;
  primaryOfferDetailUrl?: string | null;
  supplementOfferId?: string | null;
  supplementOfferDetailUrl?: string | null;
  boundTangbuyProductIds?: string[];
}

export function buildExcludedOfferIds(ctx: ExcludedOfferContext): Set<string> {
  const excluded = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const id = raw?.trim();
    if (id) excluded.add(normalizeOfferId(id));
  };
  add(ctx.tangbuyProductId);
  add(ctx.primaryOfferId);
  add(ctx.supplementOfferId);
  add(extractOfferIdFromUrl(ctx.detailUrl));
  add(extractOfferIdFromUrl(ctx.primaryOfferDetailUrl));
  add(extractOfferIdFromUrl(ctx.supplementOfferDetailUrl));
  for (const id of ctx.boundTangbuyProductIds ?? []) add(id);
  return excluded;
}

function normalizeDetailUrlKey(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const offerId = extractOfferIdFromUrl(raw);
  if (offerId) return normalizeOfferId(offerId);
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return normalizeOfferId(parsed.toString());
  } catch {
    return normalizeOfferId(raw);
  }
}

function isExcludedImageSearchCandidate(
  candidate: ImageSearchProduct,
  excludedIds: Set<string>,
  excludedDetailUrls: Set<string>
): boolean {
  if (excludedIds.size === 0 && excludedDetailUrls.size === 0) return false;
  for (const id of collectCandidateOfferIds(candidate)) {
    if (excludedIds.has(id)) return true;
  }
  const detailKey = normalizeDetailUrlKey(candidate.detailUrl);
  if (detailKey && excludedDetailUrls.has(detailKey)) return true;
  return false;
}

/** Drop primary / existing supplement hits from supplement-source image search. */
export function filterSupplementCandidates(
  candidates: ImageSearchProduct[],
  ctx: ExcludedOfferContext
): ImageSearchProduct[] {
  const excludedIds = buildExcludedOfferIds(ctx);
  const excludedDetailUrls = new Set<string>();
  for (const url of [
    ctx.detailUrl,
    ctx.primaryOfferDetailUrl,
    ctx.supplementOfferDetailUrl,
  ]) {
    const key = normalizeDetailUrlKey(url);
    if (key) excludedDetailUrls.add(key);
  }
  return candidates.filter(
    (c) => !isExcludedImageSearchCandidate(c, excludedIds, excludedDetailUrls)
  );
}

/** Sort image-search hits by SKU gap coverage, then image similarity. */
export function rankCandidatesByCoverage(
  candidates: ImageSearchProduct[],
  gapVariants: SkuVariant[],
  matrices: Map<string, SourceSkuRow[]>,
  imageScores: Record<string, number>
): RankedCoverageCandidate[] {
  const ranked: RankedCoverageCandidate[] = candidates.map((candidate) => {
    const key = candidate.internalGoodsId || candidate.productId;
    const matrix = matrices.get(key) ?? [];
    const hits = mapGapHits(gapVariants, matrix);
    const coverage = coverageCount(hits);
    const imageScore =
      imageScores[key] ??
      imageScores[candidate.productId] ??
      (candidate.similarityScore != null && candidate.similarityScore <= 1
        ? candidate.similarityScore * 100
        : candidate.similarityScore ?? 0);
    return {
      candidate,
      hits,
      coverage,
      total: gapVariants.length,
      imageScore,
    };
  });

  return ranked.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    return b.imageScore - a.imageScore;
  });
}

export function buildGapSummaryText(
  unmapped: number,
  supplementGaps: number
): string | null {
  if (unmapped <= 0 && supplementGaps <= 0) return null;
  const parts: string[] = [];
  if (unmapped > 0) parts.push(`${unmapped} 个变体未映射`);
  if (supplementGaps > 0) parts.push(`${supplementGaps} 个可能需补充货源`);
  return parts.join(" · ");
}
