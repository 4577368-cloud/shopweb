import {
  rankCandidatesByCoverage,
  type RankedCoverageCandidate,
} from "@/lib/sku-align/drawer-helpers";
import { filterAvailableSupplementCandidates } from "@/lib/sku-align/supplement-candidate-availability";
import { api } from "@/lib/api";
import type { SourceSkuRow } from "@/lib/source-sku-matrix";
import type { ImageSearchProduct, ShopMirrorSku, SkuVariant } from "@/lib/types";

export type SkuMappingRankMeta = Pick<
  RankedCoverageCandidate,
  "coverage" | "total" | "meanScore"
>;

export function candidateRankKey(candidate: ImageSearchProduct): string {
  return candidate.internalGoodsId?.trim() || candidate.productId.trim();
}

function normalizeImageScores(
  scores: Record<string, number | null | undefined>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(scores)) {
    if (value != null) out[key] = value;
  }
  return out;
}

/** Minimal shop variant shape for spec-match ranking. */
export type VariantMappingTarget = Pick<
  SkuVariant,
  "thirdPlatformSkuId" | "optionLabel" | "price" | "imageUrl"
>;

export function mirrorSkuToMappingTarget(sku: ShopMirrorSku): VariantMappingTarget {
  const parts = [sku.option1, sku.option2, sku.option3].filter(Boolean);
  return {
    thirdPlatformSkuId: sku.thirdPlatformSkuId,
    optionLabel:
      parts.length > 0
        ? parts.join(" / ")
        : sku.title?.trim() || sku.sku?.trim() || "Default",
    price: sku.price,
    imageUrl: sku.imageUrl,
  };
}

/**
 * Probe image-search hits, load SKU matrices, and rank by how well source specs
 * map to the target product variants (coverage first, then mean match score).
 */
export async function rankImageSearchBySkuMapping(
  candidates: ImageSearchProduct[],
  variantTargets: VariantMappingTarget[],
  imageScores: Record<string, number | null>,
  opts?: { maxProbe?: number }
): Promise<{
  ranked: RankedCoverageCandidate[];
  matrices: Map<string, SourceSkuRow[]>;
  rejectedCount: number;
  orderedCandidates: ImageSearchProduct[];
}> {
  if (!candidates.length || !variantTargets.length) {
    return {
      ranked: [],
      matrices: new Map(),
      rejectedCount: 0,
      orderedCandidates: candidates,
    };
  }

  const maxProbe = opts?.maxProbe ?? candidates.length;
  const toProbe = candidates.slice(0, maxProbe);
  const { accepted, matrices, rejectedCount } =
    await filterAvailableSupplementCandidates(toProbe);

  const variants = variantTargets as SkuVariant[];
  const ranked = rankCandidatesByCoverage(
    accepted,
    variants,
    matrices,
    normalizeImageScores(imageScores)
  );

  const rankedKeys = new Set(
    ranked.map((r) => r.candidate.internalGoodsId || r.candidate.productId)
  );
  const tail = candidates
    .slice(maxProbe)
    .filter((c) => !rankedKeys.has(c.internalGoodsId || c.productId));

  return {
    ranked,
    matrices,
    rejectedCount,
    orderedCandidates: [...ranked.map((r) => r.candidate), ...tail],
  };
}

/** Fetch shop variants and rerank image-search hits by spec correspondence. */
export async function rerankForShopMirrorProduct(
  shopName: string,
  thirdPlatformItemId: string,
  candidates: ImageSearchProduct[],
  imageScores: Record<string, number | null | undefined>,
  opts?: { maxProbe?: number }
): Promise<{
  orderedCandidates: ImageSearchProduct[];
  rankMeta: Map<string, SkuMappingRankMeta>;
}> {
  if (!candidates.length) {
    return { orderedCandidates: candidates, rankMeta: new Map() };
  }
  try {
    const detail = await api.getShopProductDetail(shopName, thirdPlatformItemId);
    const targets = detail.variants.map(mirrorSkuToMappingTarget);
    if (!targets.length) {
      return { orderedCandidates: candidates, rankMeta: new Map() };
    }
    const { ranked, orderedCandidates } = await rankImageSearchBySkuMapping(
      candidates,
      targets,
      normalizeImageScores(imageScores),
      opts
    );
    const rankMeta = new Map<string, SkuMappingRankMeta>();
    for (const entry of ranked) {
      rankMeta.set(candidateRankKey(entry.candidate), {
        coverage: entry.coverage,
        total: entry.total,
        meanScore: entry.meanScore,
      });
    }
    return { orderedCandidates, rankMeta };
  } catch {
    return { orderedCandidates: candidates, rankMeta: new Map() };
  }
}
