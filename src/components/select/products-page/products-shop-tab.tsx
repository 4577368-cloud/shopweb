"use client";

import type { ComponentProps } from "react";
import { SmartSourcingSummaryBar } from "@/components/select/smart-sourcing-summary-bar";
import {
  ShopProductsPanel,
} from "@/components/select/shop-products-panel";
import type { RecommendedCategory } from "@/lib/catalog-sourcing-types";

export interface ProductsShopTabSummaryProps {
  ready: boolean;
  analyzed: number;
  matched: number;
  pending: number;
  unbound: number;
  pendingNewAnalysis: number;
  recommendedCategories: RecommendedCategory[];
  onRefresh: () => void;
  onViewNewArrivals: () => void;
  onBatchLinkNewArrivals?: () => void;
  batchLinkBusy: boolean;
}

export interface ProductsShopTabProps {
  summary: ProductsShopTabSummaryProps;
  panel: ComponentProps<typeof ShopProductsPanel>;
}

/** Shop tab: sourcing summary bar + mirror product pool (Step 2 shell). */
export function ProductsShopTab({ summary, panel }: ProductsShopTabProps) {
  return (
    <>
      <div className="min-h-0">
        <SmartSourcingSummaryBar
          ready={summary.ready}
          analyzed={summary.analyzed}
          matched={summary.matched}
          pending={summary.pending}
          unbound={summary.unbound}
          pendingNewAnalysis={summary.pendingNewAnalysis}
          recommendedCategories={summary.recommendedCategories}
          onRefresh={summary.onRefresh}
          onViewNewArrivals={summary.onViewNewArrivals}
          onBatchLinkNewArrivals={summary.onBatchLinkNewArrivals}
          batchLinkBusy={summary.batchLinkBusy}
        />
      </div>
      <div>
        <ShopProductsPanel {...panel} />
      </div>
    </>
  );
}
