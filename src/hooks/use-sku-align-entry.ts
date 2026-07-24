"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { SCAN_STAGE_PROGRESS_ANIMATION_MS } from "@/components/workbench/scan-stage";
import { useSkuAlignScan } from "@/hooks/use-sku-align-scan";
import { clearScanned, hasScanned, markScanned } from "@/lib/scan/gate";
import {
  getSkuAlignMirrorCache,
  isSkuAlignMirrorCacheFresh,
  clearSkuAlignMirrorCache,
} from "@/lib/sku-align/sku-align-mirror-cache";
import {
  parseSkuAlignFilterParam,
  parseSkuAlignTabParam,
  SKU_ALIGN_FILTER_PARAM,
  SKU_ALIGN_PRODUCT_PARAM,
  SKU_ALIGN_TAB_PARAM,
  skuAlignProductWorkbenchHref,
} from "@/lib/sku-align/deep-link";
import {
  clearSkuOverviewSession,
  peekSkuOverviewSession,
} from "@/lib/sku-align/overview-session-cache";
import type { PricingTemplate, SkuProductOverview } from "@/lib/types";
import type { MutableRefObject } from "react";

const SCAN_COMPLETION_DWELL_MS = 450;
const SCAN_FINISH_DELAY_MS =
  SCAN_STAGE_PROGRESS_ANIMATION_MS + SCAN_COMPLETION_DWELL_MS;

export type SkuAlignPhase = "scan" | "result";

export interface UseSkuAlignEntryParams {
  shopName: string;
  scanShopKey: string;
  isAuthorized: boolean;
  searchParams: ReadonlyURLSearchParams;
  router: AppRouterInstance;
  load: (opts?: { silent?: boolean; skipCache?: boolean }) => Promise<void>;
  setProducts: React.Dispatch<React.SetStateAction<SkuProductOverview[]>>;
  setPricingTemplate: React.Dispatch<React.SetStateAction<PricingTemplate | null>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  hasLoadedOnceRef: MutableRefObject<boolean>;
  setFilter: (filter: import("@/components/sku-align/sku-binding-panel").SkuFilterMode) => void;
  pendingScrollRef: MutableRefObject<boolean>;
}

/** Scan ceremony vs result view, deep links, and rescan. */
export function useSkuAlignEntry({
  shopName,
  scanShopKey,
  isAuthorized,
  searchParams,
  router,
  load,
  setProducts,
  setPricingTemplate,
  setLoading,
  hasLoadedOnceRef,
  setFilter,
  pendingScrollRef,
}: UseSkuAlignEntryParams) {
  const [phase, setPhase] = useState<SkuAlignPhase>("result");

  const skipNextAutoAlignRef = useRef(false);
  const scanFinishScheduledRef = useRef(false);
  const scanFinishedRef = useRef(false);
  const startedForShopRef = useRef<string | null>(null);
  const autoAlignStartedRef = useRef<string | null>(null);

  useEffect(() => {
    autoAlignStartedRef.current = null;
  }, [shopName]);

  const {
    tasks: scanTasks,
    recent: scanRecent,
    done: scanDone,
    start: startScan,
    cancel: cancelScan,
  } = useSkuAlignScan(shopName);

  const finishToResult = useCallback(() => {
    if (scanFinishedRef.current) return;
    scanFinishedRef.current = true;
    cancelScan();
    markScanned("sku-align", scanShopKey);
    skipNextAutoAlignRef.current = true;
    setPhase("result");
    const cached = peekSkuOverviewSession(shopName);
    if (cached?.length) {
      setProducts(cached);
      setLoading(false);
      hasLoadedOnceRef.current = true;
      void load({ silent: true });
    } else {
      void load();
    }
  }, [
    cancelScan,
    shopName,
    load,
    scanShopKey,
    setProducts,
    setLoading,
    hasLoadedOnceRef,
  ]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;

    const deepFilter = parseSkuAlignFilterParam(
      searchParams.get(SKU_ALIGN_FILTER_PARAM)
    );
    const deepProductId = searchParams.get(SKU_ALIGN_PRODUCT_PARAM)?.trim() || null;

    if (deepProductId) {
      markScanned("sku-align", scanShopKey);
      router.replace(
        skuAlignProductWorkbenchHref(deepProductId, {
          tab: parseSkuAlignTabParam(searchParams.get(SKU_ALIGN_TAB_PARAM)),
        })
      );
      return;
    }

    if (deepFilter && deepFilter !== "all") {
      markScanned("sku-align", scanShopKey);
      setPhase("result");
      setFilter(deepFilter);
      if (deepFilter === "partially_linked") pendingScrollRef.current = true;
      void load();
      return;
    }

    const cachedOverview = peekSkuOverviewSession(shopName);
    const mirrorFresh = isSkuAlignMirrorCacheFresh(shopName);
    const productsStepDone = hasScanned("products", scanShopKey);
    const skipScan =
      hasScanned("sku-align", scanShopKey) ||
      (cachedOverview?.length ?? 0) > 0 ||
      mirrorFresh ||
      productsStepDone;

    if (skipScan) {
      if (productsStepDone || mirrorFresh || (cachedOverview?.length ?? 0) > 0) {
        skipNextAutoAlignRef.current = true;
      }
      if (!hasScanned("sku-align", scanShopKey)) {
        markScanned("sku-align", scanShopKey);
      }
      setPhase("result");
      if (mirrorFresh) {
        const cached = getSkuAlignMirrorCache(shopName);
        if (cached) {
          setProducts(cached.overview);
          setPricingTemplate(cached.pricingTemplate);
          setLoading(false);
          hasLoadedOnceRef.current = true;
          void load({ silent: true, skipCache: true });
          return;
        }
      }
      if (cachedOverview?.length) {
        setProducts(cachedOverview);
        setLoading(false);
        hasLoadedOnceRef.current = true;
        void load({ silent: true });
      } else {
        void load();
      }
    } else {
      scanFinishScheduledRef.current = false;
      scanFinishedRef.current = false;
      setPhase("scan");
      void startScan();
    }
  }, [
    isAuthorized,
    shopName,
    scanShopKey,
    load,
    startScan,
    searchParams,
    router,
    setFilter,
    pendingScrollRef,
    setProducts,
    setPricingTemplate,
    setLoading,
    hasLoadedOnceRef,
  ]);

  useEffect(() => {
    if (phase !== "scan" || !scanDone || scanFinishScheduledRef.current) return;
    scanFinishScheduledRef.current = true;
    const timer = window.setTimeout(() => {
      void finishToResult();
    }, SCAN_FINISH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, scanDone, finishToResult]);

  const restartScan = useCallback(() => {
    autoAlignStartedRef.current = null;
    clearScanned("sku-align", scanShopKey);
    clearSkuAlignMirrorCache(shopName);
    clearSkuOverviewSession(shopName);
    scanFinishScheduledRef.current = false;
    scanFinishedRef.current = false;
    setPhase("scan");
    void startScan();
  }, [shopName, scanShopKey, startScan]);

  return {
    phase,
    setPhase,
    scanTasks,
    scanRecent,
    scanDone,
    finishToResult,
    restartScan,
    skipNextAutoAlignRef,
    autoAlignStartedRef,
  };
}