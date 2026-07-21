"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  CatalogProductCard,
  type PublishCellState,
} from "@/components/select/catalog-product-card";
import type { CatalogRecommendation } from "@/lib/types";

export interface CatalogProductGridProps {
  items: CatalogRecommendation[];
  page: number;
  pageSize: number;
  pageLoading: boolean;
  pageTurning: boolean;
  hasNextPage: boolean;
  /** Map candidateId → purchase price in target currency (USD). */
  purchasePriceById: Record<string, number | null>;
  targetCurrency: string;
  publishState: Record<string, PublishCellState>;
  onPublish: (item: CatalogRecommendation) => void;
  onLink: (item: CatalogRecommendation) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function CatalogProductGrid({
  items,
  page,
  pageLoading,
  pageTurning,
  hasNextPage,
  purchasePriceById,
  targetCurrency,
  publishState,
  onPublish,
  onLink,
  onPrevPage,
  onNextPage,
}: CatalogProductGridProps) {
  if (pageLoading) {
    return (
      <Card>
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  if (items.length === 0 && !pageTurning) {
    return (
      <EmptyState
        title="暂无可上架的货源商品"
        description="尝试调整关键词或类目筛选，或清空条件后重试。"
      />
    );
  }

  return (
    <>
      <div
        className={
          pageTurning
            ? "grid grid-cols-1 gap-3 opacity-60 transition-opacity sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        {items.map((item) => (
          <CatalogProductCard
            key={item.candidateId}
            item={item}
            purchasePriceUsd={purchasePriceById[item.candidateId]}
            targetCurrency={targetCurrency}
            state={publishState[item.candidateId]}
            onPublish={() => onPublish(item)}
            onLink={() => onLink(item)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={onPrevPage}
          disabled={page <= 1 || pageTurning}
        >
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <span className="min-w-[4.5rem] text-center text-xs text-ink-subtle">
          {pageTurning ? "加载中…" : `第 ${page} 页`}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={onNextPage}
          disabled={!hasNextPage || pageTurning}
        >
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
