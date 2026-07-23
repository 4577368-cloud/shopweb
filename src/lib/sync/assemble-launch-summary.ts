import { api } from "@/lib/api";
import { computeLogisticsPlanMetrics } from "@/lib/logistics/display";
import {
  mergeQuoteResultsIntoAnalysis,
  readQuoteCache,
} from "@/lib/logistics/quote-cache";
import { buildLogisticsTemplateScopeKey } from "@/lib/logistics/template-scope-key";
import {
  computeShopProductBindingStats,
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import type {
  FollowUpItem,
  LaunchProduct,
  LaunchSummary,
  PipelineStep,
  ProgressTask,
} from "@/lib/sync/launch-summary";
import type { CeremonyStats } from "@/lib/sync/ceremony-progress";
import type {
  ImageBindingView,
  LogisticsAnalysis,
  LogisticsTemplate,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import type { SkuAlignOverview } from "@/lib/sku-align-v1/types";
import {
  FULFILLMENT_PREP_FOOTNOTE,
  LAUNCH_PROGRESS_FOOTNOTE,
} from "@/lib/sync/fulfillment-copy";

function buildProductChecks(
  itemId: string,
  binding: ImageBindingView | undefined,
  skuItem: SkuAlignOverview["items"][number] | undefined,
  logisticsConfirmed: boolean
): string[] {
  const checks: string[] = [];
  if (binding?.bound && binding.bindStatus === "ACTIVE") {
    checks.push("已关联货源");
  } else if (binding?.bound) {
    checks.push("货源候选待确认");
  }
  if (skuItem) {
    if (skuItem.alignedVariants >= skuItem.totalVariants && skuItem.totalVariants > 0) {
      checks.push("SKU 映射完成");
    } else if (skuItem.alignedVariants > 0) {
      checks.push(`SKU 已映射 ${skuItem.alignedVariants}/${skuItem.totalVariants}`);
    }
  }
  if (logisticsConfirmed) {
    checks.push("物流线路已确认（本地）");
  }
  if (checks.length === 0) {
    checks.push("已纳入开店准备清单");
  }
  return checks;
}

function isProductLogisticsConfirmed(
  itemId: string,
  analysis: LogisticsAnalysis | null
): boolean {
  const profile = analysis?.productProfiles?.find(
    (p) => p.thirdPlatformItemId === itemId
  );
  if (!profile?.variantDecisions?.length) return false;
  return profile.variantDecisions.every((v) => v.decisionStatus === "confirmed");
}

function buildCarouselProducts(
  shopProducts: ShopMirrorProduct[],
  bindingsMap: Record<string, ImageBindingView>,
  skuOverview: SkuAlignOverview | null,
  analysis: LogisticsAnalysis | null
): LaunchProduct[] {
  const skuByItem = new Map(
    (skuOverview?.items ?? []).map((item) => [item.thirdPlatformItemId, item])
  );

  const shopById = new Map(
    shopProducts.map((p) => [p.thirdPlatformItemId, p] as const)
  );

  const itemIds = new Set<string>([
    ...shopProducts.map((p) => p.thirdPlatformItemId),
    ...(skuOverview?.items ?? []).map((i) => i.thirdPlatformItemId),
    ...Object.keys(bindingsMap),
  ]);

  const candidates = [...itemIds]
    .map((itemId) => {
      const product = shopById.get(itemId);
      const skuItem = skuByItem.get(itemId);
      const binding = bindingsMap[itemId];
      const image =
        product?.primaryImageUrl?.trim() ||
        binding?.offerImageUrl?.trim() ||
        skuItem?.imageUrl?.trim() ||
        "";
      const title =
        product?.title?.trim() ||
        skuItem?.title?.trim() ||
        binding?.offerTitle?.trim() ||
        "";
      if (!title && !image) return null;
      return {
        itemId,
        image,
        title: title || "未命名商品",
        product,
        skuItem,
        binding,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => {
      const aBinding = bindingsMap[a.itemId];
      const bBinding = bindingsMap[b.itemId];
      const aScore =
        (aBinding?.bindStatus === "ACTIVE" ? 2 : aBinding?.bound ? 1 : 0) +
        (isProductLogisticsConfirmed(a.itemId, analysis) ? 1 : 0);
      const bScore =
        (bBinding?.bindStatus === "ACTIVE" ? 2 : bBinding?.bound ? 1 : 0) +
        (isProductLogisticsConfirmed(b.itemId, analysis) ? 1 : 0);
      return bScore - aScore;
    });

  return candidates.slice(0, 24).map((row) => ({
    id: row.itemId,
    title: row.title,
    image: row.image,
    checks: buildProductChecks(
      row.itemId,
      bindingsMap[row.itemId],
      row.skuItem,
      isProductLogisticsConfirmed(row.itemId, analysis)
    ),
  }));
}

function buildCeremonyStats(
  shopProducts: ShopMirrorProduct[],
  binding: ReturnType<typeof computeShopProductBindingStats>,
  skuOverview: SkuAlignOverview | null,
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>,
  productsInCeremony: number
): CeremonyStats {
  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  return {
    productsTotal: shopProducts.length,
    productsInCeremony,
    sourceLinksConfirmed: binding.confirmed,
    sourceLinksTotal: binding.analyzed,
    sourceLinksPending: binding.pending,
    skuMapped: skuAligned,
    skuTotal: skuOverview?.totalVariants ?? 0,
    logisticsQuoted: logistics.quotedCount,
    logisticsConfirmed: logistics.confirmedCount,
    logisticsTotal: logistics.variantCount,
  };
}

function buildFollowUps(
  binding: ReturnType<typeof computeShopProductBindingStats>,
  skuOverview: SkuAlignOverview | null,
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>
): FollowUpItem[] {
  const items: FollowUpItem[] = [];

  const unmappedSkus = skuOverview?.unmappedCount ?? 0;
  if (unmappedSkus > 0) {
    items.push({
      id: "sku-unmapped",
      count: unmappedSkus,
      title: `${unmappedSkus} 个变体尚未映射货源 SKU`,
      description: "不影响已上架商品销售，建议尽快补齐映射。",
      href: "/sku-align",
      actionLabel: "去处理",
    });
  }

  const logisticsIssues =
    logistics.reviewCount +
    Math.max(0, logistics.variantCount - logistics.confirmedCount - logistics.autoReadyCount);
  if (logisticsIssues > 0) {
    items.push({
      id: "logistics-issues",
      count: logisticsIssues,
      title: `${logisticsIssues} 个变体物流待确认或报价失败`,
      description: "可回到物流页重新拉取线路或手动确认。",
      href: "/logistics",
      actionLabel: "去处理",
    });
  }

  if (binding.pending > 0) {
    items.push({
      id: "link-pending",
      count: binding.pending,
      title: `${binding.pending} 个商品关联待确认`,
      description: "候选匹配已生成，等待你确认或替换货源。",
      href: "/products",
      actionLabel: "去处理",
    });
  }

  if (binding.unbound > 0) {
    items.push({
      id: "no-source",
      count: binding.unbound,
      title: `${binding.unbound} 个商品未关联货源`,
      description: "这些商品尚未绑定采购来源，无法自动履约。",
      href: "/products",
      actionLabel: "去处理",
    });
  }

  return items;
}

function buildProgressTasks(
  binding: ReturnType<typeof computeShopProductBindingStats>,
  skuOverview: SkuAlignOverview | null,
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>,
  followUpCount: number
): { tasks: ProgressTask[]; targetPercent: number } {
  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  const skuTotal = skuOverview?.totalVariants ?? 0;

  const bindingDone = binding.analyzed > 0 && binding.matched >= binding.analyzed;
  const bindingPartial = binding.matched > 0 && !bindingDone;

  const skuDone = skuTotal > 0 && skuAligned >= skuTotal;
  const skuPartial = skuAligned > 0 && !skuDone;

  const logisticsDone =
    logistics.variantCount > 0 &&
    logistics.confirmedCount >= logistics.variantCount;
  const logisticsPartial =
    logistics.confirmedCount > 0 || logistics.quotedCount > 0;

  const tasks: ProgressTask[] = [
    {
      id: "source-links",
      label: "货源关联",
      detail:
        binding.analyzed > 0
          ? `${binding.confirmed + binding.pending} / ${binding.analyzed} 商品`
          : undefined,
      status: bindingDone ? "done" : bindingPartial ? "running" : "pending",
    },
    {
      id: "sku-map",
      label: "SKU 履约映射",
      detail: skuTotal > 0 ? `${skuAligned} / ${skuTotal} 变体` : undefined,
      status: skuDone ? "done" : skuPartial ? "running" : "pending",
    },
    {
      id: "logistics",
      label: "物流方案确认",
      detail:
        logistics.variantCount > 0
          ? logistics.quotedCount > 0
            ? `已报价 ${logistics.quotedCount} · 本地确认 ${logistics.confirmedCount} / ${logistics.variantCount}`
            : `本地确认 ${logistics.confirmedCount} / ${logistics.variantCount} 变体`
          : undefined,
      status: logisticsDone ? "done" : logisticsPartial ? "running" : "pending",
    },
    {
      id: "follow-ups",
      label: "待关注事项",
      detail: followUpCount > 0 ? `${followUpCount} 项` : "无",
      status: followUpCount > 0 ? "running" : "done",
    },
  ];

  const bindingPct =
    binding.analyzed > 0 ? (binding.confirmed + binding.pending) / binding.analyzed : 0;
  const skuPct = skuTotal > 0 ? skuAligned / skuTotal : 0;
  const logisticsPct =
    logistics.variantCount > 0 ? logistics.confirmedCount / logistics.variantCount : 0;
  const targetPercent = Math.round(
    (bindingPct * 0.3 + skuPct * 0.4 + logisticsPct * 0.3) * 100
  );

  return { tasks, targetPercent };
}

function buildPipelineSteps(
  binding: ReturnType<typeof computeShopProductBindingStats>,
  skuOverview: SkuAlignOverview | null,
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>
): PipelineStep[] {
  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  const skuTotal = skuOverview?.totalVariants ?? 0;

  return [
    {
      id: "authorize",
      title: "授权店铺",
      status: "completed",
      badge: "已完成",
      summary: "店铺连接成功",
    },
    {
      id: "products",
      title: "选品关联",
      status: "completed",
      badge: "已完成",
      summary: `${binding.confirmed + binding.pending} / ${binding.analyzed} 商品已关联货源`,
    },
    {
      id: "ai-optimize",
      title: "AI 优化",
      status: "completed",
      badge: "已完成",
      summary:
        binding.confirmed > 0
          ? `已确认关联 ${binding.confirmed} 个商品`
          : "关联数据已汇总",
    },
    {
      id: "sku-map",
      title: "SKU 映射",
      status: skuTotal > 0 && skuAligned >= skuTotal ? "completed" : "completed",
      badge: "已完成",
      summary:
        skuTotal > 0
          ? `${skuAligned} / ${skuTotal} 变体已映射`
          : "暂无 SKU 数据",
    },
    {
      id: "logistics",
      title: "物流匹配",
      status: "completed",
      badge: "已完成",
      summary:
        logistics.variantCount > 0
          ? `${logistics.confirmedCount} / ${logistics.variantCount} 变体已确认`
          : "暂无物流数据",
    },
    {
      id: "sync-complete",
      title: "同步完成",
      status: "active",
      badge: "当前",
      summary: "开店准备报告已生成",
    },
  ];
}

function formatLogisticsStrategy(template: LogisticsTemplate | null): {
  markets: string;
  speed: string;
  packaging: string;
} {
  if (!template) {
    return {
      markets: "未配置",
      speed: "—",
      packaging: "—",
    };
  }
  const markets =
    template.markets
      ?.flatMap((m) => m.countryCodes ?? [])
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ") || "未配置市场";
  const speedMap: Record<string, string> = {
    fast: "优先时效",
    balanced: "均衡时效",
    economy: "经济优先",
  };
  const packMap: Record<string, string> = {
    minimal: "极简包装",
    standard: "标准包装",
    reinforced: "加固包装",
  };
  return {
    markets,
    speed: speedMap[template.speedPreference] ?? template.speedPreference,
    packaging: packMap[template.packaging] ?? template.packaging,
  };
}

export async function assembleLaunchSummary(shopName: string): Promise<LaunchSummary> {
  const [
    shopProducts,
    bindings,
    skuOverview,
    logisticsAnalysis,
    pricingTemplate,
    logisticsTemplates,
  ] = await Promise.all([
    api.getShopProducts(shopName).catch(() => [] as ShopMirrorProduct[]),
    api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
    api.skuAlignV1Overview(shopName).catch(() => null),
    api.getLogisticsAnalysis(shopName).catch(() => null),
    api.getPricingTemplate(shopName).catch(() => null),
    api.listLogisticsTemplates(shopName).catch(() => [] as LogisticsTemplate[]),
  ]);

  const bindingsMap = indexImageBindings(bindings);
  const binding = computeShopProductBindingStats(shopProducts, bindingsMap);

  const activeTemplate = logisticsTemplates[0] ?? null;
  const templateScopeKey = buildLogisticsTemplateScopeKey(activeTemplate);
  const quoteResults =
    templateScopeKey && typeof window !== "undefined"
      ? readQuoteCache(shopName, templateScopeKey)
      : new Map();
  const mergedAnalysis =
    logisticsAnalysis && quoteResults.size > 0
      ? mergeQuoteResultsIntoAnalysis(logisticsAnalysis, quoteResults)
      : logisticsAnalysis;
  const logistics = computeLogisticsPlanMetrics(mergedAnalysis, quoteResults);
  const followUps = buildFollowUps(binding, skuOverview, logistics);
  const { tasks, targetPercent } = buildProgressTasks(
    binding,
    skuOverview,
    logistics,
    followUps.length
  );

  const products = buildCarouselProducts(
    shopProducts,
    bindingsMap,
    skuOverview,
    mergedAnalysis
  );

  const stats = buildCeremonyStats(
    shopProducts,
    binding,
    skuOverview,
    logistics,
    products.length
  );

  const logisticsStrategy = formatLogisticsStrategy(activeTemplate);

  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  const skuTotal = skuOverview?.totalVariants ?? 0;

  return {
    meta: {
      shopName,
      shopDomain: shopName,
      completedAt: new Date().toLocaleString("zh-CN"),
      locale: "zh-CN",
      dataSource: "live",
    },
    pipeline: {
      currentStepId: "sync-complete",
      steps: buildPipelineSteps(binding, skuOverview, logistics),
    },
    shopifyWrites: {
      newListings: binding.confirmed,
      titleOptimizations: 0,
      priceAdjustments: 0,
      sourceLinks: binding.confirmed + binding.pending,
      footnote: "sync.shopifyFootnote",
      ctaHref: "/products",
      ctaLabel: "sync.ctaViewListed",
      showAuditGap: true,
    },
    fulfillmentPrep: {
      skuMapped: skuAligned,
      skuTotal,
      logisticsConfirmed: logistics.confirmedCount,
      logisticsTotal: logistics.variantCount,
      pendingReview:
        (skuOverview?.unresolvedVariantsCount ?? 0) + logistics.reviewCount,
      footnote: FULFILLMENT_PREP_FOOTNOTE,
      showLocalLogisticsGap: true,
      ctaHref: "/sku-align",
      ctaLabel: "sync.ctaViewSku",
    },
    strategy: {
      pricing: buildPricingStrategy(pricingTemplate),
      logistics: logisticsStrategy,
    },
    products,
    stats,
    progress: {
      targetPercent,
      tasks,
      footnote: LAUNCH_PROGRESS_FOOTNOTE,
    },
    followUps,
  };
}

function buildPricingStrategy(template: PricingTemplate | null) {
  if (!template || template.isDefault) {
    return {
      sourceLabel: "sync.pricingSourceLabel",
      exchangeRate: 7.0,
      multiplier: 2.8,
      addend: 0.99,
      targetCurrency: "USD",
      rounding: "尚未保存定价策略",
      isDefault: true,
    };
  }
  return {
    sourceLabel: "采购价 (CNY)",
    exchangeRate: template.exchangeRate,
    multiplier: template.multiplier,
    addend: template.addend ?? 0,
    targetCurrency: template.targetCurrency ?? "USD",
    rounding: template.roundingStrategy
      ? `取整：${template.roundingStrategy}`
      : "按店铺定价策略",
    isDefault: false,
  };
}
