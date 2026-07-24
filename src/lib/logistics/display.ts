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
import { userFacingQuoteErrorMessage } from "@/lib/logistics/estimate-goods-block";
import { codesFromSelections, singleCountryCodeFromMarkets } from "@/components/logistics/market-multi-select";
import type { Locale } from "@/i18n/config";
import { localizedCountryLabel } from "@/lib/logistics/markets";
import { getPostalLimitLabel, POSTAL_LIMIT_LABELS } from "@/lib/logistics/decision-engine";

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
    case "pending_quote":
      return "pending_quote";
    case "pending_confirm":
      return "pending_confirm";
    case "pending":
    case "ready":
      return "pending_quote";
    case "needs_attention":
    case "issues":
    case "sku_unlinked":
    case "unidentified":
    case "exceptions":
      return "needs_attention";
    case "quoted":
      return "all";
    case "all":
      return "all";
    default:
      return "all";
  }
}

/** Map variant decision status to the closest list filter tab. */
export function decisionStatusToFilterMode(
  status: LogisticsDecisionStatus
): LogisticsFilterMode {
  switch (status) {
    case "pending_sku":
    case "pending_postal_meta":
    case "needs_review":
    case "restricted":
      return "needs_attention";
    case "ready_for_quote":
      return "pending_quote";
    case "confirmed":
      return "all";
    default:
      return "all";
  }
}

export type PostalLimitFilter = string | "all";

export type LogisticsTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

export function localizedPostalLimitLabel(
  t: LogisticsTranslate,
  code: string | null | undefined
): string {
  if (!code?.trim()) return t("logisticsDisplay.postalLimit.unknown");
  const key = `logisticsDisplay.postalLimit.${code.trim()}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return getPostalLimitLabel(code) ?? code.trim();
}

export function formatPostalLimitBadge(
  t: LogisticsTranslate,
  variant: VariantLogisticsDecision
): {
  label: string;
  title: string;
  className: string;
} {
  const code = variant.postalLimitClass?.trim() || "";
  const label = code
    ? localizedPostalLimitLabel(t, code)
    : variant.postalLimitLabel?.trim() ||
      t("logisticsDisplay.postalLimit.unknown");
  const confidence =
    variant.postalLimitConfidence != null
      ? t("logisticsDisplay.postalLimit.confidence", {
          percent: Math.round(variant.postalLimitConfidence * 100),
        })
      : null;
  return {
    label,
    title: [code ? t("logisticsDisplay.postalLimit.code", { code }) : null, confidence]
      .filter(Boolean)
      .join(" · "),
    className: code
      ? "bg-violet-50 text-violet-800 ring-1 ring-violet-200"
      : "bg-surface-muted text-ink-subtle ring-1 ring-hairline",
  };
}

export function collectPostalLimitFilterOptions(
  t: LogisticsTranslate,
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
          ? t("logisticsDisplay.postalLimit.unknown")
          : localizedPostalLimitLabel(t, value),
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

export function formatActiveHighRiskAlert(
  t: LogisticsTranslate,
  alert: ActiveHighRiskAlert
): string {
  const name = alert.label || alert.type;
  if (alert.exceptionCount > 0) {
    return t("logisticsDisplay.highRisk.exceptions", {
      name,
      count: alert.exceptionCount,
    });
  }
  if (alert.pendingConfirmCount > 0) {
    return t("logisticsDisplay.highRisk.pendingConfirm", {
      name,
      count: alert.pendingConfirmCount,
    });
  }
  if (alert.pendingQuoteCount > 0) {
    return t("logisticsDisplay.highRisk.pendingQuote", {
      name,
      count: alert.pendingQuoteCount,
    });
  }
  return t("logisticsDisplay.highRisk.default", { name });
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

export function availableLogisticsFilterModes(
  metrics: LogisticsPlanMetrics
): LogisticsFilterMode[] {
  const modes: LogisticsFilterMode[] = ["all"];
  if (metrics.pendingQuoteCount > 0) modes.push("pending_quote");
  if (metrics.pendingConfirmCount > 0) modes.push("pending_confirm");
  if (needsAttentionCount(metrics) > 0) modes.push("needs_attention");
  return modes;
}

/** Visible filter tabs — omit empty buckets (always keep「全部」). */
export function buildLogisticsFilterTabs(
  t: LogisticsTranslate,
  metrics: LogisticsPlanMetrics
): { id: LogisticsFilterMode; label: string; count?: number }[] {
  const tabs: { id: LogisticsFilterMode; label: string; count?: number }[] = [
    { id: "all", label: t("logisticsUi.filterAll"), count: metrics.variantCount },
  ];
  if (metrics.pendingQuoteCount > 0) {
    tabs.push({
      id: "pending_quote",
      label: t("logisticsUi.filterPendingQuote"),
      count: metrics.pendingQuoteCount,
    });
  }
  if (metrics.pendingConfirmCount > 0) {
    tabs.push({
      id: "pending_confirm",
      label: t("logisticsUi.filterPendingConfirm"),
      count: metrics.pendingConfirmCount,
    });
  }
  const attention = needsAttentionCount(metrics);
  if (attention > 0) {
    tabs.push({
      id: "needs_attention",
      label: t("logisticsUi.filterNeedsAttention"),
      count: attention,
    });
  }
  return tabs;
}

/** Keep filter valid when counts drop (e.g. after auto-accept). */
export function coerceLogisticsFilterMode(
  mode: LogisticsFilterMode,
  metrics: LogisticsPlanMetrics
): LogisticsFilterMode {
  const resolved = normalizeLogisticsFilterMode(mode);
  const available = new Set(availableLogisticsFilterModes(metrics));
  if (available.has(resolved)) return resolved;
  if (resolved === "pending_quote" && available.has("pending_confirm")) {
    return "pending_confirm";
  }
  if (resolved === "pending_confirm" && available.has("pending_quote")) {
    return "pending_quote";
  }
  return "all";
}

export function logisticsFilterExpandsProducts(mode: LogisticsFilterMode): boolean {
  switch (normalizeLogisticsFilterMode(mode)) {
    case "pending_quote":
    case "pending_confirm":
    case "needs_attention":
      return true;
    default:
      return false;
  }
}

export type VariantCardTone = "auto" | "review" | "unidentified";

/** @deprecated Use decisionStatusLabel(t, status) in UI. */
export const DECISION_LABELS: Record<LogisticsDecisionStatus, string> = {
  pending_sku: "待SKU",
  pending_postal_meta: "待补充",
  ready_for_quote: "可报价",
  confirmed: "已确认",
  restricted: "受限",
  needs_review: "需审核",
};

/** @deprecated Use buildTypeOptions(t) in UI. */
export const TYPE_OPTIONS = [
  { value: "GENERAL", label: "普货" },
  { value: "APPAREL", label: "服装" },
  { value: "FOOD", label: "食品" },
  { value: "BATTERY_MAGNETIC", label: "带电 / 带磁" },
  { value: "BLADE", label: "刀具" },
  { value: "OTHER", label: "其他特殊品类" },
] as const;

/** @deprecated Use packagingLabel(t, packaging) in UI. */
const PACKAGING_LABELS: Record<PackagingType, string> = {
  MINIMAL: "极简",
  CARTON: "纸箱",
};

/** @deprecated Use speedLabel(t, speed) in UI. */
const SPEED_LABELS: Record<LogisticsSpeedPreference, string> = {
  ECONOMY: "经济",
  FAST: "快速",
  BALANCED: "均衡",
};

export function decisionStatusLabel(
  t: LogisticsTranslate,
  status: LogisticsDecisionStatus
): string {
  return t(`logisticsDisplay.decisionStatus.${status}`);
}

export function packagingLabel(
  t: LogisticsTranslate,
  packaging: PackagingType
): string {
  return t(`logisticsDisplay.packaging.${packaging.toLowerCase()}`);
}

export function packagingSuggestionLabel(
  t: LogisticsTranslate,
  packaging: PackagingType
): string {
  return t(`logisticsDisplay.packagingSuggestion.${packaging.toLowerCase()}`);
}

export function speedLabel(
  t: LogisticsTranslate,
  speed: LogisticsSpeedPreference
): string {
  return t(`logisticsDisplay.speed.${speed.toLowerCase()}`);
}

export function buildTypeOptions(t: LogisticsTranslate) {
  return [
    { value: "GENERAL", label: t("logisticsDisplay.type.general") },
    { value: "APPAREL", label: t("logisticsDisplay.type.apparel") },
    { value: "FOOD", label: t("logisticsDisplay.type.food") },
    { value: "BATTERY_MAGNETIC", label: t("logisticsDisplay.type.batteryMagnetic") },
    { value: "BLADE", label: t("logisticsDisplay.type.blade") },
    { value: "OTHER", label: t("logisticsDisplay.type.other") },
  ] as const;
}

export function quoteStatusLabel(
  t: LogisticsTranslate,
  status: QuoteStatus
): string {
  return t(`logisticsDisplay.quoteStatus.${status.toLowerCase()}`);
}

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
  if (
    resolved === "pending_quote" ||
    resolved === "pending_confirm" ||
    resolved === "needs_attention"
  ) {
    return true;
  }
  if (mode === "all") return hasIssues(profile);
  return true;
}

export function formatTemplateMeta(
  t: LogisticsTranslate,
  template: LogisticsTemplate | null,
  locale?: Locale
): string {
  if (!template) return t("logisticsDisplay.templateMeta.noTemplate");
  const packaging = packagingLabel(t, template.packaging);
  const speed = speedLabel(t, template.speedPreference);
  const ship = speedLabel(t, template.speedPreference);
  const code = singleCountryCodeFromMarkets(template.markets);
  const markets = code
    ? localizedCountryLabel(code, locale ?? "zh")
    : t("logisticsDisplay.templateMeta.noMarket");
  return t("logisticsDisplay.templateMeta.summary", {
    packaging,
    speed,
    ship,
    markets,
  });
}

export function variantStatusLabel(
  t: LogisticsTranslate,
  decision: VariantLogisticsDecision
): string {
  if (decision.decisionConfirmed) return t("logisticsDisplay.decisionStatus.confirmed");
  return decisionStatusLabel(t, decision.decisionStatus);
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
  t: LogisticsTranslate,
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
  if (anyFailed) return t("logisticsDisplay.quoteAction.retry");
  if (!anyQuoted) return t("logisticsDisplay.quoteAction.estimate");
  return t("logisticsDisplay.quoteAction.reestimate");
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
  t: LogisticsTranslate,
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): string {
  if (isVariantQuoteFailed(decision, quoteResult)) {
    return t("logisticsDisplay.quoteAction.retry");
  }
  if (!variantHasQuoteLine(decision, quoteResult)) {
    return t("logisticsDisplay.quoteAction.estimate");
  }
  return t("logisticsDisplay.quoteAction.reestimate");
}

/** @deprecated use quoteActionLabel(t, ...) */
export function fetchQuoteActionLabel(
  t: LogisticsTranslate,
  decision: VariantLogisticsDecision,
  quoteResult?: LogisticsEstimateResult
): string {
  return quoteActionLabel(t, decision, quoteResult);
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

export function formatTransitLabel(
  t: LogisticsTranslate,
  line?: LogisticsLine | null
): string | null {
  if (!line) return null;
  if (line.transitTimeLabel?.trim()) {
    const label = line.transitTimeLabel.trim();
    return label.includes("天") || /day/i.test(label)
      ? label
      : t("logisticsDisplay.transit.days", { days: label });
  }
  if (line.estimatedDays != null && line.estimatedDays > 0) {
    return t("logisticsDisplay.transit.days", { days: line.estimatedDays });
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

/** @deprecated Use quoteStatusLabel(t, status) in UI. */
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
  t: LogisticsTranslate,
  decision: Pick<VariantLogisticsDecision, "recommendedLine" | "quoteStatus">
): string | null {
  const status = effectiveQuoteStatus(decision);
  if (!status) return null;
  return quoteStatusLabel(t, status);
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
  t: LogisticsTranslate,
  decision: Pick<
    VariantLogisticsDecision,
    | "estimatedWeightG"
    | "estimatedLengthCm"
    | "estimatedWidthCm"
    | "estimatedHeightCm"
  >,
  tone: VariantCardTone
): MeasureFieldView {
  const uncertain =
    tone !== "auto"
      ? t("logisticsDisplay.measure.uncertain")
      : t("logisticsDisplay.measure.pending");
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
  t: LogisticsTranslate,
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
        ? t("logisticsDisplay.profit.salePrice", {
            amount: formatMoney(salePrice, currency, decimals),
          })
        : null,
    logisticsCost:
      logisticsAmount != null
        ? t("logisticsDisplay.profit.logisticsCost", {
            amount: formatMoney(logisticsAmount, currency, decimals),
          })
        : null,
    marginLabel:
      marginPercent != null
        ? t("logisticsDisplay.profit.margin", { percent: marginPercent })
        : t("logisticsDisplay.profit.marginEmpty"),
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
  t: LogisticsTranslate,
  line: LogisticsLine,
  pricing?: PricingTemplate | null
): string {
  const fee = formatFee(line, pricing);
  const transit = formatTransitLabel(t, line);
  return [fee, transit].filter(Boolean).join(" · ") || t("logisticsDisplay.common.dash");
}

function formatQuoteAlternativeTertiary(
  t: LogisticsTranslate,
  alt: LogisticsLine,
  altCount: number,
  fee: string | null
): string {
  const altFee = fee ? ` ${fee}` : "";
  const extra =
    altCount > 1
      ? t("logisticsDisplay.quoteColumn.altMore", { count: altCount - 1 })
      : "";
  return t("logisticsDisplay.quoteColumn.altLine", {
    name: alt.lineName,
    fee: altFee,
    extra,
  });
}

function formatQuoteAlternativesTertiary(
  t: LogisticsTranslate,
  alt: LogisticsLine | undefined,
  altCount: number,
  fee: string | null
): string | undefined {
  if (alt) return formatQuoteAlternativeTertiary(t, alt, altCount, fee);
  if (altCount > 0) {
    return t("logisticsDisplay.quoteColumn.altCount", { count: altCount });
  }
  return undefined;
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
  t: LogisticsTranslate,
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
      return { primary: t("logisticsDisplay.common.dash") };
    case "pending_postal_meta":
      return { primary: t("logisticsDisplay.quoteColumn.missingData") };
    case "confirmed": {
      if (!recommended) {
        const status = effectiveQuoteStatus(decision);
        return {
          primary: t("logisticsDisplay.quoteColumn.decisionConfirmed"),
          secondary:
            status === "FAILED"
              ? t("logisticsDisplay.quoteColumn.quoteFailedRetry")
              : t("logisticsDisplay.quoteColumn.quoteNotFetched"),
        };
      }
      const fee = formatFee(recommended, pricing);
      const transit = formatTransitLabel(t, recommended);
      const alt = alternatives[0];
      const altCount = alternatives.length;
      return {
        primary: recommended.lineName,
        secondary: [fee, transit].filter(Boolean).join(" · ") || undefined,
        tertiary: formatQuoteAlternativesTertiary(
          t,
          alt,
          altCount,
          formatFee(alt, pricing)
        ),
      };
    }
    case "ready_for_quote": {
      if (quoteStatus === "PENDING") {
        return { primary: t("logisticsDisplay.quoteColumn.quoting") };
      }
      if (quoteStatus === "INGESTING") {
        return {
          primary: t("logisticsDisplay.quoteColumn.ingesting"),
          secondary: t("logisticsDisplay.quoteColumn.ingestingHint"),
        };
      }
      if (quoteStatus === "FAILED") {
        return {
          primary: t("logisticsDisplay.quoteColumn.quoteFailed"),
          secondary:
            userFacingQuoteErrorMessage(quoteResult?.errorMessage) || undefined,
        };
      }
      if (!recommended) {
        return {
          primary: t("logisticsDisplay.quoteColumn.ready"),
          secondary: t("logisticsDisplay.quoteColumn.awaitingFetch"),
        };
      }
      const fee = formatFee(recommended, pricing);
      const transit = formatTransitLabel(t, recommended);
      const alt = alternatives[0];
      const altCount = alternatives.length;
      return {
        primary: recommended.lineName,
        secondary: [fee, transit].filter(Boolean).join(" · ") || undefined,
        tertiary: formatQuoteAlternativesTertiary(
          t,
          alt,
          altCount,
          formatFee(alt, pricing)
        ),
      };
    }
    case "needs_review":
    case "restricted": {
      if (recommended) {
        const fee = formatFee(recommended, pricing);
        return {
          primary: `${recommended.lineName}${fee ? ` · ${fee}` : ""}`,
          secondary: t("logisticsDisplay.quoteColumn.awaitingConfirm"),
        };
      }
      if (decision.decisionStatus === "restricted") {
        return {
          primary: t("logisticsDisplay.quoteColumn.restricted"),
          secondary: t("logisticsDisplay.quoteColumn.restrictedHint"),
        };
      }
      return {
        primary: t("logisticsDisplay.quoteColumn.awaitingFetchLine"),
        secondary: decision.decisionReason?.trim(),
      };
    }
    default:
      return { primary: decisionStatusLabel(t, decision.decisionStatus) };
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

export function variantCardBadge(
  t: LogisticsTranslate,
  decision: VariantLogisticsDecision
): {
  label: string;
  className: string;
} {
  const tone = variantCardTone(decision);
  if (decision.decisionConfirmed) {
    return {
      label: t("logisticsDisplay.variantBadge.confirmed"),
      className: "bg-slate-100 text-slate-600",
    };
  }
  switch (tone) {
    case "review":
      return {
        label: t("logisticsDisplay.variantBadge.pendingReview"),
        className: "bg-amber-100 text-amber-800",
      };
    case "unidentified":
      return {
        label: t("logisticsDisplay.variantBadge.unlinked"),
        className: "bg-surface-muted text-ink-subtle",
      };
    default:
      return {
        label: t("logisticsDisplay.variantBadge.pendingQuote"),
        className: "bg-brand-soft text-brand-strong",
      };
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
  t: LogisticsTranslate,
  template: LogisticsTemplate | null | undefined
): string {
  if (!template) return t("logisticsDisplay.packagingSuggestion.notConfigured");
  return packagingSuggestionLabel(t, template.packaging);
}

export function formatProfitImpact(
  t: LogisticsTranslate,
  line: LogisticsLine | null | undefined,
  pricing?: PricingTemplate | null
): string | null {
  const fee = formatFee(line, pricing);
  if (!fee) return null;
  return t("logisticsDisplay.profit.fulfillmentCost", { fee });
}

export function summarizeProductPlan(
  t: LogisticsTranslate,
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  pricing?: PricingTemplate | null
): string {
  const variants = profile.variantDecisions ?? [];
  const ready = variants.filter(isVariantAiPlanned).length;
  const line = variants
    .map((v) => collectQuoteLines(v, quoteResults.get(v.thirdPlatformSkuId))[0]?.lineName?.trim())
    .find(Boolean);
  return t("logisticsDisplay.summarizeProductPlan", {
    ready,
    total: variants.length,
    lineSuffix: line ? ` · ${line}` : "",
  });
}
