import type { LogisticsEstimateResult } from "@/lib/api";
import {
  computeLogisticsPlanMetrics,
  countBatchAcceptableVariants,
  type LogisticsPlanMetrics,
} from "@/lib/logistics/display";
import type { LogisticsAnalysis } from "@/lib/types";

/** 物流页工作台统一状态 — 主列表 Tab、右侧建议、批量操作的唯一口径来源 */
export interface LogisticsWorkbenchState {
  metrics: LogisticsPlanMetrics;
  /** 与「待确认」Tab 及 variantMatchesFilter(pending_confirm) 一致 */
  batchAcceptCount: number;
  actions: {
    canEstimate: boolean;
    estimateCount: number;
    canBatchAccept: boolean;
    batchAcceptCount: number;
  };
}

export function deriveLogisticsWorkbenchState(
  analysis: LogisticsAnalysis | null | undefined,
  quoteResults?: Map<string, LogisticsEstimateResult>,
  opts?: { pipelineRunning?: boolean }
): LogisticsWorkbenchState {
  const metrics = computeLogisticsPlanMetrics(analysis, quoteResults);
  const batchAcceptCount = countBatchAcceptableVariants(
    analysis,
    quoteResults ?? new Map()
  );

  const pipelineRunning = opts?.pipelineRunning === true;

  return {
    metrics,
    batchAcceptCount,
    actions: {
      canEstimate: !pipelineRunning && metrics.pendingQuoteCount > 0,
      estimateCount: metrics.pendingQuoteCount,
      canBatchAccept: !pipelineRunning && batchAcceptCount > 0,
      batchAcceptCount,
    },
  };
}

/** 开发期不变量：批量接受数量必须等于待确认 Tab 数量 */
export function assertLogisticsWorkbenchInvariants(
  state: LogisticsWorkbenchState
): void {
  if (state.batchAcceptCount !== state.metrics.pendingConfirmCount) {
    throw new Error(
      `logistics invariant: batchAcceptCount (${state.batchAcceptCount}) !== pendingConfirmCount (${state.metrics.pendingConfirmCount})`
    );
  }
  if (state.actions.batchAcceptCount !== state.batchAcceptCount) {
    throw new Error("logistics invariant: actions.batchAcceptCount mismatch");
  }
}
