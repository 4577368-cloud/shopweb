"use client";

import { useCallback, useMemo, useState } from "react";
import { hasScanned } from "@/lib/scan/gate";
import {
  computeNewArrivalStats,
  readProductBaseline,
  seedProductBaselineIfEmpty,
  writeProductBaseline,
  type NewArrivalStats,
} from "@/lib/shop-product-mirror-baseline";
import type { ImageBindingView, ShopMirrorProduct } from "@/lib/types";

function emptyNewArrivalStats(): NewArrivalStats {
  return {
    newArrivalCount: 0,
    pendingNewAnalysisCount: 0,
    newArrivalIds: new Set(),
    pendingNewAnalysisIds: new Set(),
  };
}

export function useProductsNewArrivals(shopName: string, shopMirrorKey: string) {
  const emptyNewArrivals = useMemo(() => emptyNewArrivalStats(), []);
  const [newArrivalStats, setNewArrivalStats] =
    useState<NewArrivalStats>(emptyNewArrivals);

  const refreshNewArrivalAwareness = useCallback(
    (
      products: ShopMirrorProduct[],
      bindings: Record<string, ImageBindingView>
    ) => {
      if (!hasScanned("products", shopMirrorKey)) {
        setNewArrivalStats(emptyNewArrivals);
        return;
      }
      if (seedProductBaselineIfEmpty(shopName, products)) {
        setNewArrivalStats(emptyNewArrivals);
        return;
      }
      const baseline = readProductBaseline(shopName);
      setNewArrivalStats(
        computeNewArrivalStats(products, bindings, baseline, shopName)
      );
    },
    [shopName, shopMirrorKey, emptyNewArrivals]
  );

  const commitAnalysisBaseline = useCallback(
    (products: ShopMirrorProduct[]) => {
      writeProductBaseline(
        shopName,
        products.map((p) => p.thirdPlatformItemId)
      );
      setNewArrivalStats(emptyNewArrivals);
    },
    [shopName, emptyNewArrivals]
  );

  return {
    newArrivalStats,
    refreshNewArrivalAwareness,
    commitAnalysisBaseline,
  };
}
