import { candidateStorageKey } from "@/lib/batch-link/image-match";
import type { SourceSkuRow } from "@/lib/source-sku-matrix";

/**
 * Visual similarity 0–1 per Tangbuy skuId (variant shop image vs source SKU image).
 */
export async function fetchSkuRowVisualScores(
  variantImageUrl: string | null | undefined,
  rows: SourceSkuRow[]
): Promise<Record<string, number>> {
  const shopUrl = variantImageUrl?.trim();
  if (!shopUrl || !rows.length) return {};

  const CHUNK = 8;
  const out: Record<string, number> = {};
  const candidates = rows.filter((r) => r.imageUrl?.trim());
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    try {
      const res = await fetch("/api/batch-link/image-match-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopImageUrl: shopUrl,
          candidates: slice.map((r) => ({
            productId: r.skuId,
            imageUrl: r.imageUrl,
          })),
        }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { scores?: Record<string, number | null> };
      for (const row of slice) {
        const raw = body.scores?.[row.skuId];
        if (raw == null || !Number.isFinite(raw)) continue;
        out[row.skuId] = Math.max(0, Math.min(1, raw / 100));
      }
    } catch {
      /* skip chunk */
    }
  }
  return out;
}

/** Per supplement-offer matrix: variantId → source skuId → visual score 0–1. */
export async function prefetchSupplementMatrixVision(
  gapVariants: Array<{ thirdPlatformSkuId: string; imageUrl?: string | null }>,
  matrices: Map<string, SourceSkuRow[]>
): Promise<Map<string, Record<string, Record<string, number>>>> {
  const out = new Map<string, Record<string, Record<string, number>>>();
  await Promise.all(
    [...matrices.entries()].map(async ([candidateKey, rows]) => {
      const perVariant: Record<string, Record<string, number>> = {};
      await Promise.all(
        gapVariants.map(async (v) => {
          if (!v.imageUrl?.trim() || !rows.length) return;
          const scores = await fetchSkuRowVisualScores(v.imageUrl, rows);
          if (Object.keys(scores).length) {
            perVariant[v.thirdPlatformSkuId] = scores;
          }
        })
      );
      if (Object.keys(perVariant).length) out.set(candidateKey, perVariant);
    })
  );
  return out;
}

export function matrixVisionCacheKey(
  variantImageUrl: string | null | undefined,
  rows: SourceSkuRow[]
): string {
  const imgs = rows
    .map((r) => r.skuId)
    .sort()
    .join(",");
  return `${variantImageUrl ?? ""}::${imgs}`;
}
