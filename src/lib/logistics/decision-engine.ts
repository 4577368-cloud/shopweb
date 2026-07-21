import type {
  LogisticsDecisionStatus,
  LogisticsTypeCode,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

export const DEFAULT_DECISION_COUNTS: Record<LogisticsDecisionStatus, number> = {
  pending_sku: 0,
  pending_postal_meta: 0,
  ready_for_quote: 0,
  restricted: 0,
  needs_review: 0,
};

export const POSTAL_LIMIT_LABELS: Record<string, string> = {
  GENERAL: "普货",
  BATTERY_BUILT_IN: "内置电池",
  BATTERY_EXTERNAL: "配套电池",
  MAGNETIC: "带磁",
  LIQUID: "液体",
  POWDER: "粉末",
  FOOD: "食品",
  BLADE: "刀具",
  FRAGILE: "易碎",
  OTHER: "其他",
};

export function getPostalLimitLabel(
  postalClass?: string | null
): string | undefined {
  if (!postalClass) return undefined;
  return POSTAL_LIMIT_LABELS[postalClass] || postalClass;
}

const NEEDS_REVIEW_TYPES: Set<LogisticsTypeCode> = new Set([
  "FOOD",
  "BLADE",
  "OTHER",
]);

export function computeVariantDecisionStatus(
  variant: Partial<VariantLogisticsDecision> & {
    tangbuySkuId?: string | null;
    tangbuyGoodsId?: string | null;
  }
): { status: LogisticsDecisionStatus; reason?: string } {
  if (!variant.tangbuySkuId || !variant.tangbuyGoodsId) {
    return {
      status: "pending_sku",
      reason: "缺少 skuId 或 goodsId，需先完成 SKU 对齐",
    };
  }

  if (!variant.postalLimitClass) {
    return {
      status: "pending_postal_meta",
      reason: "缺少邮限分类",
    };
  }

  if (variant.estimatedWeightG == null || variant.estimatedVolumeCm3 == null) {
    return {
      status: "pending_postal_meta",
      reason: "缺少预估重量或体积",
    };
  }

  if (variant.postalLimitClass === "RESTRICTED") {
    return {
      status: "restricted",
      reason: "当前已知规则下受限，需进一步线路确认或人工处理",
    };
  }

  if (NEEDS_REVIEW_TYPES.has(variant.postalLimitClass as LogisticsTypeCode)) {
    return {
      status: "needs_review",
      reason: "特殊品类，需人工审核确认",
    };
  }

  return {
    status: "ready_for_quote",
    reason: "数据完整，可发起报价",
  };
}

export function aggregateDecisionCounts(
  variants: VariantLogisticsDecision[]
): Record<LogisticsDecisionStatus, number> {
  const counts: Record<LogisticsDecisionStatus, number> = {
    ...DEFAULT_DECISION_COUNTS,
  };
  for (const v of variants) {
    counts[v.decisionStatus] = (counts[v.decisionStatus] ?? 0) + 1;
  }
  return counts;
}

export interface LegacyLogisticsProfile {
  thirdPlatformItemId: string;
  title?: string | null;
  logisticsType: LogisticsTypeCode;
  logisticsTypeLabel: string;
  confidence: number;
  signals: string[];
  classifySource: string;
  reviewed: boolean;
}

export interface LegacyLogisticsAnalysis {
  shopName: string;
  status: string;
  analyzedCount: number;
  skippedUnboundCount: number;
  distribution: Array<{ type: LogisticsTypeCode; label: string; count: number }>;
  highRiskTypes: LogisticsTypeCode[];
  profiles: LegacyLogisticsProfile[];
}

export function transformLegacyAnalysis(
  legacy: LegacyLogisticsAnalysis
): {
  productProfiles: ProductLogisticsProfile[];
  totalVariants: number;
  decisionStatusCounts: Record<LogisticsDecisionStatus, number>;
  highRiskTypes: LogisticsTypeCode[];
} {
  const productProfiles: ProductLogisticsProfile[] = (
    legacy.profiles ?? []
  ).map((p) => transformLegacyProfile(p));

  const totalVariants = productProfiles.reduce(
    (sum, p) => sum + p.totalVariants,
    0
  );

  const decisionStatusCounts: Record<LogisticsDecisionStatus, number> = {
    ...DEFAULT_DECISION_COUNTS,
  };
  for (const p of productProfiles) {
    for (const [status, count] of Object.entries(p.decisionStatusCounts)) {
      decisionStatusCounts[status as LogisticsDecisionStatus] += count;
    }
  }

  const highRiskTypes = legacy.highRiskTypes ?? [];

  return { productProfiles, totalVariants, decisionStatusCounts, highRiskTypes };
}

function transformLegacyProfile(
  legacy: LegacyLogisticsProfile
): ProductLogisticsProfile {
  const variantDecisions: VariantLogisticsDecision[] = [];

  const baseDecision: Partial<VariantLogisticsDecision> = {
    tangbuySkuId: null,
    tangbuyGoodsId: null,
    postalLimitClass: legacy.logisticsType,
    postalLimitLabel: legacy.logisticsTypeLabel,
    postalLimitConfidence: legacy.confidence,
  };

  const { status, reason } = computeVariantDecisionStatus(baseDecision);

  const singleVariant: VariantLogisticsDecision = {
    thirdPlatformSkuId: `${legacy.thirdPlatformItemId}_default`,
    optionLabel: "默认规格",
    tangbuySkuId: baseDecision.tangbuySkuId ?? null,
    tangbuyGoodsId: baseDecision.tangbuyGoodsId ?? null,
    postalLimitClass: baseDecision.postalLimitClass,
    postalLimitLabel: baseDecision.postalLimitLabel,
    postalLimitConfidence: baseDecision.postalLimitConfidence,
    decisionStatus: status,
    decisionReason: reason,
  };

  variantDecisions.push(singleVariant);

  const decisionStatusCounts = aggregateDecisionCounts(variantDecisions);

  return {
    thirdPlatformItemId: legacy.thirdPlatformItemId,
    title: legacy.title ?? null,
    primaryImageUrl: null,
    dominantLogisticsType: legacy.logisticsType,
    dominantLogisticsTypeLabel: legacy.logisticsTypeLabel,
    totalVariants: variantDecisions.length,
    decisionStatusCounts,
    tangbuyProductId: null,
    detailUrl: null,
    variantDecisions,
  };
}

export function buildEmptyAnalysis(shopName: string): {
  shopName: string;
  status: string;
  analyzedCount: number;
  skippedUnboundCount: number;
  productProfiles: ProductLogisticsProfile[];
  totalVariants: number;
  decisionStatusCounts: Record<LogisticsDecisionStatus, number>;
  highRiskTypes: LogisticsTypeCode[];
} {
  return {
    shopName,
    status: "empty",
    analyzedCount: 0,
    skippedUnboundCount: 0,
    productProfiles: [],
    totalVariants: 0,
    decisionStatusCounts: { ...DEFAULT_DECISION_COUNTS },
    highRiskTypes: [],
  };
}
