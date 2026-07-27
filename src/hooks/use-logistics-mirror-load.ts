"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, readableError } from "@/lib/api";
import { createDefaultLogisticsTemplate } from "@/lib/logistics/default-template";
import {
  getLogisticsMirrorCache,
  peekLogisticsMirrorCache,
  setLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import { setLogisticsSession } from "@/lib/logistics/logistics-session-cache";
import {
  enrichAnalysisWithTangbuyMailLimits,
  type MailLimitFetchReason,
} from "@/lib/logistics/tangbuy-mail-limit";
import { hasScanned, markScanned } from "@/lib/scan/gate";
import { warmLaunchSummaryPartial } from "@/lib/sync/warm-launch-summary-partial";
import type {
  LogisticsAnalysis,
  LogisticsTemplate,
  PricingTemplate,
} from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseLogisticsMirrorLoadParams {
  shopName: string;
  shopDomain: string;
  shopMirrorKey: string;
  scanShopKey: string;
  isAuthorized: boolean;
  t: TranslateFn;
}

export interface LogisticsRefreshStats {
  totalVariants: number;
  mailLimitVariants: number;
  changedVariants: number;
  reason: MailLimitFetchReason;
  listingTotal: number;
  mappedProducts: number;
  matchedProducts: number;
  usedListingToken: boolean;
  detail?: string;
}

function computeMailLimitRefreshStats(
  base: LogisticsAnalysis,
  enriched: LogisticsAnalysis,
  meta: {
    reason: MailLimitFetchReason;
    listingTotal: number;
    mappedProducts: number;
    matchedProducts: number;
    usedListingToken: boolean;
    detail?: string;
  }
): LogisticsRefreshStats {
  const beforeByVariant = new Map<
    string,
    { cls?: string; label?: string }
  >();
  for (const p of base.productProfiles ?? []) {
    for (const v of p.variantDecisions ?? []) {
      beforeByVariant.set(v.thirdPlatformSkuId, {
        cls: v.postalLimitClass,
        label: v.postalLimitLabel,
      });
    }
  }

  let totalVariants = 0;
  let mailLimitVariants = 0;
  let changedVariants = 0;
  for (const p of enriched.productProfiles ?? []) {
    for (const v of p.variantDecisions ?? []) {
      totalVariants += 1;
      if (v.mailLimitPid != null && v.mailLimitId != null) {
        mailLimitVariants += 1;
      }
      const before = beforeByVariant.get(v.thirdPlatformSkuId);
      if (
        before &&
        (before.cls !== v.postalLimitClass || before.label !== v.postalLimitLabel)
      ) {
        changedVariants += 1;
      }
    }
  }

  return {
    totalVariants,
    mailLimitVariants,
    changedVariants,
    reason: meta.reason,
    listingTotal: meta.listingTotal,
    mappedProducts: meta.mappedProducts,
    matchedProducts: meta.matchedProducts,
    usedListingToken: meta.usedListingToken,
    detail: meta.detail,
  };
}

/** Bootstrap analysis/templates from mirror cache and `analyzeLogistics` API. */
export function useLogisticsMirrorLoad({
  shopName,
  shopDomain,
  shopMirrorKey,
  scanShopKey,
  isAuthorized,
  t,
}: UseLogisticsMirrorLoadParams) {
  const cacheBootstrap = shopName
    ? peekLogisticsMirrorCache(shopName)
    : undefined;

  const [analysis, setAnalysis] = useState<LogisticsAnalysis | null>(
    () => cacheBootstrap?.analysis ?? null
  );
  const [templates, setTemplates] = useState<LogisticsTemplate[]>(
    () => cacheBootstrap?.templates ?? []
  );
  const [activeTemplate, setActiveTemplate] = useState<LogisticsTemplate | null>(
    () => {
      const ts = cacheBootstrap?.templates;
      if (ts && ts.length > 0) return ts[0];
      return null;
    }
  );
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(
    () => cacheBootstrap?.pricingTemplate ?? null
  );
  const [loading, setLoading] = useState(() => !cacheBootstrap?.analysis);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const templatesRef = useRef(templates);
  templatesRef.current = templates;

  const applyLogisticsPayload = useCallback(
    (
      a: LogisticsAnalysis,
      ts: LogisticsTemplate[],
      pt: PricingTemplate | null
    ) => {
      setAnalysis(a);
      setTemplates((prev) => {
        // Silent/stale reload returning [] must not wipe a just-saved template
        // (empty-list API trick races with upsert → quote).
        if (ts.length === 0 && prev.length > 0) return prev;
        return ts;
      });
      setPricingTemplate(pt);
      if (ts.length > 0) {
        setActiveTemplate(ts[0]);
      } else {
        setActiveTemplate((prev) => prev ?? createDefaultLogisticsTemplate(shopName));
      }
    },
    [shopName]
  );

  const load = useCallback(
    async (
      forceClassify: boolean,
      opts?: { skipCache?: boolean; silent?: boolean }
    ): Promise<LogisticsRefreshStats | null> => {
      const silent = opts?.silent ?? false;
      const skipEntryCeremony =
        !forceClassify &&
        (hasScanned("logistics", scanShopKey) ||
          hasScanned("sku-align", scanShopKey));

      const hydrateFromCache = (
        cached: NonNullable<ReturnType<typeof getLogisticsMirrorCache>>
      ) => {
        applyLogisticsPayload(
          cached.analysis!,
          cached.templates,
          cached.pricingTemplate
        );
      };

      if (!forceClassify && !opts?.skipCache) {
        const cached = peekLogisticsMirrorCache(shopName);
        if (cached?.analysis) {
          hydrateFromCache(cached);
          setLoading(false);
          void load(false, { skipCache: true, silent: true });
          return null;
        }
      }

      if (!silent) {
        setLoading(true);
        setClassifying(!skipEntryCeremony);
      }
      setError(null);
      try {
        const [a, ts, pt] = await Promise.all([
          api.analyzeLogistics(shopName, forceClassify),
          api.listLogisticsTemplates(shopName),
          api.getPricingTemplate(shopName),
        ]);
        // Prefer Tangbuy listing mailLimitList over keyword classifier
        const { analysis: enriched, meta } =
          await enrichAnalysisWithTangbuyMailLimits(a, shopName);
        const refreshStats = computeMailLimitRefreshStats(a, enriched, meta);
        // Prefer local saved templates over empty list from API defaultTemplate.
        const effectiveTs =
          ts.length > 0
            ? ts
            : templatesRef.current.length > 0
              ? templatesRef.current
              : ts;
        applyLogisticsPayload(enriched, effectiveTs, pt);
        const payload = {
          analysis: enriched,
          templates: effectiveTs,
          pricingTemplate: pt,
        };
        setLogisticsMirrorCache(shopName, payload);
        setLogisticsSession(shopName, payload);
        markScanned("logistics", scanShopKey);
        warmLaunchSummaryPartial(shopMirrorKey, shopName, shopDomain, t, {
          logisticsAnalysis: enriched,
          logisticsTemplates: effectiveTs,
          pricingTemplate: pt ?? undefined,
        });
        return refreshStats;
      } catch (err) {
        setError(readableError(err));
        const ts = await api.listLogisticsTemplates(shopName).catch(() => []);
        if (ts.length > 0 || templatesRef.current.length === 0) {
          setTemplates(ts);
          setActiveTemplate(
            ts.length > 0 ? ts[0] : createDefaultLogisticsTemplate(shopName)
          );
        }
        return null;
      } finally {
        setClassifying(false);
        if (!silent) setLoading(false);
      }
    },
    [
      applyLogisticsPayload,
      scanShopKey,
      shopDomain,
      shopMirrorKey,
      shopName,
      t,
    ]
  );

  useEffect(() => {
    if (!isAuthorized) return;
    void load(false);
  }, [isAuthorized, load]);

  return {
    analysis,
    setAnalysis,
    templates,
    setTemplates,
    activeTemplate,
    setActiveTemplate,
    pricingTemplate,
    setPricingTemplate,
    loading,
    classifying,
    setClassifying,
    error,
    setError,
    load,
    applyLogisticsPayload,
  };
}
