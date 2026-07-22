import type { SkuAlignProductDetail, SkuAlignVariantRow } from "./types";

/** Variants where the engine confirmed the primary offer matrix has no matching option. */
export function supplementGapVariants(detail: SkuAlignProductDetail): SkuAlignVariantRow[] {
  return detail.variants.filter(
    (v) => v.reviewState === "NO_SOURCE" || v.actions.canAddSupplementSource
  );
}

/** Show supplement registration only when V1 review data says the primary matrix is missing options. */
export function needsSupplementSource(detail: SkuAlignProductDetail): boolean {
  if (detail.supplementOffer?.offerId?.trim()) return false;
  if ((detail.summary.noSourceVariants ?? 0) > 0) return true;
  return supplementGapVariants(detail).length > 0;
}

/** Human-readable, data-driven hint — concise and friendly. */
export function buildSupplementSourceHint(detail: SkuAlignProductDetail): string {
  const gaps = supplementGapVariants(detail);
  const count = gaps.length || (detail.summary.noSourceVariants ?? 0);

  if (count === 1) {
    return "1 个规格当前货源未覆盖，可添加补充货源解决。";
  }
  if (count > 1) {
    return `${count} 个规格当前货源未覆盖，可添加补充货源解决。`;
  }
  return "部分规格当前货源未覆盖，可添加补充货源解决。";
}
