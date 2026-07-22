import type { SkuFilterMode } from "@/lib/sku-align/display";

export const SKU_ALIGN_FILTER_PARAM = "filter";

export type SkuAlignFilterParam = SkuFilterMode;

export function skuAlignHref(filter?: SkuAlignFilterParam): string {
  if (!filter || filter === "all") return "/sku-align";
  return `/sku-align?${SKU_ALIGN_FILTER_PARAM}=${encodeURIComponent(filter)}`;
}

export function parseSkuAlignFilterParam(
  value: string | null
): SkuAlignFilterParam | null {
  if (value === "all" || value === "fully_linked" || value === "partially_linked") {
    return value;
  }
  return null;
}

export function scrollToFirstSkuIssueProduct(): void {
  requestAnimationFrame(() => {
    document
      .querySelector("[data-sku-issue-product]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
