import { api } from "@/lib/api";
import type { TranslateFn } from "@/i18n/server";
import {
  isLogisticsMirrorCacheFresh,
  setLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import { setLogisticsSession } from "@/lib/logistics/logistics-session-cache";
import { warmLaunchSummaryPartial } from "@/lib/sync/warm-launch-summary-partial";

const inflight = new Map<string, Promise<void>>();

/** Warm logistics mirror while user is still on SKU / products — cuts blank time on entry. */
export function prefetchLogisticsMirror(
  shopName: string,
  shopMirrorKey: string,
  shopDomain: string | undefined,
  t: TranslateFn
): void {
  if (!shopName.trim()) return;
  if (isLogisticsMirrorCacheFresh(shopName)) return;
  if (inflight.has(shopName)) return;

  const run = (async () => {
    try {
      const [a, ts, pt] = await Promise.all([
        api.analyzeLogistics(shopName, false),
        api.listLogisticsTemplates(shopName),
        api.getPricingTemplate(shopName),
      ]);
      if (!a) return;
      const payload = { analysis: a, templates: ts, pricingTemplate: pt };
      setLogisticsMirrorCache(shopName, payload);
      setLogisticsSession(shopName, payload);
      warmLaunchSummaryPartial(shopMirrorKey, shopName, shopDomain, t, {
        logisticsAnalysis: a,
        logisticsTemplates: ts,
        pricingTemplate: pt ?? undefined,
      });
    } catch {
      // best-effort prefetch
    } finally {
      inflight.delete(shopName);
    }
  })();

  inflight.set(shopName, run);
}
