import type { LogisticsEstimateResult } from "@/lib/api";
import {
  effectiveQuoteStatus,
  isVariantException,
  isVariantUnidentified,
} from "@/lib/logistics/display";
import type { LogisticsAnalysis, VariantLogisticsDecision } from "@/lib/types";

export type CompletionGateTier = "proceed" | "confirm" | "blocked";

export type CompletionGateStats = {
  totalVariants: number;
  confirmedCount: number;
  pendingReviewCount: number;
  failedQuoteCount: number;
  pendingSkuCount: number;
  missingMeasureCount: number;
  criticalUnquotedCount: number;
  otherUnconfirmedCount: number;
};

export type CompletionGateResult = {
  tier: CompletionGateTier;
  blockers: string[];
  warnings: string[];
  stats: CompletionGateStats;
  exceptionCount: number;
  footerHint: string;
  primaryButtonLabel: string;
};

function variantMissingCriticalQuote(
  variant: VariantLogisticsDecision,
  quoteResults: Map<string, LogisticsEstimateResult>
): boolean {
  if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") return false;
  if (isVariantUnidentified(variant)) return false;
  if (isVariantException(variant)) return false;
  if (variant.decisionStatus !== "ready_for_quote") return false;

  const quote = quoteResults.get(variant.thirdPlatformSkuId);
  if (quote?.recommendedLine) return false;

  return true;
}

function variantFailedQuote(
  variant: VariantLogisticsDecision,
  quoteResults: Map<string, LogisticsEstimateResult>
): boolean {
  if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") return false;
  const quote = quoteResults.get(variant.thirdPlatformSkuId);
  const status = effectiveQuoteStatus({
    recommendedLine: quote?.recommendedLine ?? variant.recommendedLine,
    quoteStatus: quote?.quoteStatus ?? variant.quoteStatus,
  });
  return status === "FAILED" || Boolean(quote?.errorMessage?.trim());
}

function variantPendingReview(variant: VariantLogisticsDecision): boolean {
  if (variant.decisionConfirmed || variant.decisionStatus === "confirmed") return false;
  return isVariantException(variant);
}

function countLabel(n: number, suffix: string): string {
  return `${n} ${suffix}`;
}

export function evaluateLogisticsCompletionGate(input: {
  hasSavedTemplate: boolean;
  pipelineActive: boolean;
  analysis: LogisticsAnalysis | null | undefined;
  quoteResults: Map<string, LogisticsEstimateResult>;
  templateMarketsConfigured: boolean;
}): CompletionGateResult {
  const {
    hasSavedTemplate,
    pipelineActive,
    analysis,
    quoteResults,
    templateMarketsConfigured,
  } = input;

  const stats: CompletionGateStats = {
    totalVariants: analysis?.totalVariants ?? 0,
    confirmedCount: analysis?.decisionStatusCounts?.confirmed ?? 0,
    pendingReviewCount: 0,
    failedQuoteCount: 0,
    pendingSkuCount: 0,
    missingMeasureCount: 0,
    criticalUnquotedCount: 0,
    otherUnconfirmedCount: 0,
  };

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!hasSavedTemplate) {
    blockers.push("先保存物流模板");
  }
  if (!templateMarketsConfigured) {
    blockers.push("先选销售国家");
  }
  if (pipelineActive) {
    blockers.push("匹配进行中");
  }

  for (const product of analysis?.productProfiles ?? []) {
    for (const variant of product.variantDecisions ?? []) {
      if (isVariantUnidentified(variant)) {
        stats.pendingSkuCount += 1;
      }
      if (variant.decisionStatus === "pending_postal_meta") {
        stats.missingMeasureCount += 1;
      }
      if (variantPendingReview(variant)) {
        stats.pendingReviewCount += 1;
      }
      if (variantFailedQuote(variant, quoteResults)) {
        stats.failedQuoteCount += 1;
      }
      if (variantMissingCriticalQuote(variant, quoteResults)) {
        stats.criticalUnquotedCount += 1;
      }
    }
  }

  if (stats.pendingSkuCount > 0) {
    warnings.push(
      `${stats.pendingSkuCount} 个 SKU 未绑定，已绑定部分仍可报价与确认`
    );
  }
  if (stats.missingMeasureCount > 0) {
    blockers.push(`缺 ${stats.missingMeasureCount} 个重量信息`);
  }
  if (stats.criticalUnquotedCount > 0) {
    blockers.push(countLabel(stats.criticalUnquotedCount, "个 SKU 待报价"));
  }

  if (stats.pendingReviewCount > 0) {
    warnings.push(countLabel(stats.pendingReviewCount, "个物流方案待确认"));
  }
  if (stats.failedQuoteCount > 0) {
    warnings.push(countLabel(stats.failedQuoteCount, "个报价失败"));
  }

  const unconfirmedCount = stats.totalVariants - stats.confirmedCount;
  if (unconfirmedCount > 0) {
    stats.otherUnconfirmedCount = Math.max(
      0,
      unconfirmedCount - stats.pendingReviewCount - stats.failedQuoteCount
    );
    if (
      stats.otherUnconfirmedCount > 0 &&
      stats.criticalUnquotedCount === 0 &&
      stats.pendingSkuCount === 0
    ) {
      warnings.push(countLabel(stats.otherUnconfirmedCount, "个方案待确认"));
    }
  }

  const exceptionCount =
    stats.pendingReviewCount + stats.failedQuoteCount + stats.otherUnconfirmedCount;

  let tier: CompletionGateTier = "proceed";
  if (blockers.length > 0) {
    tier = "blocked";
  } else if (warnings.length > 0) {
    tier = "confirm";
  }

  let footerHint = "可进入同步";
  let primaryButtonLabel = "进入同步";

  if (tier === "blocked") {
    const quoteOnlyBlocked =
      stats.criticalUnquotedCount > 0 &&
      stats.missingMeasureCount === 0 &&
      hasSavedTemplate &&
      templateMarketsConfigured &&
      !pipelineActive;
    if (quoteOnlyBlocked) {
      footerHint = `${stats.criticalUnquotedCount} 个 SKU 待运费预估`;
      primaryButtonLabel = `运费预估 (${stats.criticalUnquotedCount})`;
    } else {
      footerHint = blockers[0] ?? "先处理阻塞项";
      primaryButtonLabel = "先处理阻塞项";
    }
  } else if (tier === "confirm") {
    footerHint =
      exceptionCount > 0
        ? `${exceptionCount} 项例外待处理`
        : "含例外项";
    primaryButtonLabel =
      exceptionCount > 0
        ? `进入同步（${exceptionCount} 项例外）`
        : "进入同步（含例外）";
  }

  return {
    tier,
    blockers,
    warnings,
    stats,
    exceptionCount,
    footerHint,
    primaryButtonLabel,
  };
}

export type LogisticsStepDisplay =
  | "not_started"
  | "running"
  | "blocked"
  | "warning"
  | "ready";

export type LogisticsStepSnapshot = {
  display: LogisticsStepDisplay;
  label: string;
  hint: string;
};

/** Sidebar logistics step — aligned with completion gate + pipeline. */
export function deriveLogisticsStepSnapshot(input: {
  skuReady: boolean;
  pipelineActive: boolean;
  gate: CompletionGateResult;
  logisticsCompleted?: boolean;
}): LogisticsStepSnapshot {
  if (!input.skuReady) {
    return { display: "not_started", label: "待开始", hint: "待开始" };
  }
  if (input.logisticsCompleted) {
    return { display: "ready", label: "已完成", hint: "可进入同步" };
  }
  if (input.pipelineActive) {
    return { display: "running", label: "匹配中", hint: "匹配进行中" };
  }
  if (input.gate.tier === "blocked") {
    return {
      display: "blocked",
      label: "有阻塞",
      hint: input.gate.footerHint,
    };
  }
  if (input.gate.tier === "confirm") {
    return {
      display: "warning",
      label: "有例外",
      hint: input.gate.footerHint,
    };
  }
  return {
    display: "ready",
    label: "可同步",
    hint: input.gate.footerHint,
  };
}
