"use client";

import type { ComponentProps } from "react";
import { SmartSourcingSummaryBar } from "@/components/select/smart-sourcing-summary-bar";
import { ShopProductsPanel } from "@/components/select/shop-products-panel";

export interface ProductsShopTabSummaryProps {
  pendingNewAnalysis: number;
}

export interface ProductsShopTabProps {
  summary: ProductsShopTabSummaryProps;
  panel: ComponentProps<typeof ShopProductsPanel>;
  /** Sticky-toolbar host for filter chips. */
  filtersMountEl?: HTMLElement | null;
  /** Sticky-toolbar host for batch-ack / refresh (right cluster). */
  actionsMountEl?: HTMLElement | null;
}

/** Shop tab: optional new-arrivals banner + mirror product pool. */
export function ProductsShopTab({
  summary,
  panel,
  filtersMountEl = null,
  actionsMountEl = null,
}: ProductsShopTabProps) {
  return (
    <>
      <SmartSourcingSummaryBar
        pendingNewAnalysis={summary.pendingNewAnalysis}
      />
      <ShopProductsPanel
        {...panel}
        filtersMountEl={filtersMountEl}
        actionsMountEl={actionsMountEl}
      />
    </>
  );
}
