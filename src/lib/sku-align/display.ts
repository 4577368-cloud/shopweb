import type { SkuProductOverview, SkuVariant, SkuVariantBinding } from "@/lib/types";

/** User-visible variant states — metadata (source, score, confidence) stays in detail layer. */
export type SkuVariantDisplayState =
  | "active_auto"
  | "manual_active"
  | "needs_review"
  | "unbound";

export type SkuFilterMode = "issues" | "all" | "done";

export const DISPLAY_STATE_LABELS: Record<SkuVariantDisplayState, string> = {
  active_auto: "已自动对齐",
  manual_active: "手动绑定",
  needs_review: "待确认",
  unbound: "未匹配",
};

function isManualBinding(source?: string | null): boolean {
  return source === "MANUAL";
}

function isAutoAligned(source?: string | null): boolean {
  return source === "RULE" || source === "AI";
}

function isImageBinding(source?: string | null): boolean {
  return source === "IMAGE" || source === "CATALOG";
}

/** Map legacy overview binding rows to the 4-state display model. */
export function deriveVariantDisplayState(
  variant: Pick<SkuVariant, "bound">
): SkuVariantDisplayState {
  return deriveDisplayStateFromBinding(variant.bound);
}

export function deriveDisplayStateFromBinding(
  bound?: SkuVariantBinding | null
): SkuVariantDisplayState {
  if (!bound) return "unbound";
  const pending = bound.bindStatus === "PENDING";
  if (isManualBinding(bound.matchSource) && !pending) return "manual_active";
  if (pending) return "needs_review";
  if (isManualBinding(bound.matchSource)) return "manual_active";
  if (
    isAutoAligned(bound.matchSource) ||
    isImageBinding(bound.matchSource) ||
    bound.bindStatus === "ACTIVE" ||
    !bound.bindStatus
  ) {
    return "active_auto";
  }
  return "active_auto";
}

export function isIssueState(state: SkuVariantDisplayState): boolean {
  return state === "needs_review" || state === "unbound";
}

export function countIssueVariants(product: SkuProductOverview): number {
  return product.variants.filter((v) =>
    isIssueState(deriveVariantDisplayState(v))
  ).length;
}

export function countNeedsReview(product: SkuProductOverview): number {
  return product.variants.filter(
    (v) => deriveVariantDisplayState(v) === "needs_review"
  ).length;
}

export function countUnbound(product: SkuProductOverview): number {
  return product.variants.filter(
    (v) => deriveVariantDisplayState(v) === "unbound"
  ).length;
}

export function countActiveAuto(product: SkuProductOverview): number {
  return product.variants.filter(
    (v) => deriveVariantDisplayState(v) === "active_auto"
  ).length;
}

export function hasIssues(product: SkuProductOverview): boolean {
  return countIssueVariants(product) > 0;
}

export function isFullyResolved(product: SkuProductOverview): boolean {
  return product.variants.length > 0 && !hasIssues(product);
}

export function filterProducts(
  products: SkuProductOverview[],
  mode: SkuFilterMode
): SkuProductOverview[] {
  switch (mode) {
    case "issues":
      return products.filter(hasIssues);
    case "done":
      return products.filter(isFullyResolved);
    default:
      return products;
  }
}

export function filterVariants(
  variants: SkuVariant[],
  mode: SkuFilterMode
): SkuVariant[] {
  if (mode === "issues") {
    return variants.filter((v) => isIssueState(deriveVariantDisplayState(v)));
  }
  return variants;
}

export function shouldDefaultExpand(
  product: SkuProductOverview,
  mode: SkuFilterMode
): boolean {
  if (mode === "issues") return true;
  if (mode === "all") return hasIssues(product);
  return false;
}

export function productIssueSortKey(product: SkuProductOverview): number {
  const needsReview = countNeedsReview(product);
  const unbound = countUnbound(product);
  return needsReview * 1000 + unbound;
}

export function sortProductsForWorkbench(
  products: SkuProductOverview[]
): SkuProductOverview[] {
  return [...products].sort(
    (a, b) => productIssueSortKey(b) - productIssueSortKey(a)
  );
}

export interface SkuAlignMetrics {
  productCount: number;
  variantCount: number;
  activeAuto: number;
  manualActive: number;
  needsReview: number;
  unbound: number;
  legacyPending: number;
  issueProductCount: number;
  doneProductCount: number;
}

export function computeSkuAlignMetrics(
  products: SkuProductOverview[]
): SkuAlignMetrics {
  const m: SkuAlignMetrics = {
    productCount: products.length,
    variantCount: 0,
    activeAuto: 0,
    manualActive: 0,
    needsReview: 0,
    unbound: 0,
    legacyPending: 0,
    issueProductCount: 0,
    doneProductCount: 0,
  };
  for (const p of products) {
    if (hasIssues(p)) m.issueProductCount++;
    if (isFullyResolved(p)) m.doneProductCount++;
    for (const v of p.variants) {
      m.variantCount++;
      const state = deriveVariantDisplayState(v);
      switch (state) {
        case "active_auto":
          m.activeAuto++;
          break;
        case "manual_active":
          m.manualActive++;
          break;
        case "needs_review":
          m.needsReview++;
          break;
        case "unbound":
          m.unbound++;
          break;
      }
      if (v.bound?.bindStatus === "PENDING") m.legacyPending++;
    }
  }
  return m;
}

export function collectNeedsReviewVariantIds(
  products: SkuProductOverview[]
): string[] {
  const ids: string[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      if (deriveVariantDisplayState(v) === "needs_review") {
        ids.push(v.thirdPlatformSkuId);
      }
    }
  }
  return ids;
}

export function countNeedsReviewInProducts(
  products: SkuProductOverview[]
): number {
  return collectNeedsReviewVariantIds(products).length;
}
