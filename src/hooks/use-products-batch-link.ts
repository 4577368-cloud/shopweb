"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShopFilter } from "@/components/select/shop-products-panel";
import type { BatchLinkProgress, BatchLinkRequest } from "@/lib/batch-link/types";
import type { ProductsPageTab } from "@/lib/products/page-constants";
import type { NewArrivalStats } from "@/lib/shop-product-mirror-baseline";

type TranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface UseProductsBatchLinkParams {
  setTab: (tab: ProductsPageTab) => void;
  setShopFilter: (filter: ShopFilter) => void;
  showToast: (message: string) => void;
  t: TranslateFn;
  newArrivalStats: NewArrivalStats;
}

export function useProductsBatchLink({
  setTab,
  setShopFilter,
  showToast,
  t,
  newArrivalStats,
}: UseProductsBatchLinkParams) {
  const [batchLinkProgress, setBatchLinkProgress] = useState<BatchLinkProgress | null>(
    null
  );
  const [batchLinkRequest, setBatchLinkRequest] = useState<BatchLinkRequest | null>(
    null
  );
  const [pageLinkableScope, setPageLinkableScope] = useState<{
    ids: string[];
    page: number;
    totalPages: number;
  }>({ ids: [], page: 1, totalPages: 1 });

  const batchLinkRequestSeq = useRef(0);
  const batchLinkBusyRef = useRef(false);

  const fireBatchLink = useCallback(
    (source: BatchLinkRequest["source"], productIds?: string[]) => {
      batchLinkRequestSeq.current += 1;
      setBatchLinkRequest({
        signal: batchLinkRequestSeq.current,
        source,
        productIds,
      });
    },
    []
  );

  const batchLinkActive = batchLinkProgress?.active ?? false;
  const pageLinkableCount = pageLinkableScope.ids.length;

  useEffect(() => {
    batchLinkBusyRef.current = batchLinkActive;
  }, [batchLinkActive]);

  const handleBatchLinkProgressChange = useCallback((progress: BatchLinkProgress) => {
    batchLinkBusyRef.current = progress.active;
    setBatchLinkProgress(progress);
  }, []);

  const enqueueBatchLink = useCallback(
    (source: BatchLinkRequest["source"]) => {
      if (batchLinkActive) return;
      if (pageLinkableScope.ids.length === 0) {
        showToast(t("productsPage.toastNoLinkable"));
        return;
      }
      setTab("shop");
      setShopFilter("all");
      fireBatchLink(source, pageLinkableScope.ids);
    },
    [
      batchLinkActive,
      fireBatchLink,
      pageLinkableScope.ids,
      setTab,
      setShopFilter,
      showToast,
      t,
    ]
  );

  const newLinkableIds = useMemo(
    () =>
      pageLinkableScope.ids.filter((id) =>
        newArrivalStats.pendingNewAnalysisIds.has(id)
      ),
    [pageLinkableScope.ids, newArrivalStats.pendingNewAnalysisIds]
  );

  const hasNewProductsToLink = newLinkableIds.length > 0;

  const enqueueNewArrivalsBatchLink = useCallback(() => {
    if (batchLinkActive) return;
    if (newLinkableIds.length === 0) {
      showToast(t("productsPage.toastNoNewToLink"));
      return;
    }
    setTab("shop");
    setShopFilter("all");
    fireBatchLink("manual", newLinkableIds);
  }, [
    batchLinkActive,
    fireBatchLink,
    newLinkableIds,
    setTab,
    setShopFilter,
    showToast,
    t,
  ]);

  const enqueueUnboundMatch = useCallback(() => {
    enqueueBatchLink("manual");
  }, [enqueueBatchLink]);

  return {
    batchLinkBusyRef,
    batchLinkProgress,
    setBatchLinkProgress,
    batchLinkRequest,
    pageLinkableScope,
    setPageLinkableScope,
    batchLinkActive,
    pageLinkableCount,
    handleBatchLinkProgressChange,
    hasNewProductsToLink,
    newLinkableIds,
    enqueueNewArrivalsBatchLink,
    enqueueUnboundMatch,
  };
}
