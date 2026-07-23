import type { SkuProductOverview, SkuVariant, SkuVariantBinding } from "@/lib/types";

/** User-visible variant states — metadata (source, score, confidence) stays in detail layer. */
export type SkuVariantDisplayState =
  | "active_auto"
  | "manual_active"
  | "needs_review"
  | "unbound";

export type SkuFilterMode = "all" | "fully_linked" | "partially_linked";

export const DISPLAY_STATE_LABELS: Record<SkuVariantDisplayState, string> = {
  active_auto: "已自动对齐",
  manual_active: "手动绑定",
  needs_review: "待确认",
  unbound: "未匹配",
};

/** 高置信度阈值 — PENDING + matchScore≥此值 视为已自动对齐，无需手动确认。 */
export const AUTO_CONFIRM_THRESHOLD = 0.8;

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
  // 高置信度的 PENDING（matchScore ≥ 0.8 或单 SKU 货源）视为已自动对齐，无需手动确认
  if (pending) {
    if (
      bound.matchScore != null &&
      bound.matchScore >= AUTO_CONFIRM_THRESHOLD
    ) {
      return "active_auto";
    }
    return "needs_review";
  }
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

export function isResolvedVariantState(state: SkuVariantDisplayState): boolean {
  return state === "active_auto" || state === "manual_active";
}

export function partitionVariantsForDisplay(variants: SkuVariant[]): {
  attention: SkuVariant[];
  resolved: SkuVariant[];
} {
  const attention: SkuVariant[] = [];
  const resolved: SkuVariant[] = [];
  for (const v of variants) {
    if (isResolvedVariantState(deriveVariantDisplayState(v))) {
      resolved.push(v);
    } else {
      attention.push(v);
    }
  }
  return { attention, resolved };
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

export function matchesSkuProductSearch(
  product: SkuProductOverview,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (product.thirdPlatformItemId.toLowerCase().includes(q)) return true;
  if (product.title?.toLowerCase().includes(q)) return true;
  if (product.tangbuyProductId?.toLowerCase().includes(q)) return true;
  for (const v of product.variants) {
    if (v.thirdPlatformSkuId.toLowerCase().includes(q)) return true;
    if (v.sku?.toLowerCase().includes(q)) return true;
    if (v.optionLabel.toLowerCase().includes(q)) return true;
    if (v.bound?.tangbuySkuId?.toLowerCase().includes(q)) return true;
    if (v.bound?.tangbuyProductId?.toLowerCase().includes(q)) return true;
    if (v.bound?.tangbuySkuSpec?.toLowerCase().includes(q)) return true;
  }
  return false;
}

export function isFullyLinked(product: SkuProductOverview): boolean {
  return isFullyResolved(product);
}

/** Some variants still unmapped or awaiting review — not fully linked. */
export function isPartiallyLinked(product: SkuProductOverview): boolean {
  return product.variants.length > 0 && !isFullyResolved(product);
}

export function filterProducts(
  products: SkuProductOverview[],
  mode: SkuFilterMode
): SkuProductOverview[] {
  switch (mode) {
    case "fully_linked":
      return products.filter(isFullyLinked);
    case "partially_linked":
      return products.filter(isPartiallyLinked);
    default:
      return products;
  }
}

export function filterVariants(
  variants: SkuVariant[],
  mode: SkuFilterMode
): SkuVariant[] {
  if (mode === "partially_linked") {
    return variants.filter((v) => isIssueState(deriveVariantDisplayState(v)));
  }
  return variants;
}

export function shouldDefaultExpand(
  product: SkuProductOverview,
  mode: SkuFilterMode
): boolean {
  if (mode === "partially_linked") return true;
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
  fullyLinkedProductCount: number;
  partiallyLinkedProductCount: number;
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
    fullyLinkedProductCount: 0,
    partiallyLinkedProductCount: 0,
  };
  for (const p of products) {
    if (hasIssues(p)) m.issueProductCount++;
    if (isFullyResolved(p)) {
      m.doneProductCount++;
      m.fullyLinkedProductCount++;
    }
    if (isPartiallyLinked(p)) m.partiallyLinkedProductCount++;
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

/** High-confidence auto-align rows: shown as active_auto but backend still PENDING. */
export function collectAutoConfirmVariantIds(
  products: SkuProductOverview[]
): string[] {
  const ids: string[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      const state = deriveVariantDisplayState(v);
      if (state === "active_auto" && v.bound?.bindStatus === "PENDING") {
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
