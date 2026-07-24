import type { TranslateFn } from "@/i18n/server";
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
  /** Variants with at least one preview quote line (local estimate, not Shopify upload). */
  quotedPreviewCount: number;
};

export type CompletionGateResult = {
  tier: CompletionGateTier;
  /** Hard stop — only setup / pipeline (not incomplete quotes). */
  blockers: string[];
  warnings: string[];
  stats: CompletionGateStats;
  exceptionCount: number;
  footerHint: string;
  primaryButtonLabel: string;
  /** True when user may open sync (template ready, pipeline idle). */
  canProceedToSync: boolean;
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

function variantHasPreviewQuote(
  variant: VariantLogisticsDecision,
  quoteResults: Map<string, LogisticsEstimateResult>
): boolean {
  const quote = quoteResults.get(variant.thirdPlatformSkuId);
  const line = quote?.recommendedLine ?? variant.recommendedLine;
  return Boolean(line?.lineName?.trim() || line?.lineCode?.trim());
}

export function evaluateLogisticsCompletionGate(
  input: {
    hasSavedTemplate: boolean;
    pipelineActive: boolean;
    analysis: LogisticsAnalysis | null | undefined;
    quoteResults: Map<string, LogisticsEstimateResult>;
    templateMarketsConfigured: boolean;
  },
  t: TranslateFn
): CompletionGateResult {
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
    quotedPreviewCount: 0,
  };

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!hasSavedTemplate) {
    blockers.push(t("completionGate.blockerNoTemplate"));
  }
  if (!templateMarketsConfigured) {
    blockers.push(t("completionGate.blockerNoCountry"));
  }
  if (pipelineActive) {
    blockers.push(t("completionGate.blockerPipelineRunning"));
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
      if (variantHasPreviewQuote(variant, quoteResults)) {
        stats.quotedPreviewCount += 1;
      }
    }
  }

  if (stats.pendingSkuCount > 0) {
    warnings.push(
      t("completionGate.blockerSkuUnbound", { count: stats.pendingSkuCount })
    );
  }
  if (stats.missingMeasureCount > 0) {
    warnings.push(
      t("completionGate.blockerMissingMeasure", { count: stats.missingMeasureCount })
    );
  }
  if (stats.criticalUnquotedCount > 0) {
    warnings.push(
      t("completionGate.blockerPendingQuote", { count: stats.criticalUnquotedCount })
    );
  }

  if (stats.pendingReviewCount > 0) {
    warnings.push(
      t("completionGate.warningPendingReview", { count: stats.pendingReviewCount })
    );
  }
  if (stats.failedQuoteCount > 0) {
    warnings.push(
      t("completionGate.warningQuoteFailed", { count: stats.failedQuoteCount })
    );
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
      warnings.push(
        t("completionGate.warningOtherUnconfirmed", { count: stats.otherUnconfirmedCount })
      );
    }
  }

  const exceptionCount =
    stats.pendingReviewCount + stats.failedQuoteCount + stats.otherUnconfirmedCount;

  const canProceedToSync =
    hasSavedTemplate && templateMarketsConfigured && !pipelineActive;

  let tier: CompletionGateTier = "proceed";
  if (blockers.length > 0) {
    tier = "blocked";
  } else if (warnings.length > 0) {
    tier = "confirm";
  }

  let footerHint = t("completionGate.footerReady");
  let primaryButtonLabel = t("completionGate.primarySync");

  if (tier === "blocked") {
    footerHint = blockers[0] ?? t("completionGate.footerBlocked");
    primaryButtonLabel = t("completionGate.primaryBlocked");
  } else if (tier === "confirm") {
    if (stats.quotedPreviewCount > 0) {
      footerHint = t("completionGate.footerPreviewPartial", {
        quoted: stats.quotedPreviewCount,
        total: stats.totalVariants,
      });
    } else if (exceptionCount > 0) {
      footerHint = t("completionGate.footerExceptions", { count: exceptionCount });
    } else {
      footerHint = t("completionGate.footerWithExceptions");
    }
    primaryButtonLabel = t("completionGate.primarySync");
  } else if (stats.quotedPreviewCount > 0) {
    footerHint = t("completionGate.footerPreviewPartial", {
      quoted: stats.quotedPreviewCount,
      total: stats.totalVariants,
    });
  }

  return {
    tier,
    blockers,
    warnings,
    stats,
    exceptionCount,
    footerHint,
    primaryButtonLabel,
    canProceedToSync,
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
export function deriveLogisticsStepSnapshot(
  input: {
    skuReady: boolean;
    pipelineActive: boolean;
    gate: CompletionGateResult;
    logisticsCompleted?: boolean;
  },
  t: TranslateFn
): LogisticsStepSnapshot {
  if (!input.skuReady) {
    return {
      display: "not_started",
      label: t("completionGate.stepNotStarted"),
      hint: t("completionGate.stepNotStartedHint"),
    };
  }
  if (input.logisticsCompleted) {
    return {
      display: "ready",
      label: t("completionGate.stepDone"),
      hint: t("completionGate.stepDoneHint"),
    };
  }
  if (input.pipelineActive) {
    return {
      display: "running",
      label: t("completionGate.stepRunning"),
      hint: t("completionGate.stepRunningHint"),
    };
  }
  if (input.gate.tier === "blocked") {
    return {
      display: "blocked",
      label: t("completionGate.stepBlocked"),
      hint: input.gate.footerHint || t("completionGate.stepBlockedHint"),
    };
  }
  if (input.gate.tier === "confirm") {
    return {
      display: "warning",
      label: t("completionGate.stepReady"),
      hint: input.gate.footerHint || t("completionGate.stepReadyHint"),
    };
  }
  return {
    display: "ready",
    label: t("completionGate.stepReady"),
    hint: input.gate.footerHint || t("completionGate.stepReadyHint"),
  };
}
