import type { TranslateFn } from "@/i18n/server";
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
    case "focus_issues": {
      if (ctx.pendingCount === 0) {
        return {
          draft,
          operation: t("agentLogistics.opFocusIssues"),
          targetLabel: t("agentLogistics.targetIssues"),
          detailLines: [],
          executable: false,
          clarify: t("agentLogistics.clarifyNoIssues"),
        };
      }
      return {
        draft: {
          ...draft,
          targetScope: "all",
          params: {
            ...draft.params,
            filterMode: "issues",
          },
        },
        operation: t("agentLogistics.opFocusIssues"),
        targetLabel: t("agentLogistics.targetIssuesCount", {
          count: ctx.pendingCount,
        }),
        detailLines: [
          t("agentLogistics.detailFocusIssues", { count: ctx.pendingCount }),
        ],
        executable: true,
      };
    }
    case "focus_status": {
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
    case "apply_template": {
      return {
        draft: {
          ...draft,
          targetScope: "all",
        },
        operation: t("agentLogistics.opApplyTemplate"),
        targetLabel: t("agentLogistics.targetCurrentTemplate"),
        detailLines: [t("agentLogistics.detailApplyTemplate")],
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
    case "open_template":
      return t("agentLogistics.opOpenTemplate");
    case "focus_issues":
      return t("agentLogistics.opFocusIssues");
    case "focus_status":
      return t("agentLogistics.opFocusStatus");
    case "apply_template":
      return t("agentLogistics.opApplyTemplate");
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
    case "fetch_quotes": {
      return { type: "fetch_quotes" };
    }
    case "open_template": {
      return { type: "open_template" };
    }
    case "focus_issues": {
      return { type: "set_filter", filterMode: "issues" };
    }
    case "focus_status": {
      const status = plan.draft.params.status ?? "needs_review";
      return { type: "focus_status", status };
    }
    case "apply_template": {
      return { type: "apply_template", templateId: plan.draft.params.templateId ?? "" };
    }
    default:
      return null;
  }
}
