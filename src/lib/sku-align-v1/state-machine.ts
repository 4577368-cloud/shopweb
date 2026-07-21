import type {
  ConfidenceLevel,
  DisplayStatus,
  SkuAlignCurrentBinding,
  SkuAlignVariantRow,
  VariantBindingState,
  VariantReviewState,
} from "@/lib/sku-align-v1/types";

/** Default confidence thresholds — server is source of truth; client uses for UI hints. */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,
  MEDIUM: 0.5,
} as const;

export const PAGE_ENTER_STALE_MS = 10 * 60 * 1000;

export const MAX_SUPPLEMENT_SOURCES_V1 = 1;

/** UI badge label derived from binding + review — data-driven, not ad-hoc in components. */
export function deriveVariantStatusBadge(row: Pick<
  SkuAlignVariantRow,
  "currentBinding" | "reviewState"
>): string {
  const binding = row.currentBinding;
  const state = binding?.bindingState;
  if (binding && state === "BLOCKED") return "已阻断";
  if (binding && state === "MULTI_SOURCE") return "多货源";
  if (binding && state === "ALIGNED") return "已对齐";
  switch (row.reviewState) {
    case "SUGGESTED":
      return "待确认";
    case "NO_SOURCE":
      return "无货源";
    case "UNMAPPED":
      return "未匹配";
    case "RESOLVED":
      return binding ? "已对齐" : "未匹配";
    default:
      return "未匹配";
  }
}

/** Whether variant blocks logistics gate (V1). */
export function blocksLogistics(row: Pick<
  SkuAlignVariantRow,
  "currentBinding" | "reviewState"
>): boolean {
  if (row.currentBinding?.bindingState === "BLOCKED") return true;
  if (row.reviewState === "NO_SOURCE") return true;
  if (row.reviewState === "UNMAPPED") return true;
  if (row.reviewState === "SUGGESTED") return true;
  return false;
}

export function isProtectedFromAutoOverwrite(binding?: SkuAlignCurrentBinding | null): boolean {
  if (!binding) return false;
  if (binding.manualLocked) return true;
  return binding.bindingState === "BLOCKED";
}

export function mayAutoActivateBinding(
  productOrigin: "INTERNAL" | "EXTERNAL",
  level: ConfidenceLevel
): boolean {
  if (level !== "HIGH") return false;
  return productOrigin === "INTERNAL";
}

export function confidenceLevelFromScore(
  score: number,
  singleSkuOffer: boolean
): ConfidenceLevel {
  if (singleSkuOffer || score >= CONFIDENCE_THRESHOLDS.HIGH) return "HIGH";
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

/** Display must never show confirmed binding with empty spec trifecta. */
export function assertDisplayIntegrity(row: {
  currentBinding?: SkuAlignCurrentBinding | null;
  displayStatus: DisplayStatus;
  displaySpecName?: string | null;
  displaySpecImage?: string | null;
  displayProcurementPrice?: string | null;
}): DisplayStatus {
  const bound =
    row.currentBinding?.bindingState === "ALIGNED" ||
    row.currentBinding?.bindingState === "MULTI_SOURCE";
  if (!bound) return row.displayStatus;
  const hasSpec =
    Boolean(row.displaySpecName?.trim()) ||
    Boolean(row.displaySpecImage?.trim()) ||
    Boolean(row.displayProcurementPrice?.trim());
  if (!hasSpec && row.displayStatus === "READY") return "ERROR";
  return row.displayStatus;
}

export function isFulfillableBinding(state?: VariantBindingState | null): boolean {
  return state === "ALIGNED" || state === "MULTI_SOURCE";
}

export function isUnresolvedReview(state: VariantReviewState): boolean {
  return state === "SUGGESTED" || state === "UNMAPPED" || state === "NO_SOURCE";
}
