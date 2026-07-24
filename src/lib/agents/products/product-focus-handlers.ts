import type { AgentResponse } from "@/lib/agents/types";
import type { TranslateFn } from "@/i18n/server";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildCandidateCompareLines,
  type CandidateSummary,
} from "@/lib/agents/products/product-focus-snapshot";

function noFocusResponse(intent: ProductsIntentId, t: TranslateFn): AgentResponse {
  return {
    agentId: "sourcing_advisor",
    intent,
    summary: t("productsFocus.noFocusSummary"),
    explanation: [t("productsFocus.noFocusExpl")],
    nextSteps: [t("productsFocus.noFocusNext")],
    suggestedAction: { kind: "none" },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

export function handleProductFocusIntent(
  intent: ProductsIntentId,
  ctx: ProductsPageContext,
  candidates: CandidateSummary[] = [],
  t: TranslateFn = (k: string) => k
): AgentResponse | null {
  const focus = ctx.focusProduct;
  const needsFocus =
    intent === "explain_match_reason" ||
    intent === "explain_match_risk" ||
    intent === "compare_current_candidate";

  if (needsFocus && !focus) {
    return noFocusResponse(intent, t);
  }

  if (intent === "propose_candidate_search" && ctx.focusProductId && focus) {
    return proposeProductSearch(ctx, focus, t);
  }

  if (!focus) return null;

  switch (intent) {
    case "explain_match_reason":
      return explainMatchReason(ctx, focus, t);
    case "explain_match_risk":
      return explainMatchRisk(ctx, focus, t);
    case "compare_current_candidate":
      return compareCandidate(ctx, focus, candidates, t);
    default:
      return null;
  }
}

function explainMatchReason(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>,
  t: TranslateFn
): AgentResponse {
  const explanation = [
    t("productsFocus.productLabel", { title: focus.title }),
    ...focus.rankingReasons,
    ctx.pricing.configured
      ? t("productsFocus.focusRateShared", {
          currency: ctx.pricing.targetCurrency ?? "—",
          rate: ctx.pricing.exchangeRate ?? "—",
        })
      : t("productsFocus.focusNoPricing"),
  ];
  if (focus.bindState === "unbound") {
    explanation.push(t("productsFocus.focusUnboundHint"));
  }

  return {
    agentId: "sourcing_advisor",
    intent: "explain_match_reason",
    summary: t("productsFocus.reasonSummary"),
    explanation,
    nextSteps:
      focus.bindState === "pending"
        ? [t("productsFocus.nextConfirmOrRebind"), t("productsFocus.nextOrOpenCompare")]
        : focus.bindState === "confirmed"
          ? [t("productsFocus.nextRematch"), t("productsFocus.nextOpenSearch")]
          : [t("productsFocus.nextOpenSearch")],
    suggestedAction:
      focus.bindState === "unbound"
        ? {
            kind: "open_candidate_search",
            productId: focus.productId,
            tab: "shop",
            label: t("productsFocus.nextOpenSearch"),
          }
        : {
            kind: "focus_product",
            productId: focus.productId,
            tab: "shop",
            label: t("productsFocus.focusViewProduct"),
          },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function explainMatchRisk(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>,
  t: TranslateFn
): AgentResponse {
  const explanation =
    focus.riskFlags.length > 0
      ? [...focus.riskFlags]
      : [t("productsFocus.riskEmpty")];

  if (focus.profitPerOrder != null && focus.profitPerOrder < 0) {
    explanation.push(
      t("productsFocus.riskTightMargin", { profit: focus.profitLabel ?? "—" })
    );
  }
  if (ctx.tab === "catalog" && !ctx.pricing.configured) {
    explanation.push(t("productsFocus.riskCatalogTip"));
  }

  return {
    agentId: "sourcing_advisor",
    intent: "explain_match_risk",
    summary: t("productsFocus.riskSummary"),
    explanation,
    nextSteps:
      focus.bindState === "pending"
        ? [t("productsFocus.nextConfirmRejectEach"), t("productsFocus.nextRejectResearch")]
        : [t("productsFocus.nextOpenCompare"), t("productsFocus.nextRematchAgain")],
    suggestedAction:
      focus.bindState === "pending"
        ? {
            kind: "set_shop_filter",
            shopFilter: "pending",
            tab: "shop",
            label: t("productsSourcing.btnViewPending"),
          }
        : {
            kind: "open_candidate_search",
            productId: focus.productId,
            tab: "shop",
            label: t("productsFocus.compareOpenTray"),
          },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function compareCandidate(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>,
  candidates: CandidateSummary[],
  t: TranslateFn
): AgentResponse {
  const lines = buildCandidateCompareLines(
    focus,
    candidates,
    ctx.focusCandidateId
  );

  return {
    agentId: "sourcing_advisor",
    intent: "compare_current_candidate",
    summary: t("productsFocus.compareSummary"),
    explanation: lines,
    nextSteps: [
      candidates.length > 0
        ? t("productsFocus.nextRebindTray")
        : t("productsFocus.nextOpenSearchMulti"),
    ],
    suggestedAction: {
      kind: "open_candidate_search",
      productId: focus.productId,
      tab: "shop",
      label: candidates.length > 0 ? t("productsFocus.compareOpenTray") : t("productsFocus.nextOpenSearch"),
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function proposeProductSearch(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>,
  t: TranslateFn
): AgentResponse {
  return {
    agentId: "sourcing_advisor",
    intent: "propose_candidate_search",
    summary: t("productsFocus.searchSummary"),
    explanation: [
      t("productsFocus.searchExpl", { title: focus.title }),
      t("productsFocus.searchKeepBound"),
    ],
    nextSteps: [
      t("productsFocus.nextOpenSearchTray"),
      t("productsFocus.nextCompareConfirm"),
    ],
    suggestedAction: {
      kind: "open_candidate_search",
      productId: focus.productId,
      tab: "shop",
      label: t("productsFocus.nextOpenSearch"),
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}
