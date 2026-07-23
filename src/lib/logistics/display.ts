import type {
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsLine,
  LogisticsSpeedPreference,
  LogisticsTemplate,
  PackagingType,
  PricingTemplate,
  ProductLogisticsProfile,
  QuoteStatus,
  LogisticsTypeCode,
  VariantLogisticsDecision,
} from "@/lib/types";
import type { LogisticsEstimateResult } from "@/lib/api";
import { codesFromSelections, singleCountryCodeFromMarkets } from "@/components/logistics/market-multi-select";
import { countryLabel } from "@/lib/logistics/markets";
import { getPostalLimitLabel, POSTAL_LIMIT_LABELS } from "@/lib/logistics/decision-engine";
import { shippingOptionLabel, speedPreferenceToShippingOption } from "@/lib/logistics/template-params";

export type LogisticsFilterMode =
  | "all"
  | "pending"
  | "needs_attention"
  | "pending_quote"
  | "pending_confirm"
  | "sku_unlinked"
  | "quoted"
  | "exceptions";

/** Map legacy / agent filter ids to current tab ids. */
export function normalizeLogisticsFilterMode(
  mode: string | null | undefined
): LogisticsFilterMode {
  switch (mode) {
    case "pending":
    case "pending_quote":
    case "ready":
    case "pending_confirm":
      return "pending";
    case "needs_attention":
    case "issues":
    case "sku_unlinked":
    case "unidentified":
    case "exceptions":
      return "needs_attention";
    case "quoted":
      return "all";
    default:
      return "all";
  }
}

export type PostalLimitFilter = string | "all";

export function formatPostalLimitBadge(variant: VariantLogisticsDecision): {
  label: string;
  title: string;
  className: string;
} {
  const code = variant.postalLimitClass?.trim() || "";
  const label =
    variant.postalLimitLabel?.trim() ||
    getPostalLimitLabel(code) ||
    (code ? code : "邮限未知");
  const confidence =
    variant.postalLimitConfidence != null
      ? `置信度 ${Math.round(variant.postalLimitConfidence * 100)}%`
      : null;
  return {
    label,
    title: [code ? `邮限代码 ${code}` : null, confidence].filter(Boolean).join(" · "),
    className: code
      ? "bg-violet-50 text-violet-800 ring-1 ring-violet-200"
      : "bg-surface-muted text-ink-subtle ring-1 ring-hairline",
  };
}

export function collectPostalLimitFilterOptions(
  analysis: LogisticsAnalysis | null | undefined
): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const profile of analysis?.productProfiles ?? []) {
    for (const variant of profile.variantDecisions ?? []) {
      const key = variant.postalLimitClass?.trim() || "UNKNOWN";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({
      value,
      label:
        value === "UNKNOWN"
          ? "邮限未知"
          : getPostalLimitLabel(value) ?? POSTAL_LIMIT_LABELS[value] ?? value,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function variantMatchesPostalLimit(
  variant: VariantLogisticsDecision,
  postalFilter: PostalLimitFilter
): boolean {
  if (!postalFilter || postalFilter === "all") return true;
  const code = variant.postalLimitClass?.trim() || "UNKNOWN";
  return code === postalFilter;
}

export const LOGISTICS_PAGE_SIZE = 15;

export interface ActiveHighRiskAlert {
  type: LogisticsTypeCode;
  label: string;
  openSkuCount: number;
  exceptionCount: number;
  pendingConfirmCount: number;
  pendingQuoteCount: number;
}

const CATALOG_HIGH_RISK_TYPES = new Set<LogisticsTypeCode>([
  "FOOD",
  "BATTERY_MAGNETIC",
  "BLADE",
  "OTHER",
]);

/** 仅统计仍有未完成 SKU 的高风险品类（确认后会从列表消失）。 */
export function computeActiveHighRiskAlerts(
  analysis: LogisticsAnalysis | null | undefined,
  quoteResults?: Map<string, LogisticsEstimateResult>
): ActiveHighRiskAlert[] {
  const buckets = new Map<LogisticsTypeCode, ActiveHighRiskAlert>();

  for (const profile of analysis?.productProfiles ?? []) {
    const type = profile.dominantLogisticsType;
    if (!type || !CATALOG_HIGH_RISK_TYPES.has(type)) continue;

    for (const variant of profile.variantDecisions ?? []) {
      if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") {
        continue;
      }

      const quote = quoteResults?.get(variant.thirdPlatformSkuId);
      const hasQuote = variantHasQuoteLine(variant, quote);
      const isException = isVariantException(variant);

      let bucket = buckets.get(type);
      if (!bucket) {
        bucket = {
          type,
          label: profile.dominantLogisticsTypeLabel ?? type,
          openSkuCount: 0,
          exceptionCount: 0,
          pendingConfirmCount: 0,
          pendingQuoteCount: 0,
        };
        buckets.set(type, bucket);
      }
      bucket.openSkuCount += 1;
      if (isException) bucket.exceptionCount += 1;
      else if (hasQuote) bucket.pendingConfirmCount += 1;
      else bucket.pendingQuoteCount += 1;
    }
  }

  return [...buckets.values()].filter((bucket) => bucket.openSkuCount > 0);
}

export function formatActiveHighRiskAlert(alert: ActiveHighRiskAlert): string {
  const name = alert.label || alert.type;
  if (alert.exceptionCount > 0) {
    return `${name}类还有 ${alert.exceptionCount} 个 SKU 邮限/品类待核对`;
  }
  if (alert.pendingConfirmCount > 0) {
    return `${name}类还有 ${alert.pendingConfirmCount} 个 SKU 已有报价，待确认线路`;
  }
  if (alert.pendingQuoteCount > 0) {
    return `${name}类还有 ${alert.pendingQuoteCount} 个 SKU 待运费预估`;
  }
  return `${name}类商品需完成物流确认`;
}

export interface LogisticsPlanMetrics {
  productCount: number;
  variantCount: number;
  /** 尚无线路报价、可拉取报价 */
  pendingQuoteCount: number;
  /** 已有报价、待人工确认 */
  pendingConfirmCount: number;
  /** 邮限/品类等异常，需人工处理 */
  exceptionCount: number;
  /** SKU 未关联货源 */
  skuUnlinkedCount: number;
  /** @deprecated */ autoReadyCount: number;
  /** @deprecated */ aiAutoCount: number;
  quotedCount: number;
  /** @deprecated */ reviewCount: number;
  /** @deprecated */ unidentifiedCount: number;
  /** @deprecated */ pendingCount: number;
  confirmedCount: number;
  completionPercent: number;
}

export function pendingWorkCount(metrics: LogisticsPlanMetrics): number {
  return metrics.pendingQuoteCount + metrics.pendingConfirmCount;
}

export function needsAttentionCount(metrics: LogisticsPlanMetrics): number {
  return metrics.exceptionCount + metrics.skuUnlinkedCount;
}

/** Visible filter tabs — omit empty buckets (always keep「全部」). */
export function buildLogisticsFilterTabs(
  metrics: LogisticsPlanMetrics
): { id: LogisticsFilterMode; label: string; count?: number }[] {
  const tabs: { id: LogisticsFilterMode; label: string; count?: number }[] = [
    { id: "all", label: "全部", count: metrics.variantCount },
  ];
  const pending = pendingWorkCount(metrics);
  if (pending > 0) {
    tabs.push({ id: "pending", label: "待处理", count: pending });
  }
  const attention = needsAttentionCount(metrics);
  if (attention > 0) {
    tabs.push({ id: "needs_attention", label: "需关注", count: attention });
  }
  return tabs;
}

/** Keep filter valid when counts drop (e.g. after auto-accept). */
export function coerceLogisticsFilterMode(
  mode: LogisticsFilterMode,
  metrics: LogisticsPlanMetrics
): LogisticsFilterMode {
  const resolved = normalizeLogisticsFilterMode(mode);
  const available = new Set(buildLogisticsFilterTabs(metrics).map((t) => t.id));
  if (available.has(resolved)) return resolved;
  return "all";
}

export function logisticsFilterExpandsProducts(mode: LogisticsFilterMode): boolean {
  switch (normalizeLogisticsFilterMode(mode)) {
    case "pending":
    case "needs_attention":
      return true;
    default:
      return false;
  }
}

export type VariantCardTone = "auto" | "review" | "unidentified";

const PACKAGING_SUGGESTION: Record<PackagingType, string> = {
  MINIMAL: "极简包装",
  CARTON: "纸箱加固",
};

export const DECISION_LABELS: Record<LogisticsDecisionStatus, string> = {
  pending_sku: "待SKU",
  pending_postal_meta: "待补充",
  ready_for_quote: "可报价",
  confirmed: "已确认",
  restricted: "受限",
  needs_review: "需审核",
};

export const TYPE_OPTIONS = [
  { value: "GENERAL", label: "普货" },
  { value: "APPAREL", label: "服装" },
  { value: "FOOD", label: "食品" },
  { value: "BATTERY_MAGNETIC", label: "带电 / 带磁" },
  { value: "BLADE", label: "刀具" },
  { value: "OTHER", label: "其他特殊品类" },
] as const;

const PACKAGING_LABELS: Record<PackagingType, string> = {
  MINIMAL: "极简",
  CARTON: "纸箱",
};

const SPEED_LABELS: Record<LogisticsSpeedPreference, string> = {
  ECONOMY: "经济",
  FAST: "快速",
  BALANCED: "均衡",
};

export function countReady(profile: ProductLogisticsProfile): number {
  const c = profile.decisionStatusCounts;
  return (c?.ready_for_quote ?? 0) + (c?.confirmed ?? 0);
}

export function countReadyForQuote(profile: ProductLogisticsProfile): number {
  return profile.decisionStatusCounts?.ready_for_quote ?? 0;
}

export function countIssues(profile: ProductLogisticsProfile): number {
  const c = profile.decisionStatusCounts;
  if (!c) return 0;
  return (
    (c.pending_postal_meta ?? 0) +
    (c.restricted ?? 0) +
    (c.needs_review ?? 0)
  );
}

export function countUnidentified(profile: ProductLogisticsProfile): number {
  return profile.decisionStatusCounts?.pending_sku ?? 0;
}

export function hasIssues(profile: ProductLogisticsProfile): boolean {
  return countIssues(profile) > 0 || countUnidentified(profile) > 0;
}

export function variantHasQuoteLine(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): boolean {
  const line = quoteResult?.recommendedLine ?? decision.recommendedLine;
  return Boolean(line?.lineName?.trim() || line?.lineCode?.trim());
}

/** 已有线路报价、尚未确认 — 可批量接受（与「待确认」Tab 口径一致） */
export function variantCanBatchAccept(
  variant: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): boolean {
  if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") {
    return false;
  }
  if (variant.decisionStatus === "pending_sku") return false;
  return variantHasQuoteLine(variant, quoteResult);
}

export function countBatchAcceptableVariants(
  analysis: LogisticsAnalysis | null | undefined,
  quoteResults?: Map<string, LogisticsEstimateResult>
): number {
  let count = 0;
  for (const profile of analysis?.productProfiles ?? []) {
    for (const variant of profile.variantDecisions ?? []) {
      const quote = quoteResults?.get(variant.thirdPlatformSkuId);
      if (variantCanBatchAccept(variant, quote)) count += 1;
    }
  }
  return count;
}

export function collectBatchAcceptableVariants(
  analysis: LogisticsAnalysis | null | undefined,
  quoteResults: Map<string, LogisticsEstimateResult>
): VariantLogisticsDecision[] {
  const out: VariantLogisticsDecision[] = [];
  for (const profile of analysis?.productProfiles ?? []) {
    for (const variant of profile.variantDecisions ?? []) {
      const quote = quoteResults.get(variant.thirdPlatformSkuId);
      if (variantCanBatchAccept(variant, quote)) {
        out.push(variant);
      }
    }
  }
  return out;
}

export function variantMatchesFilter(
  variant: VariantLogisticsDecision,
  mode: LogisticsFilterMode,
  quoteResult?: LogisticsEstimateResult
): boolean {
  const confirmed =
    variant.decisionConfirmed || variant.decisionStatus === "confirmed";
  const hasQuote = variantHasQuoteLine(variant, quoteResult);

  switch (mode) {
    case "pending":
      if (variant.decisionStatus === "pending_sku") return false;
      if (confirmed) return false;
      if (isVariantException(variant)) return false;
      return true;
    case "needs_attention":
      if (variant.decisionStatus === "pending_sku") return true;
      if (confirmed) return false;
      return isVariantException(variant);
    case "sku_unlinked":
      return variant.decisionStatus === "pending_sku";
    case "pending_quote":
      if (variant.decisionStatus === "pending_sku") return false;
      if (confirmed) return false;
      return !hasQuote;
    case "pending_confirm":
      if (variant.decisionStatus === "pending_sku") return false;
      if (confirmed) return false;
      return hasQuote;
    case "quoted":
      return hasQuote;
    case "exceptions":
      if (variant.decisionStatus === "pending_sku") return false;
      if (confirmed) return false;
      return isVariantException(variant);
    default:
      return true;
  }
}

export function filterProfiles(
  profiles: ProductLogisticsProfile[],
  mode: LogisticsFilterMode,
  quoteResults?: Map<string, LogisticsEstimateResult>,
  postalFilter?: PostalLimitFilter
): ProductLogisticsProfile[] {
  if (mode === "all" && (!postalFilter || postalFilter === "all")) return profiles;
  return profiles.filter((profile) =>
    filterVariants(
      profile.variantDecisions ?? [],
      mode,
      quoteResults,
      postalFilter
    ).length > 0
  );
}

export function filterVariants(
  variants: VariantLogisticsDecision[],
  mode: LogisticsFilterMode,
  quoteResults?: Map<string, LogisticsEstimateResult>,
  postalFilter?: PostalLimitFilter
): VariantLogisticsDecision[] {
  let out = variants;
  if (mode !== "all") {
    out = out.filter((variant) =>
      variantMatchesFilter(
        variant,
        mode,
        quoteResults?.get(variant.thirdPlatformSkuId)
      )
    );
  }
  if (postalFilter && postalFilter !== "all") {
    out = out.filter((variant) => variantMatchesPostalLimit(variant, postalFilter));
  }
  return out;
}

export function shouldDefaultExpand(
  profile: ProductLogisticsProfile,
  mode: LogisticsFilterMode
): boolean {
  const resolved = normalizeLogisticsFilterMode(mode);
  if (resolved === "pending" || resolved === "needs_attention") {
    return true;
  }
  if (mode === "all") return hasIssues(profile);
  return true;
}

export function formatTemplateMeta(template: LogisticsTemplate | null): string {
  if (!template) return "未选择模板";
  const packaging = PACKAGING_LABELS[template.packaging] ?? template.packaging;
  const speed = SPEED_LABELS[template.speedPreference] ?? template.speedPreference;
  const ship = shippingOptionLabel(speedPreferenceToShippingOption(template.speedPreference));
  const code = singleCountryCodeFromMarkets(template.markets);
  const markets = code ? countryLabel(code) : "未选市场";
  return `包装: ${packaging} · 时效: ${speed}(${ship}) · 市场: ${markets}`;
}

export function variantStatusLabel(decision: VariantLogisticsDecision): string {
  if (decision.decisionConfirmed) return "已确认";
  return DECISION_LABELS[decision.decisionStatus];
}

export function variantStatusBadgeClass(decision: VariantLogisticsDecision): string {
  if (decision.decisionConfirmed) {
    return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
  return statusBadgeClass(decision.decisionStatus);
}

export function shouldShowDecisionReason(
  decision: VariantLogisticsDecision
): boolean {
  if (decision.decisionConfirmed) return false;
  return decision.decisionStatus !== "ready_for_quote";
}

export function shouldShowAcceptAction(decision: VariantLogisticsDecision): boolean {
  if (decision.decisionConfirmed) return false;
  if (decision.decisionStatus === "pending_sku") return false;
  return true;
}

/** P0: hide manual accept only while pipeline will auto-confirm quote-less ready rows. */
export function shouldShowManualAcceptAction(
  decision: VariantLogisticsDecision,
  opts?: { pipelineActive?: boolean; quoteResult?: LogisticsEstimateResult }
): boolean {
  if (decision.decisionConfirmed) return false;
  if (decision.decisionStatus === "pending_sku") return false;

  const hasQuote = variantHasQuoteLine(decision, opts?.quoteResult);
  if (hasQuote) {
    if (
      decision.decisionStatus === "ready_for_quote" &&
      !isVariantException(decision) &&
      opts?.quoteResult?.recommendedLine &&
      opts.quoteResult.quoteStatus !== "INGESTING"
    ) {
      return false;
    }
    return true;
  }

  if (
    decision.decisionStatus === "ready_for_quote" &&
    !isVariantException(decision)
  ) {
    return false;
  }
  if (opts?.pipelineActive && decision.decisionStatus === "ready_for_quote") {
    return false;
  }
  if (isVariantException(decision)) {
    return shouldShowAcceptAction(decision);
  }
  return false;
}

export function collectProductQuotableVariantIds(
  variants: VariantLogisticsDecision[],
  quoteResults: Map<string, LogisticsEstimateResult>,
  pipelineActive?: boolean
): string[] {
  const ids: string[] = [];
  for (const variant of variants) {
    const quoteResult = quoteResults.get(variant.thirdPlatformSkuId);
    if (
      shouldShowManualQuoteActions(variant, {
        pipelineActive,
        quoteResult,
      })
    ) {
      ids.push(variant.thirdPlatformSkuId);
    }
  }
  return ids;
}

export function productQuoteActionLabel(
  variants: VariantLogisticsDecision[],
  quoteResults: Map<string, LogisticsEstimateResult>,
  pipelineActive?: boolean
): string | null {
  const targets = collectProductQuotableVariantIds(
    variants,
    quoteResults,
    pipelineActive
  );
  if (targets.length === 0) return null;

  const decisions = variants.filter((v) =>
    targets.includes(v.thirdPlatformSkuId)
  );
  const anyFailed = decisions.some((v) =>
    isVariantQuoteFailed(v, quoteResults.get(v.thirdPlatformSkuId))
  );
  const anyQuoted = decisions.some((v) =>
    variantHasQuoteLine(v, quoteResults.get(v.thirdPlatformSkuId))
  );
  if (anyFailed) return "重试报价";
  if (!anyQuoted) return "运费预估";
  return "重新预估";
}

export function isVariantQuoteFailed(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): boolean {
  if (decision.decisionConfirmed || decision.decisionStatus === "confirmed") {
    return false;
  }
  const quoteStatus = effectiveQuoteStatus({
    recommendedLine: quoteResult?.recommendedLine ?? decision.recommendedLine,
    quoteStatus: quoteResult?.quoteStatus ?? decision.quoteStatus,
  });
  if (quoteStatus === "FAILED") return true;
  return Boolean(quoteResult?.errorMessage?.trim());
}

/** P0: hide pull-quote on general ready_for_quote while pipeline handles it. */
export function shouldShowManualQuoteActions(
  decision: VariantLogisticsDecision,
  opts?: { pipelineActive?: boolean; quoteResult?: LogisticsEstimateResult }
): boolean {
  if (!canFetchLogisticsQuote(decision)) return false;
  if (decision.decisionConfirmed || decision.decisionStatus === "confirmed") {
    return variantHasQuoteLine(decision, opts?.quoteResult);
  }
  if (isVariantQuoteFailed(decision, opts?.quoteResult)) return true;
  if (variantHasQuoteLine(decision, opts?.quoteResult)) return false;
  if (
    decision.decisionStatus === "ready_for_quote" &&
    !isVariantException(decision)
  ) {
    return !opts?.pipelineActive;
  }
  if (opts?.pipelineActive && decision.decisionStatus === "ready_for_quote") {
    return false;
  }
  return canFetchLogisticsQuote(decision);
}

export function canFetchLogisticsQuote(decision: VariantLogisticsDecision): boolean {
  return (
    (decision.decisionStatus === "ready_for_quote" ||
      decision.decisionStatus === "confirmed") &&
    Boolean(decision.tangbuySkuId?.trim() && decision.tangbuyGoodsId?.trim())
  );
}

export function quoteActionLabel(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): string {
  if (isVariantQuoteFailed(decision, quoteResult)) return "重试报价";
  if (!variantHasQuoteLine(decision, quoteResult)) return "运费预估";
  return "重新预估";
}

/** @deprecated use quoteActionLabel */
export function fetchQuoteActionLabel(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): string {
  return quoteActionLabel(decision, quoteResult);
}

export function statusBadgeClass(status: LogisticsDecisionStatus): string {
  switch (status) {
    case "pending_sku":
      return "bg-red-50 text-red-700";
    case "pending_postal_meta":
      return "bg-amber-50 text-amber-800";
    case "ready_for_quote":
      return "bg-emerald-50 text-emerald-800";
    case "confirmed":
      return "bg-slate-50 text-slate-700";
    case "restricted":
      return "bg-orange-50 text-orange-800";
    case "needs_review":
      return "bg-yellow-50 text-yellow-800";
    default:
      return "bg-surface-muted text-ink-subtle";
  }
}

function formatFee(
  line?: LogisticsLine | null,
  pricing?: PricingTemplate | null
): string | null {
  if (!line) return null;
  let fee = line.estimatedFee;
  if (fee == null) return null;

  if (pricing) {
    fee = convertCurrency(fee, line, pricing);
  }

  const cur = pricing?.targetCurrency?.trim() || line.currency?.trim() || "USD";
  return formatMoney(fee, cur, pricing?.decimals ?? 2);
}

export function parseTransitDayRange(
  label?: string | null
): { min: number; max: number } | null {
  if (!label?.trim()) return null;
  const cleaned = label.trim().replace(/天/g, "");
  const range = cleaned.match(/(\d+)\s*[-–~]\s*(\d+)/);
  if (range) {
    return { min: Number(range[1]), max: Number(range[2]) };
  }
  const single = cleaned.match(/(\d+)/);
  if (single) {
    const day = Number(single[1]);
    return { min: day, max: day };
  }
  return null;
}

/** 超时必赔基准天数：区间取平均后向下取整，如 12-15 → 13 */
export function computeOvertimeCompensationDays(
  line?: LogisticsLine | null
): number | null {
  if (!line) return null;
  const range = parseTransitDayRange(line.transitTimeLabel);
  if (range) return Math.floor((range.min + range.max) / 2);
  if (line.estimatedDays != null && line.estimatedDays > 0) {
    return line.estimatedDays;
  }
  return null;
}

export function formatTransitLabel(line?: LogisticsLine | null): string | null {
  if (!line) return null;
  if (line.transitTimeLabel?.trim()) {
    const label = line.transitTimeLabel.trim();
    return label.includes("天") ? label : `${label} 天`;
  }
  if (line.estimatedDays != null && line.estimatedDays > 0) {
    return `${line.estimatedDays} 天`;
  }
  return null;
}

export function formatLineFeeOnly(
  line?: LogisticsLine | null,
  pricing?: PricingTemplate | null
): string | null {
  return formatFee(line, pricing);
}

function convertCurrency(fee: number, line: LogisticsLine, pricing: PricingTemplate): number {
  const target = pricing.targetCurrency?.trim().toUpperCase() || "USD";
  const source =
    line.currency?.trim().toUpperCase() ||
    pricing.sourceCurrency?.trim().toUpperCase() ||
    "CNY";
  if (source === target) return fee;

  const rate = pricing.exchangeRate;
  if (!rate || rate <= 0) return fee;

  // Match calculateSalePrice: CNY cost ÷ rate → listing currency.
  if (source === "CNY") return fee / rate;
  return fee;
}

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  NOT_REQUESTED: "未拉取",
  PENDING: "报价中",
  INGESTING: "商品入库中",
  SUCCESS: "已有报价",
  FAILED: "报价失败",
};

/** SUCCESS without a line is treated as not quoted — avoids stale accept-all records. */
export function effectiveQuoteStatus(
  decision: Pick<VariantLogisticsDecision, "recommendedLine" | "quoteStatus">
): QuoteStatus | undefined {
  const hasLine = Boolean(
    decision.recommendedLine?.lineName?.trim() ||
      decision.recommendedLine?.lineCode?.trim()
  );
  const status = decision.quoteStatus;
  if (hasLine) return status ?? "SUCCESS";
  if (status === "SUCCESS") return "NOT_REQUESTED";
  return status;
}

export function formatQuoteStatusLabel(
  decision: Pick<VariantLogisticsDecision, "recommendedLine" | "quoteStatus">
): string | null {
  const status = effectiveQuoteStatus(decision);
  if (!status) return null;
  return QUOTE_STATUS_LABELS[status] ?? status;
}

export function formatMeasureLine(
  decision: Pick<
    VariantLogisticsDecision,
    | "estimatedWeightG"
    | "estimatedLengthCm"
    | "estimatedWidthCm"
    | "estimatedHeightCm"
    | "measureSource"
  >
): string | null {
  const parts: string[] = [];
  if (decision.estimatedWeightG != null) {
    parts.push(`${decision.estimatedWeightG}g`);
  }
  if (
    decision.estimatedLengthCm != null &&
    decision.estimatedWidthCm != null &&
    decision.estimatedHeightCm != null
  ) {
    parts.push(
      `${decision.estimatedLengthCm}×${decision.estimatedWidthCm}×${decision.estimatedHeightCm}cm`
    );
  }
  if (!parts.length) return null;
  return parts.join(" · ");
}

export interface MeasureFieldView {
  weight: string;
  dimensions: string;
}

export function formatMeasureFields(
  decision: Pick<
    VariantLogisticsDecision,
    | "estimatedWeightG"
    | "estimatedLengthCm"
    | "estimatedWidthCm"
    | "estimatedHeightCm"
  >,
  tone: VariantCardTone
): MeasureFieldView {
  const uncertain = tone !== "auto" ? "不确定" : "待补";
  const weight =
    decision.estimatedWeightG != null
      ? `${decision.estimatedWeightG}g`
      : uncertain;
  let dimensions = uncertain;
  if (
    decision.estimatedLengthCm != null &&
    decision.estimatedWidthCm != null &&
    decision.estimatedHeightCm != null
  ) {
    dimensions = `${decision.estimatedLengthCm}×${decision.estimatedWidthCm}×${decision.estimatedHeightCm}cm`;
  } else if (
    decision.estimatedLengthCm != null &&
    decision.estimatedWidthCm != null
  ) {
    dimensions = `${decision.estimatedLengthCm}×${decision.estimatedWidthCm}cm`;
  }
  return { weight, dimensions };
}

export interface ProfitColumnView {
  salePrice: string | null;
  logisticsCost: string | null;
  marginLabel: string;
}

function numericFee(
  line?: LogisticsLine | null,
  pricing?: PricingTemplate | null
): { amount: number; currency: string } | null {
  if (!line || line.estimatedFee == null) return null;
  let fee = line.estimatedFee;
  if (pricing) {
    fee = convertCurrency(fee, line, pricing);
  }
  const currency =
    pricing?.targetCurrency?.trim() || line.currency?.trim() || "USD";
  return { amount: fee, currency: currency.toUpperCase() };
}

function formatMoney(amount: number, currency: string, decimals = 2): string {
  const sym = currency === "USD" ? "$" : currency === "CNY" ? "¥" : "";
  return sym
    ? `${sym}${amount.toFixed(decimals)}`
    : `${currency}${amount.toFixed(decimals)}`;
}

export function formatProfitColumn(
  line: LogisticsLine | null | undefined,
  decision: Pick<
    VariantLogisticsDecision,
    "listingPrice" | "listingCurrency" | "procurementCostCny"
  >,
  pricing?: PricingTemplate | null
): ProfitColumnView {
  const fee = numericFee(line, pricing);
  const currency =
    decision.listingCurrency?.trim().toUpperCase() ??
    fee?.currency ??
    pricing?.targetCurrency?.trim().toUpperCase() ??
    "USD";
  const decimals = pricing?.decimals ?? 2;

  let salePrice = decision.listingPrice ?? null;

  const logisticsAmount = fee?.amount ?? null;
  let procurementInListing: number | null = null;
  if (decision.procurementCostCny != null && pricing?.exchangeRate) {
    procurementInListing = decision.procurementCostCny / pricing.exchangeRate;
  }

  let marginPercent: number | null = null;
  if (salePrice != null && salePrice > 0 && logisticsAmount != null) {
    const totalCost = logisticsAmount + (procurementInListing ?? 0);
    marginPercent = Math.round(((salePrice - totalCost) / salePrice) * 100);
    marginPercent = Math.max(-999, Math.min(999, marginPercent));
  }

  return {
    salePrice:
      salePrice != null && salePrice > 0
        ? `售价 ${formatMoney(salePrice, currency, decimals)}`
        : null,
    logisticsCost:
      logisticsAmount != null
        ? `物流 ${formatMoney(logisticsAmount, currency, decimals)}`
        : null,
    marginLabel:
      marginPercent != null ? `毛利率 ${marginPercent}%` : "毛利率 —",
  };
}

export function collectQuoteLines(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): LogisticsLine[] {
  const { recommended, alternatives } = resolveLines(decision, quoteResult);
  const out: LogisticsLine[] = [];
  if (recommended) out.push(recommended);
  for (const line of alternatives) out.push(line);
  return out;
}

export function logisticsLineKey(line: LogisticsLine): string {
  const code = line.lineCode?.trim() ?? "";
  const name = line.lineName?.trim() ?? "";
  return code || name || "unknown";
}

/** 解析用户选中的线路；默认推荐线（列表第一条）。 */
export function resolveSelectedLogisticsLine(
  lines: LogisticsLine[],
  selectedKey?: string | null
): LogisticsLine | undefined {
  if (!lines.length) return undefined;
  if (selectedKey) {
    const hit = lines.find((line) => logisticsLineKey(line) === selectedKey);
    if (hit) return hit;
  }
  return lines[0];
}

export type LogisticsAcceptQuotePayload = {
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  quoteStatus?: QuoteStatus;
};

/** 构建 accept-decision 请求体：用户选中线路写入 recommendedLine。 */
export function buildAcceptQuotePayload(
  variant: VariantLogisticsDecision,
  quoteResult: LogisticsEstimateResult | undefined,
  selectedLineKey?: string | null
): LogisticsAcceptQuotePayload | undefined {
  const lines = collectQuoteLines(variant, quoteResult);
  const selected = resolveSelectedLogisticsLine(lines, selectedLineKey);
  if (!selected) return undefined;
  const key = logisticsLineKey(selected);
  const alternatives = lines.filter((line) => logisticsLineKey(line) !== key);
  return {
    recommendedLine: selected,
    alternativeLines: alternatives,
    quoteStatus: quoteResult?.quoteStatus ?? variant.quoteStatus,
  };
}

export function formatRouteFee(
  line: LogisticsLine,
  pricing?: PricingTemplate | null
): string {
  const fee = formatFee(line, pricing);
  const transit = formatTransitLabel(line);
  return [fee, transit].filter(Boolean).join(" · ") || "—";
}

function resolveLines(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): {
  recommended?: LogisticsLine | null;
  alternatives: LogisticsLine[];
  quoteStatus?: QuoteStatus;
} {
  if (quoteResult?.recommendedLine || quoteResult?.alternativeLines) {
    return {
      recommended: quoteResult.recommendedLine,
      alternatives: quoteResult.alternativeLines ?? [],
      quoteStatus: quoteResult.quoteStatus,
    };
  }
  return {
    recommended: decision.recommendedLine,
    alternatives: decision.alternativeLines ?? [],
    quoteStatus: decision.quoteStatus,
  };
}

export interface QuoteColumnView {
  primary: string;
  secondary?: string;
  tertiary?: string;
}

export function buildQuoteColumn(
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult,
  pricing?: PricingTemplate | null
): QuoteColumnView {
  const { recommended, alternatives, quoteStatus } = resolveLines(
    decision,
    quoteResult
  );

  switch (decision.decisionStatus) {
    case "pending_sku":
      return { primary: "—" };
    case "pending_postal_meta":
      return { primary: "缺数据，无法报价" };
    case "confirmed": {
      if (!recommended) {
        const status = effectiveQuoteStatus(decision);
        return {
          primary: "决策已确认",
          secondary:
            status === "FAILED"
              ? "线路报价失败 · 请重新拉取"
              : "尚未拉取线路报价",
        };
      }
      const fee = formatFee(recommended, pricing);
      const transit = formatTransitLabel(recommended);
      const alt = alternatives[0];
      const altCount = alternatives.length;
      return {
        primary: recommended.lineName,
        secondary: [fee, transit].filter(Boolean).join(" · ") || undefined,
        tertiary: alt
          ? `备选: ${alt.lineName}${formatFee(alt, pricing) ? ` ${formatFee(alt, pricing)}` : ""}${
              altCount > 1 ? ` · +${altCount - 1}条` : ""
            }`
          : altCount > 0
            ? `+${altCount}条备选`
            : undefined,
      };
    }
    case "ready_for_quote": {
      if (quoteStatus === "PENDING") {
        return { primary: "报价中…" };
      }
      if (quoteStatus === "INGESTING") {
        return {
          primary: "商品入库中",
          secondary: "同步完成后可重试运费预估",
        };
      }
      if (quoteStatus === "FAILED") {
        return {
          primary: "报价失败",
          secondary: quoteResult?.errorMessage?.trim() || undefined,
        };
      }
      if (!recommended) {
        return { primary: "可报价", secondary: "待拉取线路" };
      }
      const fee = formatFee(recommended, pricing);
      const transit = formatTransitLabel(recommended);
      const alt = alternatives[0];
      const altCount = alternatives.length;
      return {
        primary: recommended.lineName,
        secondary: [fee, transit].filter(Boolean).join(" · ") || undefined,
        tertiary: alt
          ? `备选: ${alt.lineName}${formatFee(alt, pricing) ? ` ${formatFee(alt, pricing)}` : ""}${
              altCount > 1 ? ` · +${altCount - 1}条` : ""
            }`
          : altCount > 0
            ? `+${altCount}条备选`
            : undefined,
      };
    }
    case "needs_review":
    case "restricted": {
      if (recommended) {
        const fee = formatFee(recommended, pricing);
        return {
          primary: `${recommended.lineName}${fee ? ` · ${fee}` : ""}`,
          secondary: "线路待确认",
        };
      }
      if (decision.decisionStatus === "restricted") {
        return { primary: "邮限受限", secondary: "请确认品类后重试报价" };
      }
      return { primary: "待拉取线路", secondary: decision.decisionReason?.trim() };
    }
    default:
      return { primary: decision.decisionStatus };
  }
}

export function countAutoVsManual(
  counts: Record<LogisticsDecisionStatus, number> | undefined
): { auto: number; manual: number } {
  const c = counts ?? {
    pending_sku: 0,
    pending_postal_meta: 0,
    ready_for_quote: 0,
    confirmed: 0,
    restricted: 0,
    needs_review: 0,
  };
  const manual =
    (c.pending_sku ?? 0) +
    (c.pending_postal_meta ?? 0) +
    (c.restricted ?? 0) +
    (c.needs_review ?? 0);
  return { auto: (c.ready_for_quote ?? 0) + (c.confirmed ?? 0), manual };
}

export function isVariantException(decision: VariantLogisticsDecision): boolean {
  if (decision.decisionConfirmed) return false;
  return (
    decision.decisionStatus === "pending_postal_meta" ||
    decision.decisionStatus === "restricted" ||
    decision.decisionStatus === "needs_review"
  );
}

export function isVariantUnidentified(decision: VariantLogisticsDecision): boolean {
  return decision.decisionStatus === "pending_sku";
}

export function variantCardTone(decision: VariantLogisticsDecision): VariantCardTone {
  if (isVariantUnidentified(decision)) return "unidentified";
  if (isVariantException(decision)) return "review";
  return "auto";
}

export function variantCardBadge(decision: VariantLogisticsDecision): {
  label: string;
  className: string;
} {
  const tone = variantCardTone(decision);
  if (decision.decisionConfirmed) {
    return { label: "已确认", className: "bg-slate-100 text-slate-600" };
  }
  switch (tone) {
    case "review":
      return { label: "待确认", className: "bg-amber-100 text-amber-800" };
    case "unidentified":
      return { label: "SKU未关联", className: "bg-surface-muted text-ink-subtle" };
    default:
      return { label: "待报价", className: "bg-brand-soft text-brand-strong" };
  }
}

export function isVariantAiPlanned(decision: VariantLogisticsDecision): boolean {
  return (
    decision.decisionStatus === "ready_for_quote" || decision.decisionConfirmed === true
  );
}

export function productHasExceptions(profile: ProductLogisticsProfile): boolean {
  return (profile.variantDecisions ?? []).some(isVariantException);
}

export function computeLogisticsPlanMetrics(
  analysis: LogisticsAnalysis | null | undefined,
  quoteResults?: Map<string, LogisticsEstimateResult>
): LogisticsPlanMetrics {
  const profiles = analysis?.productProfiles ?? [];
  const variantCount = analysis?.totalVariants ?? 0;
  const confirmedCount = analysis?.decisionStatusCounts?.confirmed ?? 0;

  let pendingQuoteCount = 0;
  let pendingConfirmCount = 0;
  let skuUnlinkedCount = 0;
  let exceptionCount = 0;
  let quotedCount = 0;

  for (const profile of profiles) {
    for (const variant of profile.variantDecisions ?? []) {
      const quote = quoteResults?.get(variant.thirdPlatformSkuId);
      const confirmed =
        variant.decisionConfirmed || variant.decisionStatus === "confirmed";
      const hasQuote = variantHasQuoteLine(variant, quote);

      if (variant.decisionStatus === "pending_sku") {
        skuUnlinkedCount += 1;
      } else if (confirmed) {
        if (hasQuote) quotedCount += 1;
      } else if (hasQuote) {
        pendingConfirmCount += 1;
        quotedCount += 1;
      } else {
        pendingQuoteCount += 1;
      }
      if (!confirmed && isVariantException(variant)) {
        exceptionCount += 1;
      }
    }
  }

  const completionPercent =
    variantCount > 0 ? Math.round((quotedCount / variantCount) * 100) : 0;

  return {
    productCount: profiles.length,
    variantCount,
    pendingQuoteCount,
    pendingConfirmCount,
    exceptionCount,
    skuUnlinkedCount,
    autoReadyCount: pendingQuoteCount,
    aiAutoCount: pendingQuoteCount,
    quotedCount,
    reviewCount: pendingConfirmCount,
    unidentifiedCount: skuUnlinkedCount,
    pendingCount: pendingQuoteCount + pendingConfirmCount + skuUnlinkedCount,
    confirmedCount,
    completionPercent,
  };
}

export function formatPackagingSuggestion(
  template: LogisticsTemplate | null | undefined
): string {
  if (!template) return "未配置";
  return PACKAGING_SUGGESTION[template.packaging] ?? template.packaging;
}

export function formatProfitImpact(
  line: LogisticsLine | null | undefined,
  pricing?: PricingTemplate | null
): string | null {
  const fee = formatFee(line, pricing);
  if (!fee) return null;
  return `-${fee} 履约成本`;
}

export function summarizeProductPlan(
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  pricing?: PricingTemplate | null
): string {
  const variants = profile.variantDecisions ?? [];
  const ready = variants.filter(isVariantAiPlanned).length;
  const line = variants
    .map((v) => {
      const quote = buildQuoteColumn(v, quoteResults.get(v.thirdPlatformSkuId), pricing);
      return quote.primary;
    })
    .find((p) => p && p !== "—" && p !== "可报价" && !p.startsWith("缺"));
  return `${ready}/${variants.length} SKU 已规划${line ? ` · ${line}` : ""}`;
}
