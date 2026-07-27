"use client";

import type { ComponentProps } from "react";
import { SmartSourcingSummaryBar } from "@/components/select/smart-sourcing-summary-bar";
import {
  ShopProductsPanel,
} from "@/components/select/shop-products-panel";

export interface ProductsShopTabSummaryProps {
  pendingNewAnalysis: number;
  onViewNewArrivals: () => void;
  onBatchLinkNewArrivals?: () => void;
  batchLinkBusy: boolean;
}

export interface ProductsShopTabProps {
  summary: ProductsShopTabSummaryProps;
  panel: ComponentProps<typeof ShopProductsPanel>;
}

/** Shop tab: optional new-arrivals banner + mirror product pool. */
export function ProductsShopTab({ summary, panel }: ProductsShopTabProps) {
  return (
    <>
      <SmartSourcingSummaryBar
        pendingNewAnalysis={summary.pendingNewAnalysis}
        onViewNewArrivals={summary.onViewNewArrivals}
        onBatchLinkNewArrivals={summary.onBatchLinkNewArrivals}
        batchLinkBusy={summary.batchLinkBusy}
      />
      <ShopProductsPanel {...panel} />
    </>
  );
}
