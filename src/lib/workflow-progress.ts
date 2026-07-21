import { computeSkuAlignMetrics } from "@/lib/sku-align/display";
import {
  computeShopProductBindingStats,
  indexImageBindings,
} from "@/lib/shop-product-binding-stats";
import type { ImageBindingView, ShopMirrorProduct, StepStatus } from "@/lib/types";

export type WorkflowBindingProgress = ReturnType<
  typeof computeShopProductBindingStats
>;

export type WorkflowSkuProgress = ReturnType<typeof computeSkuAlignMetrics>;

export function computeWorkflowBindingProgress(
  products: ShopMirrorProduct[],
  bindings: ImageBindingView[]
): WorkflowBindingProgress {
  return computeShopProductBindingStats(products, indexImageBindings(bindings));
}

export function computeWorkflowSkuProgress(
  products: Parameters<typeof computeSkuAlignMetrics>[0]
): WorkflowSkuProgress {
  return computeSkuAlignMetrics(products);
}

export function isProductsStepComplete(
  binding: WorkflowBindingProgress | null | undefined
): boolean {
  if (!binding || binding.analyzed <= 0) return false;
  return binding.unbound === 0 && binding.pending === 0;
}

export function isSkuStepComplete(
  sku: WorkflowSkuProgress | null | undefined
): boolean {
  if (!sku || sku.productCount <= 0) return false;
  return sku.issueProductCount === 0;
}

export function deriveProductsStepStatus(
  authorized: boolean,
  binding: WorkflowBindingProgress | null | undefined
): StepStatus {
  if (!authorized) return "not_started";
  if (!binding) return "pending_confirm";
  if (binding.analyzed === 0) return "pending_confirm";
  if (isProductsStepComplete(binding)) return "completed";
  if (binding.matched > 0 || binding.unbound > 0 || binding.pending > 0) {
    return "in_progress";
  }
  return "pending_confirm";
}

export function deriveSkuStepStatus(
  authorized: boolean,
  productsComplete: boolean,
  sku: WorkflowSkuProgress | null | undefined
): StepStatus {
  if (!authorized || !productsComplete) return "not_started";
  if (!sku) return "pending_confirm";
  if (sku.productCount === 0) return "pending_confirm";
  if (isSkuStepComplete(sku)) return "completed";
  return "in_progress";
}

export function deriveLogisticsStepStatus(
  authorized: boolean,
  skuComplete: boolean,
  logisticsCompleted: boolean
): StepStatus {
  if (!authorized || !skuComplete) return "not_started";
  if (logisticsCompleted) return "completed";
  return "in_progress";
}
