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

/** Human-readable, data-driven hint — no fixed examples like XXL. */
export function buildSupplementSourceHint(detail: SkuAlignProductDetail): string {
  const gaps = supplementGapVariants(detail);
  const labels = gaps
    .map((v) => v.optionText?.trim())
    .filter((label): label is string => Boolean(label));

  if (labels.length === 1) {
    return `变体「${labels[0]}」在主货源规格表中无对应项，可登记第二个 1688 货源后仅对缺口变体重试。`;
  }
  if (labels.length > 1) {
    const preview = labels.slice(0, 3).join("」「");
    const suffix = labels.length > 3 ? ` 等 ${labels.length} 个变体` : "";
    return `变体「${preview}」${suffix}在主货源规格表中无对应项，可登记第二个 1688 货源后仅对缺口变体重试。`;
  }
  if (gaps.length > 0) {
    return `${gaps.length} 个变体在主货源规格表中无对应项，可登记第二个 1688 货源后仅对缺口变体重试。`;
  }
  return "部分变体在主货源规格表中无对应项，可登记第二个 1688 货源后仅对缺口变体重试。";
}
