"use client";

import { ChevronLeft, ChevronRight } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FadeSwap } from "@/components/ui/fade-swap";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/LocaleProvider";
import {
  CatalogProductCard,
  type PublishCellState,
} from "@/components/select/catalog-product-card";
import type { SourcingSource } from "@/lib/sourcing/types";
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
  sourcingMetaById?: Record<
    string,
    {
      source: SourcingSource;
      detailUrl?: string | null;
    }
  >;
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
  sourcingMetaById = {},
  targetCurrency,
  publishState,
  onPublish,
  onLink,
  onPrevPage,
  onNextPage,
}: CatalogProductGridProps) {
  const t = useT();
  return (
    <FadeSwap
      loading={pageLoading}
      minHeightClass="min-h-[420px]"
      skeleton={
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      }
    >
      {items.length === 0 && !pageTurning ? (
        <EmptyState
          title={t("catalogGrid.emptyTitle")}
          description={t("catalogGrid.emptyDesc")}
        />
      ) : (
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
                sourcingSource={sourcingMetaById[item.candidateId]?.source}
                sourceDetailUrl={sourcingMetaById[item.candidateId]?.detailUrl}
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
              {t("catalogGrid.prevPage")}
            </Button>
            <span className="min-w-[4.5rem] text-center text-xs text-ink-subtle">
              {pageTurning ? t("catalogGrid.pageLoading") : t("catalogGrid.pageNumber", { page })}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={onNextPage}
              disabled={!hasNextPage || pageTurning}
            >
              {t("catalogGrid.nextPage")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </FadeSwap>
  );
}
