import type { TranslateFn } from "@/i18n/server";
import type { LogisticsEstimateResult } from "@/lib/api";
import {
  buildQuoteExplainLines,
  resolveProductProfileByHint,
} from "@/lib/agents/logistics/quote-explain";
import type {
  LogisticsAnalysis,
  LogisticsTemplate,
} from "@/lib/types";
import type {
  LogisticsCommandDraft,
  LogisticsCommandExecution,
  LogisticsCommandPlan,
  LogisticsDecisionStatus,
} from "./command-schema";

export interface LogisticsPageContext {
  focusProductTitle: string | null;
  focusProductId: string | null;
  currentFilter: string | null;
  readyAcceptCount: number;
  pendingCount: number;
  confirmedCount: number;
  highRiskTypes: string[];
  readyVariantIds: string[];
  pipelineRunning?: boolean;
  analysis?: LogisticsAnalysis | null;
  quoteResults?: Map<string, LogisticsEstimateResult>;
  activeTemplate?: LogisticsTemplate | null;
}

function statusLabel(t: TranslateFn, status: LogisticsDecisionStatus): string {
  const keys: Record<LogisticsDecisionStatus, string> = {
    pending_sku: "agentLogistics.statusPendingSku",
    pending_postal_meta: "agentLogistics.statusPendingPostalMeta",
    ready_for_quote: "agentLogistics.statusReadyForQuote",
    confirmed: "agentLogistics.statusConfirmed",
    restricted: "agentLogistics.statusRestricted",
    needs_review: "agentLogistics.statusNeedsReview",
  };
  return t(keys[status]);
}

function focusTitle(
  t: TranslateFn,
  ctx: LogisticsPageContext
): string {
  if (ctx.focusProductTitle) return ctx.focusProductTitle;
  if (ctx.focusProductId) {
    return t("agentLogistics.productFallback", {
      id: ctx.focusProductId.slice(-8),
    });
  }
  return t("agentLogistics.noProductSelected");
}

export function planLogisticsCommand(
  t: TranslateFn,
  draft: LogisticsCommandDraft,
  ctx: LogisticsPageContext
): LogisticsCommandPlan {
  const title = focusTitle(t, ctx);

  switch (draft.intent) {
    case "accept_all_ready": {
      const totalCount = ctx.readyAcceptCount;
      if (totalCount === 0) {
        return {
          draft,
          operation: t("agentLogistics.opAcceptAllReady"),
          targetLabel: t("agentLogistics.targetPendingPlans"),
          detailLines: [],
          executable: false,
          clarify: t("agentLogistics.clarifyNoReadyPlans"),
        };
      }
      return {
        draft: {
          ...draft,
          targetScope: "all",
          confirmationRequired: true,
          params: {
            ...draft.params,
          },
        },
        operation: t("agentLogistics.opAcceptAllReady"),
        targetLabel: t("agentLogistics.targetPendingPlansCount", {
          count: totalCount,
        }),
        detailLines: [
          t("agentLogistics.detailAcceptCount", { count: totalCount }),
          t("agentLogistics.detailAcceptRecommend"),
        ],
        executable: true,
      };
    }
    case "start_estimate": {
      if (ctx.pipelineRunning) {
        return {
          draft,
          operation: t("agentLogistics.opStartEstimate"),
          targetLabel: t("agentLogistics.targetStartEstimate"),
          detailLines: [],
          executable: false,
          clarify: t("agentLogistics.clarifyPipelineRunning"),
        };
      }
      return {
        draft: {
          ...draft,
          targetScope: "all",
        },
        operation: t("agentLogistics.opStartEstimate"),
        targetLabel: t("agentLogistics.targetStartEstimate"),
        detailLines: [
          t("agentLogistics.detailStartEstimateLine1"),
          t("agentLogistics.detailStartEstimateLine2"),
        ],
        executable: true,
      };
    }
    case "fetch_quotes": {
      return {
        draft: {
          ...draft,
          targetScope: "all",
        },
        operation: t("agentLogistics.opFetchQuotes"),
        targetLabel: t("agentLogistics.targetFetchAll"),
        detailLines: [
          t("agentLogistics.detailFetchLine1"),
          t("agentLogistics.detailFetchLine2"),
        ],
        executable: true,
      };
    }
    case "open_template": {
      return {
        draft: {
          ...draft,
          targetScope: "none",
        },
        operation: t("agentLogistics.opOpenTemplate"),
        targetLabel: t("agentLogistics.targetTemplateConfig"),
        detailLines: [
          t("agentLogistics.detailOpenTemplateLine1"),
          t("agentLogistics.detailOpenTemplateLine2"),
        ],
        executable: true,
      };
    }
    case "focus_status": {
      if (draft.params.listFilter) {
        const tabLabels: Record<string, string> = {
          pending_quote: t("agentLogistics.tabPendingQuote"),
          pending_confirm: t("agentLogistics.tabPendingConfirm"),
          needs_attention: t("agentLogistics.tabNeedsAttention"),
        };
        const tabLabel =
          tabLabels[draft.params.listFilter] ?? draft.params.listFilter;
        return {
          draft: {
            ...draft,
            targetScope: "all",
            params: { ...draft.params },
          },
          operation: t("agentLogistics.opFocusStatus"),
          targetLabel: tabLabel,
          detailLines: [
            t("agentLogistics.detailFocusListFilter", { tab: tabLabel }),
          ],
          executable: true,
        };
      }
      const status = draft.params.status ?? "needs_review";
      const label = statusLabel(t, status);
      const extraFilters: string[] = [];
      if (draft.params.exceptionType) extraFilters.push(draft.params.exceptionType);
      if (draft.params.needsMeasure) extraFilters.push(t("agentLogistics.filterNeedsMeasure"));
      if (draft.params.quoteStatus) extraFilters.push(draft.params.quoteStatus === "quoted" ? t("agentLogistics.filterQuoted") : t("agentLogistics.filterUnquoted"));
      return {
        draft: {
          ...draft,
          targetScope: "all",
          params: {
            ...draft.params,
            status,
          },
        },
        operation: t("agentLogistics.opFocusStatus"),
        targetLabel: extraFilters.length > 0 ? `${label} · ${extraFilters.join(" / ")}` : label,
        detailLines: [
          t("agentLogistics.detailFocusStatus", { status: label }),
          ...(extraFilters.length > 0 ? [t("agentLogistics.detailExtraFilters", { filters: extraFilters.join(" / ") })] : []),
        ],
        executable: true,
      };
    }
    case "explain_quote": {
      const profiles = ctx.analysis?.productProfiles ?? [];
      const hint =
        draft.params.productTitleHint?.trim() ||
        draft.productId?.trim() ||
        ctx.focusProductTitle?.trim() ||
        undefined;
      const profile = resolveProductProfileByHint(profiles, {
        productId: draft.productId ?? ctx.focusProductId,
        titleHint: hint,
        focusTitle: ctx.focusProductTitle,
      });
      if (!profile) {
        return {
          draft,
          operation: t("agentLogistics.opExplainQuote"),
          targetLabel: hint ?? title,
          detailLines: [],
          executable: false,
          clarify: t("agentLogistics.clarifySelectProductForQuote"),
        };
      }
      const quoteMap = ctx.quoteResults ?? new Map();
      const lines = buildQuoteExplainLines(
        t,
        profile,
        quoteMap,
        ctx.activeTemplate ?? null
      );
      return {
        draft: {
          ...draft,
          targetScope: "current",
          productId: profile.thirdPlatformItemId,
          params: {
            ...draft.params,
            productTitleHint: profile.title ?? hint,
          },
        },
        operation: t("agentLogistics.opExplainQuote"),
        targetLabel: profile.title ?? title,
        detailLines: lines,
        executable: true,
      };
    }
    default:
      return {
        draft,
        operation: t("agentLogistics.opExecute"),
        targetLabel: title,
        detailLines: [],
        executable: false,
        clarify: t("agentLogistics.clarifyNotImplemented"),
      };
  }
}

export function commandRequiresConfirmation(plan: LogisticsCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "accept_all_ready"
  );
}

export function commandOperationLabel(
  t: TranslateFn,
  intent: LogisticsCommandDraft["intent"]
): string {
  switch (intent) {
    case "accept_all_ready":
      return t("agentLogistics.opAcceptAllReady");
    case "fetch_quotes":
      return t("agentLogistics.opFetchQuotes");
    case "start_estimate":
      return t("agentLogistics.opStartEstimate");
    case "open_template":
      return t("agentLogistics.opOpenTemplate");
    case "focus_status":
      return t("agentLogistics.opFocusStatus");
    case "explain_quote":
      return t("agentLogistics.opExplainQuote");
    default:
      return t("agentLogistics.opExecute");
  }
}

export function resolveLogisticsCommandExecution(
  plan: LogisticsCommandPlan,
  ctx: LogisticsPageContext
): LogisticsCommandExecution | null {
  switch (plan.draft.intent) {
    case "accept_all_ready": {
      return {
        type: "accept_all_ready",
        variantIds: ctx.readyVariantIds,
        totalCount: ctx.readyAcceptCount,
      };
    }
    case "start_estimate": {
      return { type: "start_estimate" };
    }
    case "fetch_quotes": {
      return { type: "fetch_quotes" };
    }
    case "open_template": {
      return { type: "open_template" };
    }
    case "focus_status": {
      if (plan.draft.params.listFilter) {
        return {
          type: "set_filter",
          filterMode: plan.draft.params.listFilter,
        };
      }
      const status = plan.draft.params.status ?? "needs_review";
      return { type: "focus_status", status };
    }
    case "explain_quote": {
      const productId = plan.draft.productId;
      if (!productId) return null;
      return {
        type: "explain_quote",
        productId,
        lines: plan.detailLines,
      };
    }
    default:
      return null;
  }
}
