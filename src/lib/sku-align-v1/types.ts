/** SKU Align V1 — binding layer states (fulfillment). */
export type VariantBindingState = "ALIGNED" | "MULTI_SOURCE" | "BLOCKED";

/** Review / suggestion layer — not equivalent to fulfillable binding. */
export type VariantReviewState =
  | "SUGGESTED"
  | "UNMAPPED"
  | "NO_SOURCE"
  | "RESOLVED";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export type SourceRole = "PRIMARY" | "SUPPLEMENT";

export type AlignmentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "SUCCEEDED"
  | "PARTIAL"
  | "FAILED";

export type AlignmentTriggerType =
  | "PRODUCT_BIND_CONFIRMED"
  | "PAGE_ENTER"
  | "CARD_EXPAND"
  | "MANUAL_REFRESH"
  | "ADD_SUPPLEMENT_SOURCE";

export type ProductOrigin = "INTERNAL" | "EXTERNAL";

export type ReviewReasonCode =
  | "TOKEN_MATCH"
  | "SEMANTIC_ALIAS"
  | "NO_SKU_IN_MATRIX"
  | "MULTI_SOURCE_REQUIRED"
  | "SINGLE_SKU_OFFER"
  | "MANUAL_OVERRIDE"
  | "BLOCKED_BY_USER";

export type DisplayStatus = "READY" | "LOADING" | "ERROR";

export type MatchSourceV1 =
  | "IMAGE"
  | "RULE"
  | "MANUAL"
  | "CATALOG"
  | "SEMANTIC";

export interface SkuAlignProductSummary {
  thirdPlatformItemId: string;
  title?: string | null;
  imageUrl?: string | null;
  primaryOfferId?: string | null;
  totalVariants: number;
  alignedVariants: number;
  suggestedVariants: number;
  unmappedVariants: number;
  noSourceVariants: number;
  blockedVariants: number;
  hasMultiSource: boolean;
  lastAlignmentRunStatus?: string | null;
  lastAlignedAt?: string | null;
}

export interface SkuAlignOverview {
  totalProducts: number;
  totalVariants: number;
  unresolvedVariantsCount: number;
  suggestedCount: number;
  unmappedCount: number;
  noSourceCount: number;
  alignedProductsCount: number;
  items: SkuAlignProductSummary[];
}

export interface SkuAlignCurrentBinding {
  offerId?: string | null;
  offerSkuId?: string | null;
  bindingState?: VariantBindingState | null;
  sourceRole?: SourceRole | null;
  matchSource?: MatchSourceV1 | null;
  confidenceLevel?: ConfidenceLevel | null;
  manualLocked?: boolean;
}

export interface SkuAlignSuggestedCandidate {
  offerId?: string | null;
  offerSkuId?: string | null;
  specName?: string | null;
  confidenceLevel?: ConfidenceLevel | null;
  score?: number | null;
}

export interface SkuAlignVariantActions {
  canConfirm: boolean;
  canReselect: boolean;
  canAddSupplementSource: boolean;
  canBlock: boolean;
}

export interface SkuAlignVariantRow {
  thirdPlatformSkuId: string;
  optionText?: string | null;
  shopifyImage?: string | null;
  salePrice?: string | null;
  currentBinding?: SkuAlignCurrentBinding | null;
  reviewState: VariantReviewState;
  suggestedCandidate?: SkuAlignSuggestedCandidate | null;
  displaySpecName?: string | null;
  displaySpecImage?: string | null;
  displayProcurementPrice?: string | null;
  displayStatus: DisplayStatus;
  displayError?: string | null;
  reasonText?: string | null;
  actions: SkuAlignVariantActions;
}

export interface SkuAlignOfferSummary {
  offerId?: string | null;
  detailUrl?: string | null;
  title?: string | null;
  imageUrl?: string | null;
}

export interface SkuAlignProductDetail {
  summary: SkuAlignProductSummary;
  primaryOffer?: SkuAlignOfferSummary | null;
  supplementOffer?: SkuAlignOfferSummary | null;
  variants: SkuAlignVariantRow[];
}

export interface SkuAlignRunRequest {
  shopName: string;
  triggerType: AlignmentTriggerType;
  scopeType: "PRODUCT" | "PRODUCT_BATCH";
  scopeIds: string[];
  forceRefresh?: boolean;
}

export interface SkuAlignRunAccepted {
  runId: number;
  accepted: boolean;
  estimatedScopeCount: number;
}

export interface SkuAlignRunStatus {
  runId: number;
  runStatus: AlignmentRunStatus;
  matchedCount: number;
  suggestedCount: number;
  unmappedCount: number;
  noSourceCount: number;
  blockedCount: number;
  failedCount: number;
  errorSummary?: string | null;
  productSummaries?: SkuAlignProductSummary[];
}

export interface SkuAlignConfirmSuggestionsRequest {
  shopName: string;
  targetScope: "PAGE" | "PRODUCT" | "VARIANTS";
  productIds?: string[];
  variantIds?: string[];
  runId?: number;
}

export interface SkuAlignConfirmResult {
  confirmedCount: number;
}

export interface SkuAlignManualBindRequest {
  shopName: string;
  thirdPlatformItemId: string;
  offerId: string;
  offerSkuId: string;
  sourceRole?: SourceRole;
  reason?: string;
  /** Tangbuy product URL — backend validates skuId via itemGet (same as browser picker). */
  detailUrl?: string | null;
  /** 回写 provenance：当该绑定由灰区 LLM 语义确认驱动时打 SEMANTIC（默认 RULE/MANUAL）。 */
  matchSource?: MatchSourceV1 | null;
}

export interface SkuAlignBlockVariantRequest {
  shopName: string;
  thirdPlatformItemId: string;
  reasonCode?: ReviewReasonCode;
  reasonText?: string;
}

export interface SkuAlignSupplementSourceRequest {
  shopName: string;
  offerId: string;
}

export interface SkuAlignAliasKnowledgeRequest {
  shopName: string;
  sourceText: string;
  targetText: string;
  categoryHint?: string;
  derivedFrom?: "MANUAL_CORRECTION" | "AGENT_CONFIRMATION" | "IMPORT";
}
