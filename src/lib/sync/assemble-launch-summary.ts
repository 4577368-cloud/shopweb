import type { TranslateFn } from "@/i18n/server";
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
import { peekMirrorCache } from "@/lib/products/mirror-cache";
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
  binding: ImageBindingView | undefined,
  skuItem: SkuAlignOverview["items"][number] | undefined,
  logisticsConfirmed: boolean,
  t: TranslateFn
): string[] {
  const checks: string[] = [];
  if (binding?.bound && binding.bindStatus === "ACTIVE") {
    checks.push(t("launchSummary.checkSourceLinked"));
  } else if (binding?.bound) {
    checks.push(t("launchSummary.checkSourcePending"));
  }
  if (skuItem) {
    if (skuItem.alignedVariants >= skuItem.totalVariants && skuItem.totalVariants > 0) {
      checks.push(t("launchSummary.checkSkuComplete"));
    } else if (skuItem.alignedVariants > 0) {
      checks.push(
        t("launchSummary.checkSkuPartial", {
          aligned: skuItem.alignedVariants,
          total: skuItem.totalVariants,
        })
      );
    }
  }
  if (logisticsConfirmed) {
    checks.push(t("launchSummary.checkLogisticsConfirmed"));
  }
  if (checks.length === 0) {
    checks.push(t("launchSummary.checkInLaunchList"));
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
  analysis: LogisticsAnalysis | null,
  t: TranslateFn
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
        title: title || t("launchSummary.unnamedProduct"),
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
      bindingsMap[row.itemId],
      row.skuItem,
      isProductLogisticsConfirmed(row.itemId, analysis),
      t
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
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>,
  t: TranslateFn
): FollowUpItem[] {
  const items: FollowUpItem[] = [];

  const unmappedSkus = skuOverview?.unmappedCount ?? 0;
  if (unmappedSkus > 0) {
    items.push({
      id: "sku-unmapped",
      count: unmappedSkus,
      title: t("launchSummary.followUpUnmappedTitle", { count: unmappedSkus }),
      description: t("launchSummary.followUpUnmappedDesc"),
      href: "/sku-align",
      actionLabel: t("launchSummary.followUpUnmappedAction"),
    });
  }

  const logisticsIssues =
    logistics.reviewCount +
    Math.max(0, logistics.variantCount - logistics.confirmedCount - logistics.autoReadyCount);
  if (logisticsIssues > 0) {
    items.push({
      id: "logistics-issues",
      count: logisticsIssues,
      title: t("launchSummary.followUpLogisticsTitle", { count: logisticsIssues }),
      description: t("launchSummary.followUpLogisticsDesc"),
      href: "/logistics",
      actionLabel: t("launchSummary.followUpLogisticsAction"),
    });
  }

  if (binding.pending > 0) {
    items.push({
      id: "link-pending",
      count: binding.pending,
      title: t("launchSummary.followUpBindingPendingTitle", { count: binding.pending }),
      description: t("launchSummary.followUpBindingPendingDesc"),
      href: "/products",
      actionLabel: t("launchSummary.followUpBindingPendingAction"),
    });
  }

  if (binding.unbound > 0) {
    items.push({
      id: "no-source",
      count: binding.unbound,
      title: t("launchSummary.followUpUnboundTitle", { count: binding.unbound }),
      description: t("launchSummary.followUpUnboundDesc"),
      href: "/products",
      actionLabel: t("launchSummary.followUpUnboundAction"),
    });
  }

  return items;
}

function buildProgressTasks(
  binding: ReturnType<typeof computeShopProductBindingStats>,
  skuOverview: SkuAlignOverview | null,
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>,
  followUpCount: number,
  t: TranslateFn
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
      label: t("launchSummary.statSourceLinks"),
      detail:
        binding.analyzed > 0
          ? t("launchSummary.statSourceDetail", {
              linked: binding.confirmed + binding.pending,
              total: binding.analyzed,
            })
          : undefined,
      status: bindingDone ? "done" : bindingPartial ? "running" : "pending",
    },
    {
      id: "sku-map",
      label: t("launchSummary.statSkuMapping"),
      detail:
        skuTotal > 0
          ? t("launchSummary.statSkuDetail", { aligned: skuAligned, total: skuTotal })
          : undefined,
      status: skuDone ? "done" : skuPartial ? "running" : "pending",
    },
    {
      id: "logistics",
      label: t("launchSummary.statLogistics"),
      detail:
        logistics.variantCount > 0
          ? logistics.quotedCount > 0
            ? t("launchSummary.statLogisticsQuoted", {
                quoted: logistics.quotedCount,
                confirmed: logistics.confirmedCount,
                total: logistics.variantCount,
              })
            : t("launchSummary.statLogisticsConfirmed", {
                confirmed: logistics.confirmedCount,
                total: logistics.variantCount,
              })
          : undefined,
      status: logisticsDone ? "done" : logisticsPartial ? "running" : "pending",
    },
    {
      id: "follow-ups",
      label: t("launchSummary.statFollowUp"),
      detail:
        followUpCount > 0
          ? t("launchSummary.statFollowUpCount", { count: followUpCount })
          : t("launchSummary.statFollowUpNone"),
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
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>,
  t: TranslateFn
): PipelineStep[] {
  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  const skuTotal = skuOverview?.totalVariants ?? 0;

  return [
    {
      id: "authorize",
      title: t("launchSummary.timelineAuth"),
      status: "completed",
      badge: t("launchSummary.timelineAuthBadge"),
      summary: t("launchSummary.timelineAuthSummary"),
    },
    {
      id: "products",
      title: t("launchSummary.timelineProducts"),
      status: "completed",
      badge: t("launchSummary.timelineProductsBadge"),
      summary: t("launchSummary.timelineProductsSummary", {
        linked: binding.confirmed + binding.pending,
        total: binding.analyzed,
      }),
    },
    {
      id: "ai-optimize",
      title: t("launchSummary.timelineAi"),
      status: "completed",
      badge: t("launchSummary.timelineAiBadge"),
      summary:
        binding.confirmed > 0
          ? t("launchSummary.timelineAiSummaryConfirmed", { count: binding.confirmed })
          : t("launchSummary.timelineAiSummaryDefault"),
    },
    {
      id: "sku-map",
      title: t("launchSummary.timelineSku"),
      status: skuTotal > 0 && skuAligned >= skuTotal ? "completed" : "completed",
      badge: t("launchSummary.timelineSkuBadge"),
      summary:
        skuTotal > 0
          ? t("launchSummary.timelineSkuSummary", { aligned: skuAligned, total: skuTotal })
          : t("launchSummary.timelineSkuSummaryEmpty"),
    },
    {
      id: "logistics",
      title: t("launchSummary.timelineLogistics"),
      status: "completed",
      badge: t("launchSummary.timelineLogisticsBadge"),
      summary:
        logistics.variantCount > 0
          ? t("launchSummary.timelineLogisticsSummary", {
              confirmed: logistics.confirmedCount,
              total: logistics.variantCount,
            })
          : t("launchSummary.timelineLogisticsSummaryEmpty"),
    },
    {
      id: "sync-complete",
      title: t("launchSummary.timelineSync"),
      status: "active",
      badge: t("launchSummary.timelineSyncBadge"),
      summary: t("launchSummary.timelineSyncSummary"),
    },
  ];
}

function formatLogisticsStrategy(
  template: LogisticsTemplate | null,
  t: TranslateFn
): {
  markets: string;
  speed: string;
  packaging: string;
} {
  if (!template) {
    return {
      markets: t("launchSummary.marketsNotConfigured"),
      speed: t("launchSummary.strategyDash"),
      packaging: t("launchSummary.strategyDash"),
    };
  }
  const markets =
    template.markets
      ?.flatMap((m) => m.countryCodes ?? [])
      .filter(Boolean)
      .slice(0, 4)
      .join(" / ") || t("launchSummary.marketsNotConfigured");
  const speedMap: Record<string, string> = {
    fast: t("launchSummary.speedFast"),
    balanced: t("launchSummary.speedBalanced"),
    economy: t("launchSummary.speedEconomy"),
  };
  const packMap: Record<string, string> = {
    minimal: t("launchSummary.packMinimal"),
    standard: t("launchSummary.packStandard"),
    reinforced: t("launchSummary.packReinforced"),
  };
  return {
    markets,
    speed: speedMap[template.speedPreference] ?? template.speedPreference,
    packaging: packMap[template.packaging] ?? template.packaging,
  };
}

function buildPricingStrategy(template: PricingTemplate | null, t: TranslateFn) {
  if (!template || template.isDefault) {
    return {
      sourceLabel: t("sync.pricingSourceLabel"),
      exchangeRate: 7.0,
      multiplier: 2.8,
      addend: 0.99,
      targetCurrency: "USD",
      rounding: t("launchSummary.pricingNotSaved"),
      isDefault: true,
    };
  }
  return {
    sourceLabel: t("sync.pricingSourceLabel"),
    exchangeRate: template.exchangeRate,
    multiplier: template.multiplier,
    addend: template.addend ?? 0,
    targetCurrency: template.targetCurrency ?? "USD",
    rounding: template.roundingStrategy
      ? t("launchSummary.pricingRounding", {
          strategy: template.roundingStrategy,
        })
      : t("launchSummary.pricingDefault"),
    isDefault: false,
  };
}

function buildLaunchSummary(params: {
  shopName: string;
  shopDomain: string;
  shopProducts: ShopMirrorProduct[];
  bindingsMap: Record<string, ImageBindingView>;
  skuOverview: SkuAlignOverview | null;
  mergedAnalysis: LogisticsAnalysis | null;
  logistics: ReturnType<typeof computeLogisticsPlanMetrics>;
  pricingTemplate: PricingTemplate | null;
  activeTemplate: LogisticsTemplate | null;
  t: TranslateFn;
  loadTier: "fast" | "full";
}): LaunchSummary {
  const {
    shopName,
    shopDomain,
    shopProducts,
    bindingsMap,
    skuOverview,
    mergedAnalysis,
    logistics,
    pricingTemplate,
    activeTemplate,
    t,
    loadTier,
  } = params;

  const binding = computeShopProductBindingStats(shopProducts, bindingsMap);
  const followUps = buildFollowUps(binding, skuOverview, logistics, t);
  const { tasks, targetPercent } = buildProgressTasks(
    binding,
    skuOverview,
    logistics,
    followUps.length,
    t
  );

  const products = buildCarouselProducts(
    shopProducts,
    bindingsMap,
    skuOverview,
    mergedAnalysis,
    t
  );

  const stats = buildCeremonyStats(
    shopProducts,
    binding,
    skuOverview,
    logistics,
    products.length
  );

  const logisticsStrategy = formatLogisticsStrategy(activeTemplate, t);

  const skuAligned = (skuOverview?.items ?? []).reduce(
    (sum, item) => sum + item.alignedVariants,
    0
  );
  const skuTotal = skuOverview?.totalVariants ?? 0;

  return {
    meta: {
      shopName,
      shopDomain,
      completedAt: new Date().toLocaleString(),
      locale: "zh-CN",
      dataSource: "live",
      loadTier,
    },
    pipeline: {
      currentStepId: "sync-complete",
      steps: buildPipelineSteps(binding, skuOverview, logistics, t),
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
      pricing: buildPricingStrategy(pricingTemplate, t),
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

const EMPTY_LOGISTICS = computeLogisticsPlanMetrics(null);

/** Hydrate from products mirror cache (0 network). */
export function assembleLaunchSummaryFastFromMirror(
  shopMirrorKey: string,
  shopName: string,
  shopDomain: string | undefined,
  t: TranslateFn
): LaunchSummary | null {
  const cached = peekMirrorCache(shopMirrorKey);
  if (!cached?.items.length) return null;
  return buildLaunchSummary({
    shopName,
    shopDomain: shopDomain?.trim() || shopName,
    shopProducts: cached.items,
    bindingsMap: cached.bindings,
    skuOverview: null,
    mergedAnalysis: null,
    logistics: EMPTY_LOGISTICS,
    pricingTemplate: null,
    activeTemplate: null,
    t,
    loadTier: "fast",
  });
}

/** Tier-1 APIs: shop products + bindings only. */
export async function assembleLaunchSummaryFast(
  shopName: string,
  t: TranslateFn,
  shopDomain?: string | null
): Promise<LaunchSummary> {
  const [shopProducts, bindings] = await Promise.all([
    api.getShopProducts(shopName).catch(() => [] as ShopMirrorProduct[]),
    api.listImageBindings(shopName).catch(() => [] as ImageBindingView[]),
  ]);
  const bindingsMap = indexImageBindings(bindings);
  return buildLaunchSummary({
    shopName,
    shopDomain: shopDomain?.trim() || shopName,
    shopProducts,
    bindingsMap,
    skuOverview: null,
    mergedAnalysis: null,
    logistics: EMPTY_LOGISTICS,
    pricingTemplate: null,
    activeTemplate: null,
    t,
    loadTier: "fast",
  });
}

/** All workflow APIs merged (tier 2). */
export async function assembleLaunchSummaryFull(
  shopName: string,
  t: TranslateFn,
  shopDomain?: string | null
): Promise<LaunchSummary> {
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

  return buildLaunchSummary({
    shopName,
    shopDomain: shopDomain?.trim() || shopName,
    shopProducts,
    bindingsMap,
    skuOverview,
    mergedAnalysis,
    logistics,
    pricingTemplate,
    activeTemplate,
    t,
    loadTier: "full",
  });
}

/** @deprecated Prefer explicit Fast then Full on the sync page. */
export async function assembleLaunchSummary(
  shopName: string,
  t: TranslateFn
): Promise<LaunchSummary> {
  return assembleLaunchSummaryFull(shopName, t);
}
