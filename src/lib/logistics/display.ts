import type {
  LogisticsDecisionStatus,
  LogisticsLine,
  LogisticsSpeedPreference,
  LogisticsTemplate,
  PackagingType,
  PricingTemplate,
  ProductLogisticsProfile,
  QuoteStatus,
  VariantLogisticsDecision,
} from "@/lib/types";
import type { LogisticsEstimateResult } from "@/lib/api";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import { countryLabel } from "@/lib/logistics/markets";
import { shippingOptionLabel, speedPreferenceToShippingOption } from "@/lib/logistics/template-params";

export type LogisticsFilterMode = "issues" | "all" | "ready";

export const DECISION_LABELS: Record<LogisticsDecisionStatus, string> = {
  pending_sku: "待SKU",
  pending_postal_meta: "待补充",
  ready_for_quote: "可报价",
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
  return profile.decisionStatusCounts?.ready_for_quote ?? 0;
}

export function countIssues(profile: ProductLogisticsProfile): number {
  const c = profile.decisionStatusCounts;
  if (!c) return 0;
  return (
    (c.pending_sku ?? 0) +
    (c.pending_postal_meta ?? 0) +
    (c.restricted ?? 0) +
    (c.needs_review ?? 0)
  );
}

export function hasIssues(profile: ProductLogisticsProfile): boolean {
  return countIssues(profile) > 0;
}

export function filterProfiles(
  profiles: ProductLogisticsProfile[],
  mode: LogisticsFilterMode
): ProductLogisticsProfile[] {
  switch (mode) {
    case "issues":
      return profiles.filter(hasIssues);
    case "ready":
      return profiles.filter((p) => countReady(p) > 0);
    default:
      return profiles;
  }
}

export function filterVariants(
  variants: VariantLogisticsDecision[],
  mode: LogisticsFilterMode
): VariantLogisticsDecision[] {
  switch (mode) {
    case "issues":
      return variants.filter((v) => v.decisionStatus !== "ready_for_quote");
    case "ready":
      return variants.filter((v) => v.decisionStatus === "ready_for_quote");
    default:
      return variants;
  }
}

export function shouldDefaultExpand(
  profile: ProductLogisticsProfile,
  mode: LogisticsFilterMode
): boolean {
  if (mode === "issues") return true;
  if (mode === "all") return hasIssues(profile);
  return true;
}

export function formatTemplateMeta(template: LogisticsTemplate | null): string {
  if (!template) return "未选择模板";
  const packaging = PACKAGING_LABELS[template.packaging] ?? template.packaging;
  const speed = SPEED_LABELS[template.speedPreference] ?? template.speedPreference;
  const ship = shippingOptionLabel(speedPreferenceToShippingOption(template.speedPreference));
  const codes = codesFromSelections(template.markets);
  const markets =
    codes.length > 0
      ? codes.slice(0, 4).map(countryLabel).join("、") +
        (codes.length > 4 ? ` 等${codes.length}国` : "")
      : "未选市场";
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

export function statusBadgeClass(status: LogisticsDecisionStatus): string {
  switch (status) {
    case "pending_sku":
      return "bg-red-50 text-red-700";
    case "pending_postal_meta":
      return "bg-amber-50 text-amber-800";
    case "ready_for_quote":
      return "bg-emerald-50 text-emerald-800";
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
    fee = convertCurrency(fee, pricing);
  }

  const cur = pricing?.targetCurrency?.trim() || line.currency?.trim() || "";
  return `${cur}${fee.toFixed(pricing?.decimals ?? 2)}`;
}

function convertCurrency(fee: number, pricing: PricingTemplate): number {
  let result = fee * pricing.exchangeRate;
  result = result * pricing.multiplier + pricing.addend;

  const decimals = pricing.decimals ?? 2;
  const factor = Math.pow(10, decimals);

  switch (pricing.roundingStrategy) {
    case "UP":
      return Math.ceil(result * factor) / factor;
    case "DOWN":
      return Math.floor(result * factor) / factor;
    case "ROUND":
    default:
      return Math.round(result * factor) / factor;
  }
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
    case "ready_for_quote": {
      if (quoteStatus === "PENDING") {
        return { primary: "报价中…" };
      }
      if (quoteStatus === "FAILED") {
        return { primary: "报价失败" };
      }
      if (!recommended) {
        return { primary: "可报价", secondary: "待拉取线路" };
      }
      const fee = formatFee(recommended, pricing);
      const days =
        recommended.estimatedDays != null
          ? `${recommended.estimatedDays}天`
          : null;
      const alt = alternatives[0];
      const altCount = alternatives.length;
      return {
        primary: recommended.lineName,
        secondary: [fee, days].filter(Boolean).join(" · ") || undefined,
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
        const fee = formatFee(recommended);
        return {
          primary: `AI: ${recommended.lineName}${fee ? ` ~${fee}` : ""}（待确认）`,
        };
      }
      return { primary: "确认邮限后可报价" };
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
    restricted: 0,
    needs_review: 0,
  };
  const manual =
    (c.pending_sku ?? 0) +
    (c.pending_postal_meta ?? 0) +
    (c.restricted ?? 0) +
    (c.needs_review ?? 0);
  return { auto: c.ready_for_quote ?? 0, manual };
}
