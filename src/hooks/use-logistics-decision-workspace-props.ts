"use client";

import { useMemo } from "react";
import type { MeasureOverride, LogisticsFocusTarget } from "@/components/logistics/logistics-decision-list";
import type { LogisticsFilterMode, PostalLimitFilter } from "@/lib/logistics/display";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import type { LogisticsEstimateResult } from "@/lib/api";
import type {
  LogisticsAnalysis,
  LogisticsTemplate,
  LogisticsTypeCode,
  PricingTemplate,
  VariantLogisticsDecision,
} from "@/lib/types";

export interface UseLogisticsDecisionWorkspacePropsParams {
  enabled: boolean;
  analysis: LogisticsAnalysis | null;
  shopName: string;
  filterMode: LogisticsFilterMode;
  postalLimitFilter: PostalLimitFilter;
  quoteResults: Map<string, LogisticsEstimateResult>;
  activeTemplate: LogisticsTemplate | null;
  correctingId: string | null;
  focusTarget: LogisticsFocusTarget | null;
  onCorrect: (id: string, type: LogisticsTypeCode) => void;
  onAcceptAi: (v: VariantLogisticsDecision, pid: string) => void;
  onFetchProductQuotes: (
    productId: string,
    variants: VariantLogisticsDecision[]
  ) => void;
  onIngestProductSource: (
    productId: string,
    profile: import("@/lib/types").ProductLogisticsProfile
  ) => void;
  onCatalogIngestComplete: (
    profile: import("@/lib/types").ProductLogisticsProfile
  ) => void;
  onFetchVariantQuote: (
    variant: VariantLogisticsDecision,
    override?: MeasureOverride
  ) => void;
  onMeasureOverride: (variantId: string, next: MeasureOverride) => void;
  accepting: boolean;
  quotingProductId: string | null;
  ingestingProductId: string | null;
  quotingVariantId: string | null;
  quoteRevealVariantIds: Set<string>;
  onClearFocus: () => void;
  pricing: PricingTemplate | null;
  pipelineActive: boolean;
  pipelineProgress: LogisticsPipelineProgress;
  selectedLineByVariant: Map<string, string>;
  onSelectLine: (variantId: string, lineKey: string) => void;
}

export function useLogisticsDecisionWorkspaceProps(
  params: UseLogisticsDecisionWorkspacePropsParams
) {
  const {
    enabled,
    analysis,
    shopName,
    filterMode,
    postalLimitFilter,
    quoteResults,
    activeTemplate,
    correctingId,
    focusTarget,
    onCorrect,
    onAcceptAi,
    onFetchProductQuotes,
    onIngestProductSource,
    onCatalogIngestComplete,
    onFetchVariantQuote,
    onMeasureOverride,
    accepting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    onClearFocus,
    pricing,
    pipelineActive,
    pipelineProgress,
    selectedLineByVariant,
    onSelectLine,
  } = params;

  return useMemo(() => {
    if (!enabled || !analysis) return null;
    return {
      analysis,
      shopName,
      filterMode,
      postalLimitFilter,
      quoteResults,
      activeTemplate,
      correctingId,
      focusTarget,
      onCorrect,
      onAcceptAi,
      onFetchProductQuotes,
      onIngestProductSource,
      onCatalogIngestComplete,
      onFetchVariantQuote,
      onMeasureOverride,
      accepting,
      quotingProductId,
      ingestingProductId,
      quotingVariantId,
      quoteRevealVariantIds,
      onClearFocus,
      pricing,
      pipelineActive,
      pipelineProgress,
      selectedLineByVariant,
      onSelectLine,
    };
  }, [
    enabled,
    analysis,
    shopName,
    filterMode,
    postalLimitFilter,
    quoteResults,
    activeTemplate,
    correctingId,
    focusTarget,
    onCorrect,
    onAcceptAi,
    onFetchProductQuotes,
    onIngestProductSource,
    onCatalogIngestComplete,
    onFetchVariantQuote,
    onMeasureOverride,
    accepting,
    quotingProductId,
    ingestingProductId,
    quotingVariantId,
    quoteRevealVariantIds,
    onClearFocus,
    pricing,
    pipelineActive,
    pipelineProgress,
    selectedLineByVariant,
    onSelectLine,
  ]);
}
