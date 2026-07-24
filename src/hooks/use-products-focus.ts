"use client";

import { useEffect, useRef, useState } from "react";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import type { CandidateSummary } from "@/lib/agents/products/product-focus-snapshot";

/** Focus + catalog filter preset state shared by shop panel and agent rail. */
export function useProductsFocusState() {
  const [filterSummary, setFilterSummary] = useState<string[]>([]);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [scrollToProductId, setScrollToProductId] = useState<string | null>(null);
  const [focusCandidateId, setFocusCandidateId] = useState<string | null>(null);
  const [focusCandidates, setFocusCandidates] = useState<CandidateSummary[]>([]);
  const [searchModeProductId, setSearchModeProductId] = useState<string | null>(
    null
  );
  const [rematchUnboundSignal, setRematchUnboundSignal] = useState(0);
  const [filterPresetRequest, setFilterPresetRequest] = useState<{
    categoryName?: string;
    keywords?: string;
    sourceFilter?: "all" | "tangbuy" | "1688";
    priceMaxUsd?: number;
  } | null>(null);

  useEffect(() => {
    setFocusCandidateId(null);
    setFocusCandidates([]);
  }, [focusProductId]);

  return {
    filterSummary,
    setFilterSummary,
    focusProductId,
    setFocusProductId,
    scrollToProductId,
    setScrollToProductId,
    focusCandidateId,
    setFocusCandidateId,
    focusCandidates,
    setFocusCandidates,
    searchModeProductId,
    setSearchModeProductId,
    rematchUnboundSignal,
    setRematchUnboundSignal,
    filterPresetRequest,
    setFilterPresetRequest,
  };
}

export function useProductsAiFieldEdits() {
  const [aiFieldEdits, setAiFieldEdits] = useState<
    Record<string, AiFieldEditRecord>
  >({});
  const aiFieldEditsRef = useRef(aiFieldEdits);
  useEffect(() => {
    aiFieldEditsRef.current = aiFieldEdits;
  }, [aiFieldEdits]);
  return { aiFieldEdits, setAiFieldEdits, aiFieldEditsRef };
}
