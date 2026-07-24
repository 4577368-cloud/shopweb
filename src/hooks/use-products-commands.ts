"use client";

import { useCallback, useMemo } from "react";
import {
  aiFieldEditKey,
  type AiFieldEditRecord,
  type AiFieldId,
} from "@/lib/ai-field-edit-feedback";
import { createProductsCommandLabels } from "@/lib/products/agent-command-labels";
import { createProductsCommandExecutors } from "@/lib/products/agent-command-executors";
import { createProductsPreviewGenerators } from "@/lib/products/agent-preview-generators";
import type {
  ProductsCommandRuntime,
  ProductsTranslateFn,
} from "@/lib/products/agent-command-types";
import type { PricingTemplate, ShopMirrorProduct } from "@/lib/types";
import type { LoadSummaryFn } from "@/hooks/use-products-entry";

export interface UseProductsCommandsParams {
  shopName: string;
  template: PricingTemplate | null;
  aiFieldEditsRef: React.RefObject<Record<string, AiFieldEditRecord>>;
  setAiFieldEdits: React.Dispatch<
    React.SetStateAction<Record<string, AiFieldEditRecord>>
  >;
  setShopProducts: React.Dispatch<React.SetStateAction<ShopMirrorProduct[]>>;
  loadSummary: LoadSummaryFn;
  bumpMirrorRefresh: () => void;
  showToast: (message: string) => void;
  t: ProductsTranslateFn;
}

export function useProductsCommands({
  shopName,
  template,
  aiFieldEditsRef,
  setAiFieldEdits,
  setShopProducts,
  loadSummary,
  bumpMirrorRefresh,
  showToast,
  t,
}: UseProductsCommandsParams) {
  const labels = useMemo(() => createProductsCommandLabels(t), [t]);

  const commandRuntime = useMemo<ProductsCommandRuntime>(
    () => ({
      shopName,
      template,
      aiFieldEditsRef,
      setAiFieldEdits,
      setShopProducts,
      loadSummary,
      bumpMirrorRefresh,
      showToast,
      t,
      labels,
    }),
    [
      shopName,
      template,
      aiFieldEditsRef,
      setAiFieldEdits,
      setShopProducts,
      loadSummary,
      bumpMirrorRefresh,
      showToast,
      t,
      labels,
    ]
  );

  const clearAiFieldEdit = useCallback(
    (productId: string, field: AiFieldId) => {
      setAiFieldEdits((prev) => {
        const key = aiFieldEditKey(productId, field);
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [setAiFieldEdits]
  );

  const markAiFieldEdit = useCallback(
    (record: Omit<AiFieldEditRecord, "createdAt">) => {
      const key = aiFieldEditKey(record.productId, record.field);
      setAiFieldEdits((prev) => ({
        ...prev,
        [key]: { ...record, createdAt: Date.now() },
      }));
    },
    [setAiFieldEdits]
  );

  const previewGenerators = useMemo(
    () =>
      createProductsPreviewGenerators({
        t,
        labels,
        sessionShopName: shopName,
      }),
    [t, labels, shopName]
  );

  const commandExecutors = useMemo(
    () => createProductsCommandExecutors(commandRuntime),
    [commandRuntime]
  );

  return {
    clearAiFieldEdit,
    markAiFieldEdit,
    previewGenerators,
    commandExecutors,
  };
}
