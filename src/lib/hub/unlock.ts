import type { WorkflowBindingProgress } from "@/lib/workflow-progress";

/** 运营中枢解锁：当前店铺商品镜像中，已关联货源的商品占比（matched / analyzed）。 */
export const OPERATIONS_HUB_PRODUCT_MATCH_PERCENT = 80;

export function productSourceLinkPercent(
  binding: WorkflowBindingProgress | null | undefined
): number {
  if (!binding || binding.analyzed <= 0) return 0;
  return Math.round((binding.matched / binding.analyzed) * 100);
}

export function isOperationsHubReady(
  binding: WorkflowBindingProgress | null | undefined
): boolean {
  return productSourceLinkPercent(binding) >= OPERATIONS_HUB_PRODUCT_MATCH_PERCENT;
}
