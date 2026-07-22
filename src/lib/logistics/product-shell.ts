import type { LogisticsEstimateResult } from "@/lib/api";
import {
  collectQuoteLines,
  effectiveQuoteStatus,
  formatRouteFee,
  isVariantException,
  isVariantUnidentified,
  variantHasQuoteLine,
} from "@/lib/logistics/display";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import type {
  PricingTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

export type MeasureOverride = {
  weightG?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
};

export type ProductShellStatus =
  | "processing"
  | "done"
  | "quoted"
  | "issues"
  | "failed"
  | "partial";

export type SkuRowStatus =
  | "processing"
  | "confirmed"
  | "pending_review"
  | "failed"
  | "pending_sku"
  | "ready";

export interface ProductShellMeta {
  status: ProductShellStatus;
  skuTotal: number;
  confirmedCount: number;
  pendingCount: number;
  failedCount: number;
  summaryLine: string;
  issueLine: string | null;
  defaultExpanded: boolean;
}

export function computeSkuRowStatus(
  variant: VariantLogisticsDecision,
  quoteResult: LogisticsEstimateResult | undefined,
  opts?: { processing?: boolean }
): SkuRowStatus {
  if (opts?.processing) return "processing";
  if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") {
    return "confirmed";
  }
  if (isVariantUnidentified(variant)) return "pending_sku";
  const quoteStatus = effectiveQuoteStatus({
    recommendedLine: quoteResult?.recommendedLine ?? variant.recommendedLine,
    quoteStatus: quoteResult?.quoteStatus ?? variant.quoteStatus,
  });
  if (
    quoteStatus === "FAILED" ||
    quoteResult?.errorMessage ||
    (quoteStatus === "INGESTING" && !quoteResult?.recommendedLine)
  ) {
    return "failed";
  }
  if (isVariantException(variant)) return "pending_review";
  if (variant.decisionStatus === "ready_for_quote") return "ready";
  return "pending_review";
}

export const SKU_ROW_STATUS_LABELS: Record<SkuRowStatus, string> = {
  processing: "正在获取运费预估",
  confirmed: "已确认",
  pending_review: "待确认",
  failed: "失败",
  pending_sku: "缺 SKU",
  ready: "待预估",
};

export function formatVariantIssueHint(
  variant: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): string | null {
  if (isVariantUnidentified(variant)) {
    return "需先完成 SKU 对齐";
  }
  if (quoteResult?.errorMessage?.trim()) {
    const quoteStatus = effectiveQuoteStatus({
      recommendedLine: quoteResult.recommendedLine ?? variant.recommendedLine,
      quoteStatus: quoteResult.quoteStatus ?? variant.quoteStatus,
    });
    if (quoteStatus === "INGESTING") return null;
    const msg = quoteResult.errorMessage.trim();
    return msg.length > 48 ? `${msg.slice(0, 48)}…` : msg;
  }
  const status = effectiveQuoteStatus({
    recommendedLine: quoteResult?.recommendedLine ?? variant.recommendedLine,
    quoteStatus: quoteResult?.quoteStatus ?? variant.quoteStatus,
  });
  if (status === "INGESTING") return null;
  if (status === "FAILED") return "线路报价失败";
  if (variant.decisionReason?.includes("重量") || variant.decisionReason?.includes("尺寸")) {
    return "缺重量或尺寸，请补充后重算";
  }
  if (variant.decisionStatus === "restricted") return "邮限受限，需人工选线";
  if (variant.decisionStatus === "needs_review") return "特殊品类，需人工确认";
  if (variant.decisionStatus === "ready_for_quote") return null;
  if (
    variant.decisionConfirmed ||
    variant.decisionStatus === "confirmed" ||
    variant.decisionReason?.includes("已接受 AI")
  ) {
    return null;
  }
  if (variant.decisionReason?.trim()) {
    const r = variant.decisionReason.trim();
    return r.length > 40 ? `${r.slice(0, 40)}…` : r;
  }
  return null;
}

export function computeProductShellMeta(
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  pricing: PricingTemplate | null | undefined,
  pipeline?: LogisticsPipelineProgress | null,
  pipelineActive?: boolean
): ProductShellMeta {
  const variants = profile.variantDecisions ?? [];
  const skuTotal = variants.length || profile.totalVariants || 0;
  let confirmedCount = 0;
  let quotedCount = 0;
  let pendingCount = 0;
  let failedCount = 0;
  const issueHints: string[] = [];
  let minFee: number | null = null;
  let minFeeLabel: string | null = null;

  const isProcessing =
    Boolean(pipelineActive && pipeline?.currentProductId === profile.thirdPlatformItemId);

  for (const variant of variants) {
    const quote = quoteResults.get(variant.thirdPlatformSkuId);
    const rowStatus = computeSkuRowStatus(variant, quote, {
      processing: isProcessing,
    });

    if (rowStatus === "confirmed") confirmedCount += 1;
    else if (rowStatus === "failed") failedCount += 1;
    else if (rowStatus !== "processing") pendingCount += 1;

    if (variantHasQuoteLine(variant, quote)) quotedCount += 1;

    if (rowStatus === "failed" || rowStatus === "pending_review" || rowStatus === "pending_sku") {
      const hint = formatVariantIssueHint(variant, quote);
      if (hint && !issueHints.includes(hint)) issueHints.push(hint);
    }

    const line = collectQuoteLines(variant, quote)[0];
    if (line?.estimatedFee != null) {
      if (minFee == null || line.estimatedFee < minFee) {
        minFee = line.estimatedFee;
        minFeeLabel = formatRouteFee(line, pricing) ?? null;
      }
    }
  }

  let status: ProductShellStatus = "partial";
  if (isProcessing) status = "processing";
  else if (failedCount > 0) status = "failed";
  else if (confirmedCount >= skuTotal && skuTotal > 0) status = "done";
  else if (quotedCount >= skuTotal && skuTotal > 0) status = "quoted";
  else if (pendingCount > 0 && confirmedCount > 0) status = "issues";
  else if (pendingCount > 0) status = "issues";
  else if (confirmedCount > 0) status = "partial";

  const summaryParts: string[] = [];
  if (confirmedCount > 0) summaryParts.push(`已确认 ${confirmedCount}/${skuTotal}`);
  else if (quotedCount > 0) summaryParts.push(`已报价 ${quotedCount}/${skuTotal}`);
  if (pendingCount > 0) summaryParts.push(`待处理 ${pendingCount}`);
  if (failedCount > 0) summaryParts.push(`失败 ${failedCount}`);
  if (minFeeLabel) summaryParts.push(`最低 ${minFeeLabel}`);

  return {
    status,
    skuTotal,
    confirmedCount,
    pendingCount,
    failedCount,
    summaryLine: summaryParts.join(" · ") || `${skuTotal} 个 SKU`,
    issueLine: issueHints.length > 0 ? issueHints.slice(0, 2).join("；") : null,
    defaultExpanded: isProcessing,
  };
}

export const PRODUCT_SHELL_STATUS_LABELS: Record<ProductShellStatus, string> = {
  processing: "处理中",
  done: "已确认",
  quoted: "已报价",
  issues: "待确认",
  failed: "失败",
  partial: "进行中",
};

export function productShellStatusClass(status: ProductShellStatus): string {
  switch (status) {
    case "processing":
      return "bg-sky-50 text-sky-800 ring-1 ring-sky-200";
    case "done":
      return "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200";
    case "quoted":
      return "bg-brand-soft text-brand-strong ring-1 ring-brand/20";
    case "failed":
      return "bg-red-50 text-red-800 ring-1 ring-red-200";
    case "issues":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200";
    default:
      return "bg-surface-muted text-ink-subtle ring-1 ring-hairline";
  }
}
