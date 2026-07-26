import type {
  LogisticsDecisionStatus,
  LogisticsTypeCode,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
  SkuProductOverview,
} from "@/lib/types";

export const DEFAULT_DECISION_COUNTS: Record<LogisticsDecisionStatus, number> = {
  pending_sku: 0,
  pending_postal_meta: 0,
  ready_for_quote: 0,
  confirmed: 0,
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
  COSMETIC: "化妆品",
  OTHER: "其他",
};

export function getPostalLimitLabel(
  postalClass?: string | null
): string | undefined {
  if (!postalClass) return undefined;
  return POSTAL_LIMIT_LABELS[postalClass] || postalClass;
}

// 所有品类都正常走报价流程，不因特殊品类卡住。
// 后续会拿到匹配邮限的标签数据，每个品类都会匹配对应物流线路。

// ── SKU 级关键词检测 ──────────────────────────────────────────
// 检测 SKU 规格文本（optionLabel）中的特殊品类信号，覆盖商品级分类。
// 优先级：BATTERY_MAGNETIC > LIQUID > POWDER > BLADE > COSMETIC > FRAGILE
const SKU_KEYWORD_MAP: Array<{ keywords: string[]; postalClass: string; label: string }> = [
  {
    postalClass: "BATTERY_BUILT_IN",
    label: "内置电池",
    keywords: ["磁吸", "带磁", "磁铁", "含电", "带电", "电池", "充电", "无线充", "magnetic", "battery", "rechargeable"],
  },
  {
    postalClass: "LIQUID",
    label: "液体",
    keywords: ["液体", "含液", "带液", "液体款", "liquid"],
  },
  {
    postalClass: "POWDER",
    label: "粉末",
    keywords: ["粉末", "粉状", "powder"],
  },
  {
    postalClass: "BLADE",
    label: "刀具",
    keywords: ["刀片", "刀具", "blade", "knife"],
  },
  {
    postalClass: "COSMETIC",
    label: "化妆品",
    keywords: ["化妆品", "口红", "唇膏", "防晒", "面霜", "乳液", "精华", "面膜", "cosmetic", "lipstick", "sunscreen"],
  },
  {
    postalClass: "FRAGILE",
    label: "易碎",
    keywords: ["玻璃", "陶瓷", "易碎", "glass", "ceramic", "fragile"],
  },
];

/**
 * 检测 SKU 规格文本是否命中特殊品类关键词。
 * 返回覆盖后的邮限分类，或 null（无覆盖，沿用商品级分类）。
 */
function detectSkuLevelPostalClass(
  optionLabel: string,
  productLevelClass: string | undefined
): { postalClass: string; label: string; confidence: number } | null {
  const text = optionLabel.toLowerCase();
  for (const group of SKU_KEYWORD_MAP) {
    for (const kw of group.keywords) {
      if (text.includes(kw.toLowerCase())) {
        // 如果 SKU 级检测结果和商品级一致，无需覆盖
        if (productLevelClass && productLevelClass.toUpperCase() === group.postalClass) {
          return null;
        }
        return {
          postalClass: group.postalClass,
          label: group.label,
          confidence: 0.9,
        };
      }
    }
  }
  return null;
}

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

  // 所有品类都正常进入报价流程，不因特殊品类卡住
  return {
    status: "ready_for_quote",
    reason: "",
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
  legacy: LegacyLogisticsAnalysis,
  skuOverview: SkuProductOverview[] = []
): {
  productProfiles: ProductLogisticsProfile[];
  totalVariants: number;
  decisionStatusCounts: Record<LogisticsDecisionStatus, number>;
  highRiskTypes: LogisticsTypeCode[];
} {
  const skuMap = new Map<string, SkuProductOverview>();
  for (const item of skuOverview) {
    skuMap.set(item.thirdPlatformItemId, item);
  }

  const productProfiles: ProductLogisticsProfile[] = (
    legacy.profiles ?? []
  ).map((p) => transformLegacyProfile(p, skuMap));

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
  legacy: LegacyLogisticsProfile,
  skuMap: Map<string, SkuProductOverview>
): ProductLogisticsProfile {
  const variantDecisions: VariantLogisticsDecision[] = [];

  const skuItem = skuMap.get(legacy.thirdPlatformItemId);

  const baseDecision: Partial<VariantLogisticsDecision> = {
    tangbuySkuId: null,
    tangbuyGoodsId: null,
    postalLimitClass: legacy.logisticsType,
    postalLimitLabel: legacy.logisticsTypeLabel,
    postalLimitConfidence: legacy.confidence,
  };

  if (skuItem) {
    for (const variant of skuItem.variants) {
      const bound = variant.bound;
      const bindStatus = bound?.bindStatus?.trim().toUpperCase();
      const hasBindingIds =
        Boolean(bound?.tangbuySkuId?.trim()) &&
        Boolean(bound?.tangbuyProductId?.trim());
      const bindingActive =
        hasBindingIds && (!bindStatus || bindStatus === "ACTIVE");

      // SKU 级关键词检测：检查 optionLabel 是否命中特殊品类
      const skuOverride = detectSkuLevelPostalClass(
        variant.optionLabel,
        baseDecision.postalLimitClass
      );
      const variantPostalClass = skuOverride?.postalClass ?? baseDecision.postalLimitClass;
      const variantPostalLabel = skuOverride?.label ?? baseDecision.postalLimitLabel;
      const variantPostalConfidence = skuOverride?.confidence ?? baseDecision.postalLimitConfidence;

      if (hasBindingIds && bindStatus === "PENDING") {
        variantDecisions.push({
          thirdPlatformSkuId: variant.thirdPlatformSkuId,
          optionLabel: variant.optionLabel,
          tangbuySkuId: bound?.tangbuySkuId ?? null,
          tangbuyGoodsId: bound?.tangbuyProductId ?? null,
          postalLimitClass: variantPostalClass,
          postalLimitLabel: variantPostalLabel,
          postalLimitConfidence: variantPostalConfidence,
          decisionStatus: "pending_sku",
          decisionReason: "SKU 绑定待确认，请先在 SKU 对齐页确认后再报价",
          listingPrice: variant.price ?? null,
          listingCurrency: skuItem.currency ?? null,
        });
        continue;
      }

      const decision: Partial<VariantLogisticsDecision> = {
        ...baseDecision,
        tangbuySkuId: bindingActive ? (bound?.tangbuySkuId ?? null) : null,
        tangbuyGoodsId: bindingActive ? (bound?.tangbuyProductId ?? null) : null,
        postalLimitClass: variantPostalClass,
        postalLimitLabel: variantPostalLabel,
        postalLimitConfidence: variantPostalConfidence,
      };

      const { status, reason } = computeVariantDecisionStatus(decision);

      const offerRaw = bound?.offerPrice?.trim();
      let procurementCostCny: number | null = null;
      if (offerRaw) {
        const parsed = Number.parseFloat(offerRaw.replace(/[^\d.]/g, ""));
        if (Number.isFinite(parsed) && parsed > 0) procurementCostCny = parsed;
      }

      variantDecisions.push({
        thirdPlatformSkuId: variant.thirdPlatformSkuId,
        optionLabel: variant.optionLabel,
        tangbuySkuId: decision.tangbuySkuId ?? null,
        tangbuyGoodsId: decision.tangbuyGoodsId ?? null,
        postalLimitClass: decision.postalLimitClass,
        postalLimitLabel: decision.postalLimitLabel,
        postalLimitConfidence: decision.postalLimitConfidence,
        decisionStatus: status,
        decisionReason: reason,
        listingPrice: variant.price ?? null,
        listingCurrency: skuItem.currency ?? null,
        procurementCostCny,
      });
    }
  }

  if (variantDecisions.length === 0) {
    const { status, reason } = computeVariantDecisionStatus(baseDecision);

    variantDecisions.push({
      thirdPlatformSkuId: `${legacy.thirdPlatformItemId}_default`,
      optionLabel: "默认规格",
      tangbuySkuId: baseDecision.tangbuySkuId ?? null,
      tangbuyGoodsId: baseDecision.tangbuyGoodsId ?? null,
      postalLimitClass: baseDecision.postalLimitClass,
      postalLimitLabel: baseDecision.postalLimitLabel,
      postalLimitConfidence: baseDecision.postalLimitConfidence,
      decisionStatus: status,
      decisionReason: reason,
    });
  }

  const decisionStatusCounts = aggregateDecisionCounts(variantDecisions);

  return {
    thirdPlatformItemId: legacy.thirdPlatformItemId,
    title: skuItem?.title ?? legacy.title ?? null,
    primaryImageUrl: skuItem?.imageUrl ?? null,
    dominantLogisticsType: legacy.logisticsType,
    dominantLogisticsTypeLabel: legacy.logisticsTypeLabel,
    totalVariants: variantDecisions.length,
    decisionStatusCounts,
    tangbuyProductId: skuItem?.tangbuyProductId ?? null,
    detailUrl: skuItem?.detailUrl ?? null,
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
