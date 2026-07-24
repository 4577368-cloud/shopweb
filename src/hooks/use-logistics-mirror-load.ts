"use client";

import { useCallback, useEffect, useState } from "react";
import { api, readableError } from "@/lib/api";
import { createDefaultLogisticsTemplate } from "@/lib/logistics/default-template";
import {
  getLogisticsMirrorCache,
  peekLogisticsMirrorCache,
  setLogisticsMirrorCache,
} from "@/lib/logistics/logistics-mirror-cache";
import { setLogisticsSession } from "@/lib/logistics/logistics-session-cache";
import { productsMirrorShopKey } from "@/lib/products/mirror-cache";
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

  const applyLogisticsPayload = useCallback(
    (
      a: LogisticsAnalysis,
      ts: LogisticsTemplate[],
      pt: PricingTemplate | null
    ) => {
      setAnalysis(a);
      setTemplates(ts);
      setPricingTemplate(pt);
      if (ts.length > 0) {
        setActiveTemplate(ts[0]);
      } else {
        setActiveTemplate(
          createDefaultLogisticsTemplate(
            shopName,
            t("logistics.defaultTemplateName")
          )
        );
      }
    },
    [shopName, t]
  );

  const load = useCallback(
    async (
      forceClassify: boolean,
      opts?: { skipCache?: boolean; silent?: boolean }
    ) => {
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
          return;
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
        applyLogisticsPayload(a, ts, pt);
        const payload = { analysis: a, templates: ts, pricingTemplate: pt };
        setLogisticsMirrorCache(shopName, payload);
        setLogisticsSession(shopName, payload);
        markScanned("logistics", scanShopKey);
        warmLaunchSummaryPartial(shopMirrorKey, shopName, shopDomain, t, {
          logisticsAnalysis: a,
          logisticsTemplates: ts,
          pricingTemplate: pt ?? undefined,
        });
      } catch (err) {
        setError(readableError(err));
        const ts = await api.listLogisticsTemplates(shopName).catch(() => []);
        setTemplates(ts);
        setActiveTemplate(
          ts.length > 0
            ? ts[0]
            : createDefaultLogisticsTemplate(
                shopName,
                t("logistics.defaultTemplateName")
              )
        );
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
