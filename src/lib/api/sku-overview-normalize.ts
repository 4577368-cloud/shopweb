import type { SkuProductOverview } from "@/lib/types";

/**
 * Overview list shaping after `thumbWidth` + `compact` on the API.
 * Thumbnails are applied server-side — do not re-run CDN resize here (double resize breaks alicdn URLs).
 */
export function normalizeSkuOverviewForList(
  rows: SkuProductOverview[]
): SkuProductOverview[] {
  return rows.map((p) => ({
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      bound: v.bound
        ? {
            ...v.bound,
            offerPrice: undefined,
            querySource: undefined,
            appliedQuery: undefined,
          }
        : v.bound,
    })),
  }));
}
