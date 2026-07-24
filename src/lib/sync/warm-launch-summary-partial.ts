import type { TranslateFn } from "@/i18n/server";
import {
  assembleLaunchSummaryFromBundle,
} from "@/lib/sync/assemble-launch-summary";
import {
  getLaunchSummaryPartial,
  isLaunchSummaryPartialComplete,
  mergeLaunchSummaryPartial,
  type LaunchSummaryPartialPatch,
} from "@/lib/sync/launch-summary-partial";
import {
  setLaunchSummaryCache,
  setLaunchSummaryCacheIfNotFull,
} from "@/lib/sync/launch-summary-cache";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

/**
 * Merge workflow-step data into the partial store; when complete, promote to full launch cache.
 */
export function warmLaunchSummaryPartial(
  shopMirrorKey: string,
  shopName: string,
  shopDomain: string | undefined,
  t: TranslateFn,
  patch: LaunchSummaryPartialPatch
): LaunchSummary | null {
  const entry = mergeLaunchSummaryPartial(shopMirrorKey, patch);
  if (!isLaunchSummaryPartialComplete(entry)) {
    const fastOnly = assembleLaunchSummaryFromBundle(
      {
        shopName,
        shopProducts: entry.shopProducts ?? [],
        bindings: entry.bindings ?? [],
        skuOverview: entry.skuOverview ?? null,
        logisticsAnalysis: entry.logisticsAnalysis ?? null,
        pricingTemplate: entry.pricingTemplate ?? null,
        logisticsTemplates: entry.logisticsTemplates ?? [],
      },
      shopName,
      shopDomain,
      t,
      "fast"
    );
    setLaunchSummaryCacheIfNotFull(shopMirrorKey, fastOnly);
    return null;
  }

  const full = assembleLaunchSummaryFromBundle(
    {
      shopName,
      shopProducts: entry.shopProducts,
      bindings: entry.bindings,
      skuOverview: entry.skuOverview,
      logisticsAnalysis: entry.logisticsAnalysis,
      pricingTemplate: entry.pricingTemplate,
      logisticsTemplates: entry.logisticsTemplates,
    },
    shopName,
    shopDomain,
    t,
    "full"
  );
  setLaunchSummaryCache(shopMirrorKey, full);
  return full;
}

export function tryAssembleFromLaunchPartial(
  shopMirrorKey: string,
  shopName: string,
  shopDomain: string | undefined,
  t: TranslateFn
): LaunchSummary | null {
  const entry = getLaunchSummaryPartial(shopMirrorKey);
  if (!isLaunchSummaryPartialComplete(entry)) return null;
  return assembleLaunchSummaryFromBundle(
    {
      shopName,
      shopProducts: entry.shopProducts,
      bindings: entry.bindings,
      skuOverview: entry.skuOverview,
      logisticsAnalysis: entry.logisticsAnalysis,
      pricingTemplate: entry.pricingTemplate,
      logisticsTemplates: entry.logisticsTemplates,
    },
    shopName,
    shopDomain,
    t,
    "full"
  );
}
