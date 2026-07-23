import type { AuthStatus, OverviewMetrics } from "@/lib/types";
import type {
  WorkflowBindingProgress,
  WorkflowSkuProgress,
} from "@/lib/workflow-progress";

export const EMPTY_OVERVIEW: OverviewMetrics = {
  authStatus: "unauthorized",
  analyzedProducts: 0,
  matchedProducts: 0,
  pendingConfirmProducts: 0,
  autoAlignedSkus: 0,
  needsConfirmSkus: 0,
};

export function buildOverviewMetrics(
  authStatus: AuthStatus,
  binding: WorkflowBindingProgress | null,
  sku: WorkflowSkuProgress | null
): OverviewMetrics {
  const authorized = authStatus === "authorized";
  return {
    authStatus: authorized ? "authorized" : "unauthorized",
    analyzedProducts: binding?.analyzed ?? 0,
    matchedProducts: binding?.matched ?? 0,
    pendingConfirmProducts: binding?.pending ?? 0,
    autoAlignedSkus: sku ? sku.activeAuto + sku.manualActive : 0,
    needsConfirmSkus: sku ? sku.needsReview + sku.unbound : 0,
  };
}
