import type { RefObject, Dispatch, SetStateAction } from "react";
import type { AiFieldEditRecord } from "@/lib/ai-field-edit-feedback";
import type { PricingTemplate, ShopMirrorProduct } from "@/lib/types";
import type { LoadSummaryFn } from "@/hooks/use-products-entry";
import type { ProductsCommandLabels } from "@/lib/products/agent-command-labels";

export type ProductsTranslateFn = (
  key: string,
  params?: Record<string, string | number>
) => string;

export interface ProductsCommandRuntime {
  shopName: string;
  template: PricingTemplate | null;
  aiFieldEditsRef: RefObject<Record<string, AiFieldEditRecord>>;
  setAiFieldEdits: Dispatch<
    SetStateAction<Record<string, AiFieldEditRecord>>
  >;
  setShopProducts: Dispatch<SetStateAction<ShopMirrorProduct[]>>;
  loadSummary: LoadSummaryFn;
  bumpMirrorRefresh: () => void;
  showToast: (message: string) => void;
  t: ProductsTranslateFn;
  labels: ProductsCommandLabels;
}
