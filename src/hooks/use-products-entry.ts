"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearMirrorCache } from "@/lib/products/mirror-cache";
import {
  productsEntryShouldSkipCeremony,
  SCAN_FINISH_DELAY_MS,
} from "@/lib/products/page-constants";
import { clearScanned, markScanned } from "@/lib/scan/gate";
import {
  consumeScanHandoff,
  markScanHandoff,
  type ScanHandoffPayload,
} from "@/lib/scan/handoff";
import type { ScanSummaryStats } from "@/lib/scan/copilot-workflow";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

export type ProductsPagePhase = "scan" | "result";

export type LoadSummaryFn = (opts?: {
  silent?: boolean;
  force?: boolean;
}) => Promise<{
  products: ShopMirrorProduct[];
  bindings: Record<string, ImageBindingView>;
} | null>;

export interface UseProductsEntryParams {
  shopName: string;
  shopMirrorKey: string;
  isAuthorized: boolean;
  scanDone: boolean;
  scanStats: ScanSummaryStats;
  loadSummary: LoadSummaryFn;
  commitAnalysisBaseline: (products: ShopMirrorProduct[]) => void;
  cancelScan: () => void;
  startScan: () => Promise<void>;
  resumeActiveJob: () => Promise<boolean>;
  pollActiveMatchJobInBackground: () => void;
}

/** Scan ceremony, shop bootstrap, and result-phase visibility refresh. */
export function useProductsEntry({
  shopName,
  shopMirrorKey,
  isAuthorized,
  scanDone,
  scanStats,
  loadSummary,
  commitAnalysisBaseline,
  cancelScan,
  startScan,
  resumeActiveJob,
  pollActiveMatchJobInBackground,
}: UseProductsEntryParams) {
  const [phase, setPhase] = useState<ProductsPagePhase>("result");
  const [scanHandoff, setScanHandoff] = useState<ScanHandoffPayload | null>(
    null
  );

  const finishedRef = useRef(false);
  const scanFinishScheduledRef = useRef(false);
  const startedForShopRef = useRef<string | null>(null);

  const finishToResult = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    cancelScan();
    markScanned("products", shopMirrorKey);
    markScanHandoff(shopName, scanStats);
    const result = await loadSummary();
    if (result?.products) commitAnalysisBaseline(result.products);
    setPhase("result");
  }, [
    cancelScan,
    shopName,
    shopMirrorKey,
    loadSummary,
    scanStats,
    commitAnalysisBaseline,
  ]);

  const exitScanToProducts = useCallback(() => {
    cancelScan();
    markScanned("products", shopMirrorKey);
    finishedRef.current = true;
    scanFinishScheduledRef.current = true;
    setPhase("result");
    void loadSummary();
    void pollActiveMatchJobInBackground();
  }, [
    cancelScan,
    shopMirrorKey,
    loadSummary,
    pollActiveMatchJobInBackground,
  ]);

  const restartScan = useCallback(() => {
    finishedRef.current = false;
    scanFinishScheduledRef.current = false;
    clearScanned("products", shopMirrorKey);
    clearMirrorCache(shopMirrorKey);
    setPhase("scan");
    void startScan();
  }, [shopMirrorKey, startScan]);

  useEffect(() => {
    if (!isAuthorized) return;
    if (startedForShopRef.current === shopName) return;
    startedForShopRef.current = shopName;
    finishedRef.current = false;
    scanFinishScheduledRef.current = false;
    void (async () => {
      if (productsEntryShouldSkipCeremony(shopMirrorKey, shopName)) {
        markScanned("products", shopMirrorKey);
        setPhase("result");
        void loadSummary();
        void pollActiveMatchJobInBackground();
        return;
      }
      const resumed = await resumeActiveJob();
      if (resumed) {
        setPhase("scan");
        return;
      }
      setPhase("scan");
      await startScan();
    })();
  }, [
    isAuthorized,
    shopName,
    shopMirrorKey,
    loadSummary,
    startScan,
    resumeActiveJob,
    pollActiveMatchJobInBackground,
  ]);

  useEffect(() => {
    if (phase !== "scan" || !scanDone || scanFinishScheduledRef.current) return;
    scanFinishScheduledRef.current = true;
    const timer = window.setTimeout(() => {
      void finishToResult();
    }, SCAN_FINISH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, scanDone, finishToResult]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    setScanHandoff(consumeScanHandoff(shopName));
  }, [phase, isAuthorized, shopName]);

  useEffect(() => {
    if (phase !== "result" || !isAuthorized) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void loadSummary({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [phase, isAuthorized, loadSummary]);

  return {
    phase,
    scanHandoff,
    finishToResult,
    exitScanToProducts,
    restartScan,
  };
}
