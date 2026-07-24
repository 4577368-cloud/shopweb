"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, readableError } from "@/lib/api";
import { prefetchLogisticsMirror } from "@/lib/logistics/prefetch-logistics-mirror";
import {
  getSkuAlignMirrorCache,
  isSkuAlignMirrorCacheFresh,
  setSkuAlignMirrorCache,
} from "@/lib/sku-align/sku-align-mirror-cache";
import { setSkuOverviewSession } from "@/lib/sku-align/overview-session-cache";
import { warmLaunchSummaryPartial } from "@/lib/sync/warm-launch-summary-partial";
import type { PricingTemplate, SkuProductOverview } from "@/lib/types";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseSkuAlignMirrorLoadParams {
  shopName: string;
  shopMirrorKey: string;
  shopDomain: string;
  t: TranslateFn;
}

/** SKU overview mirror cache, session, and API refresh. */
export function useSkuAlignMirrorLoad({
  shopName,
  shopMirrorKey,
  shopDomain,
  t,
}: UseSkuAlignMirrorLoadParams) {
  const hasLoadedOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<SkuProductOverview[]>([]);
  const [pricingTemplate, setPricingTemplate] = useState<PricingTemplate | null>(
    null
  );

  useEffect(() => {
    hasLoadedOnceRef.current = false;
  }, [shopName]);

  const load = useCallback(
    async (opts?: { silent?: boolean; skipCache?: boolean }) => {
      if (!opts?.silent && !opts?.skipCache && isSkuAlignMirrorCacheFresh(shopName)) {
        const cached = getSkuAlignMirrorCache(shopName);
        if (cached) {
          setProducts(cached.overview);
          setPricingTemplate(cached.pricingTemplate);
          hasLoadedOnceRef.current = true;
          void load({ silent: true, skipCache: true });
          return;
        }
      }
      const silent = opts?.silent ?? hasLoadedOnceRef.current;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        void api.backfillBindingSnapshots(shopName).catch(() => null);
        const [next, tpl] = await Promise.all([
          api.getSkuOverview(shopName),
          api.getPricingTemplate(shopName).catch(() => null),
        ]);
        setProducts(next);
        setSkuOverviewSession(shopName, next);
        setPricingTemplate(tpl);
        setSkuAlignMirrorCache(shopName, {
          overview: next,
          pricingTemplate: tpl,
        });
        hasLoadedOnceRef.current = true;
        prefetchLogisticsMirror(shopName, shopMirrorKey, shopDomain, t);
        void api
          .skuAlignV1Overview(shopName)
          .catch(() => null)
          .then((skuOverview) => {
            warmLaunchSummaryPartial(shopMirrorKey, shopName, shopDomain, t, {
              skuOverview,
              pricingTemplate: tpl ?? undefined,
            });
          });
      } catch (err) {
        setError(readableError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [shopName, shopMirrorKey, shopDomain, t]
  );

  return {
    loading,
    setLoading,
    refreshing,
    error,
    products,
    setProducts,
    pricingTemplate,
    setPricingTemplate,
    load,
    hasLoadedOnceRef,
  };
}
