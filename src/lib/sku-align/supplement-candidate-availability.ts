import { api } from "@/lib/api";
import { isOfferNotFoundError } from "@/lib/batch-link/match-errors";
import {
  isOfferId1688,
  resolveConfirmDetailUrl,
} from "@/lib/catalog-product-resolve";
import { resolveCandidateOfferId } from "@/lib/sku-align/drawer-helpers";
import {
  fetchSourceSkuMatrixResult,
  mapOfferDetailToSourceSkuMatrix,
  type SourceSkuRow,
} from "@/lib/source-sku-matrix";
import { buildTangbuyProductUrl } from "@/lib/tangbuy-mall-gateway";
import type { ImageSearchProduct } from "@/lib/types";

export type SupplementCandidateProbeResult = {
  available: boolean;
  matrixRows: SourceSkuRow[];
  reason?: string;
};

function candidateStorageKey(candidate: ImageSearchProduct): string {
  return candidate.internalGoodsId?.trim() || candidate.productId.trim();
}

function resolveProbeDetailUrl(candidate: ImageSearchProduct): string | null {
  return (
    resolveConfirmDetailUrl(candidate) ??
    candidate.tangbuyCatalogUrl?.trim() ??
    candidate.detailUrl?.trim() ??
    (candidate.internalGoodsId
      ? buildTangbuyProductUrl(candidate.internalGoodsId)
      : null)
  );
}

function isTangbuyProbeCandidate(candidate: ImageSearchProduct, detailUrl: string | null): boolean {
  if (candidate.catalogSource || candidate.internalGoodsId?.trim()) return true;
  if (detailUrl?.toLowerCase().includes("tangbuy.cc")) return true;
  return false;
}

/** Verify a supplement candidate is on-sale and load its SKU matrix before recommending. */
export async function probeSupplementCandidate(
  candidate: ImageSearchProduct
): Promise<SupplementCandidateProbeResult> {
  const detailUrl = resolveProbeDetailUrl(candidate);

  if (detailUrl && isTangbuyProbeCandidate(candidate, detailUrl)) {
    const { rows, error } = await fetchSourceSkuMatrixResult(detailUrl);
    if (rows.length > 0) {
      return { available: true, matrixRows: rows };
    }
    return {
      available: false,
      matrixRows: [],
      reason: error ?? "该 Tangbuy 货源已下架或无法读取 SKU",
    };
  }

  const offerId = resolveCandidateOfferId(candidate);
  if (offerId && isOfferId1688(offerId)) {
    try {
      const detail = await api.getOfferDetail(offerId);
      const rows = mapOfferDetailToSourceSkuMatrix(detail);
      if (rows.length > 0) {
        return { available: true, matrixRows: rows };
      }
      return {
        available: false,
        matrixRows: [],
        reason: "该货源已下架或没有可用规格",
      };
    } catch (err) {
      if (isOfferNotFoundError(err)) {
        return {
          available: false,
          matrixRows: [],
          reason: "该货源已下架或无效",
        };
      }
      throw err;
    }
  }

  if (detailUrl) {
    const { rows, error } = await fetchSourceSkuMatrixResult(detailUrl);
    if (rows.length > 0) {
      return { available: true, matrixRows: rows };
    }
    return {
      available: false,
      matrixRows: [],
      reason: error ?? "无法验证货源是否在售",
    };
  }

  return {
    available: false,
    matrixRows: [],
    reason: "无法识别该货源",
  };
}

export async function filterAvailableSupplementCandidates(
  candidates: ImageSearchProduct[]
): Promise<{
  accepted: ImageSearchProduct[];
  matrices: Map<string, SourceSkuRow[]>;
  rejectedCount: number;
}> {
  const accepted: ImageSearchProduct[] = [];
  const matrices = new Map<string, SourceSkuRow[]>();
  let rejectedCount = 0;

  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      probe: await probeSupplementCandidate(candidate).catch(() => ({
        available: false as const,
        matrixRows: [] as SourceSkuRow[],
        reason: "验证货源失败",
      })),
    }))
  );

  for (const { candidate, probe } of results) {
    const key = candidateStorageKey(candidate);
    if (probe.available && probe.matrixRows.length > 0) {
      accepted.push(candidate);
      matrices.set(key, probe.matrixRows);
    } else {
      rejectedCount += 1;
    }
  }

  return { accepted, matrices, rejectedCount };
}
