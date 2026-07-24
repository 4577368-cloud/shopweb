"use client";

import { useEffect, type MutableRefObject } from "react";
import { api } from "@/lib/api";
import {
  autoAlignUnboundProducts,
  autoConfirmPendingVariants,
} from "@/lib/sku-align/auto-align-unresolved";
import { scrollToFirstSkuIssueProduct } from "@/lib/sku-align/deep-link";
import type { SkuProductOverview } from "@/lib/types";
import type { SkuFilterMode } from "@/components/sku-align/sku-binding-panel";

type SkuAlignPhase = "scan" | "result";

export interface UseSkuAlignAutoAlignParams {
  phase: SkuAlignPhase;
  isAuthorized: boolean;
  loading: boolean;
  products: SkuProductOverview[];
  shopName: string;
  setProducts: React.Dispatch<React.SetStateAction<SkuProductOverview[]>>;
  hasLoadedOnceRef: MutableRefObject<boolean>;
  skipNextAutoAlignRef: MutableRefObject<boolean>;
  autoAlignStartedRef: MutableRefObject<string | null>;
}

/** Silent PAGE_ENTER align for unbound variants after scan/cache skip. */
export function useSkuAlignAutoAlign({
  phase,
  isAuthorized,
  loading,
  products,
  shopName,
  setProducts,
  hasLoadedOnceRef,
  skipNextAutoAlignRef,
  autoAlignStartedRef,
}: UseSkuAlignAutoAlignParams) {
  useEffect(() => {
    if (phase !== "result" || !isAuthorized || loading) return;
    if (!hasLoadedOnceRef.current || loading) return;
    if (autoAlignStartedRef.current === shopName) return;
    if (skipNextAutoAlignRef.current) {
      skipNextAutoAlignRef.current = false;
      autoAlignStartedRef.current = shopName;
      return;
    }
    autoAlignStartedRef.current = shopName;
    if (products.length === 0) return;
    void (async () => {
      try {
        const status = await autoAlignUnboundProducts(shopName, products);
        if (
          status &&
          (status.runStatus === "SUCCEEDED" || status.runStatus === "PARTIAL")
        ) {
          const next = await api.getSkuOverview(shopName);
          setProducts(next);
          try {
            await autoConfirmPendingVariants(shopName, next);
            const confirmed = await api.getSkuOverview(shopName);
            setProducts(confirmed);
          } catch {
            // 自动确认失败不影响用户操作，仍可手动确认
          }
        }
      } catch {
        // Fail-open — user can still tap per-product align.
      }
    })();
  }, [
    phase,
    isAuthorized,
    loading,
    products,
    shopName,
    setProducts,
    hasLoadedOnceRef,
    skipNextAutoAlignRef,
    autoAlignStartedRef,
  ]);
}

export interface UseSkuAlignPartiallyLinkedScrollParams {
  phase: SkuAlignPhase;
  loading: boolean;
  filter: SkuFilterMode;
  filtered: SkuProductOverview[];
  pendingScrollRef: MutableRefObject<boolean>;
}

export function useSkuAlignPartiallyLinkedScroll({
  phase,
  loading,
  filter,
  filtered,
  pendingScrollRef,
}: UseSkuAlignPartiallyLinkedScrollParams) {
  useEffect(() => {
    if (!pendingScrollRef.current) return;
    if (phase !== "result" || loading) return;
    if (filter !== "partially_linked") return;
    if (filtered.length === 0) {
      pendingScrollRef.current = false;
      return;
    }
    pendingScrollRef.current = false;
    scrollToFirstSkuIssueProduct();
  }, [phase, loading, filter, filtered, pendingScrollRef]);
}
