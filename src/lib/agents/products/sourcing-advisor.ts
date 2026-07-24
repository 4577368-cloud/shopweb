import type { AgentResponse } from "@/lib/agents/types";
import type { TranslateFn } from "@/i18n/server";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import { purchaseDisplayAlignedWithPricing } from "@/lib/agents/products/page-context";
import { handleProductFocusIntent } from "@/lib/agents/products/product-focus-handlers";

/**
 * Sourcing Advisor — rule skeleton for actions + template copy fallback.
 * Live copy may be enriched by LLM via resolveProductsAgentResponse.
 * Uses only real counts / categories / filter summary from PageContext.
 */
export function handleSourcingAdvisor(
  intent: ProductsIntentId,
  ctx: ProductsPageContext,
  t: TranslateFn
): AgentResponse {
  if (!ctx.authorized) {
    return {
      agentId: "sourcing_advisor",
      intent,
      summary: t("productsSourcing.unauthorizedSummary"),
      explanation: [t("productsSourcing.unauthorizedExpl")],
      nextSteps: [t("productsSourcing.unauthorizedNext")],
      suggestedAction: { kind: "none" },
      targetTab: null,
      highlightArea: null,
      openDrawer: null,
    };
  }

  const focused = handleProductFocusIntent(intent, ctx, ctx.focusCandidates, t);
  if (focused) return focused;

  switch (intent) {
    case "summarize_shop_status":
      return summarizeStatus(ctx, t);
    case "suggest_filters":
      return suggestFilters(ctx, t);
    case "go_pending":
      return goPending(ctx, t);
    case "go_unbound":
      return goUnbound(ctx, t);
    case "go_discover":
      return goDiscover(ctx, t);
    case "propose_candidate_search":
      return proposeCandidateSearch(ctx, t);
    default:
      return summarizeStatus(ctx, t);
  }
}

function summarizeStatus(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  const explanation: string[] = [];
  if (ctx.scanHandoff) {
    const h = ctx.scanHandoff;
    explanation.push(
      t("productsSourcing.scanDone", {
        productCount: h.productCount,
        matchedCount: h.matchedCount,
      }) +
        (h.pendingCount > 0
          ? t("productsSourcing.scanDonePending", { pendingCount: h.pendingCount })
          : "")
    );
  }
  explanation.push(
    t("productsSourcing.analyzedSellable", { count: ctx.analyzedCount }),
    t("productsSourcing.matchBreakdown", {
      matched: ctx.matchedCount,
      pending: ctx.pendingCount,
      unbound: ctx.unboundCount,
    })
  );
  const purchaseAligned = purchaseDisplayAlignedWithPricing(
    ctx.pricing,
    ctx.purchaseDisplay
  );
  if (ctx.pricing.configured) {
    explanation.push(
      purchaseAligned
        ? t("productsSourcing.rateShared", {
            rate: ctx.pricing.exchangeRate ?? "—",
            currency: ctx.pricing.targetCurrency ?? "—",
          })
        : ctx.purchaseDisplay.summaryLine
    );
    explanation.push(t("productsSourcing.listingPricingPrefix") + ctx.pricing.summaryLine);
  } else {
    explanation.push(ctx.purchaseDisplay.summaryLine);
    explanation.push(t("productsSourcing.listingNotConfigured"));
  }
  if (ctx.recommendedCategoryNames.length > 0) {
    explanation.push(
      t("productsSourcing.recCats", {
        cats: ctx.recommendedCategoryNames.join(", "),
      })
    );
  }
  if (ctx.filterSummary.length > 0) {
    explanation.push(
      t("productsSourcing.currentFilters", { filters: ctx.filterSummary.join(" · ") })
    );
  }

  const nextSteps: string[] = [];
  let suggestedAction: AgentResponse["suggestedAction"] = { kind: "none" };
  let targetTab: "shop" | "catalog" | null = null;

  if (!ctx.pricing.configured) {
    nextSteps.push(t("productsSourcing.nextConfigurePricing"));
  } else if (ctx.pendingCount > 0) {
    nextSteps.push(t("productsSourcing.nextPending", { count: ctx.pendingCount }));
    suggestedAction = {
      kind: "set_shop_filter",
      shopFilter: "pending",
      tab: "shop",
      label: t("productsSourcing.btnViewPending"),
    };
    targetTab = "shop";
  } else if (ctx.unboundCount > 0) {
    nextSteps.push(t("productsSourcing.nextUnbound", { count: ctx.unboundCount }));
    suggestedAction = {
      kind: "set_shop_filter",
      shopFilter: "unbound",
      tab: "shop",
      label: t("productsSourcing.btnViewUnbound"),
    };
    targetTab = "shop";
  } else {
    nextSteps.push(t("productsSourcing.nextDiscover"));
    suggestedAction = {
      kind: "set_tab",
      tab: "catalog",
      label: t("productsSourcing.discoverAction"),
    };
    targetTab = "catalog";
  }

  return {
    agentId: "sourcing_advisor",
    intent: "summarize_shop_status",
    summary: ctx.analysisReady
      ? t("productsSourcing.summaryReady")
      : t("productsSourcing.summaryNotReady"),
    explanation,
    nextSteps,
    suggestedAction,
    targetTab,
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function suggestFilters(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  const explanation: string[] = [];
  if (ctx.recommendedCategoryNames.length > 0) {
    explanation.push(
      t("productsSourcing.filterRecCat", {
        cats: ctx.recommendedCategoryNames.join(", "),
      })
    );
  } else {
    explanation.push(t("productsSourcing.filterNoCat"));
  }
  if (ctx.filterSummary.length > 0) {
    explanation.push(
      t("productsSourcing.filterChosen", { filters: ctx.filterSummary.join(" · ") })
    );
  } else {
    explanation.push(t("productsSourcing.filterNone"));
  }
  if (!ctx.pricing.configured) {
    explanation.push(t("productsSourcing.filterPricingTip"));
  } else {
    explanation.push(
      t("productsSourcing.filterCurrencyTip", {
        currency: ctx.pricing.targetCurrency ?? "—",
      })
    );
  }

  return {
    agentId: "sourcing_advisor",
    intent: "suggest_filters",
    summary: t("productsSourcing.suggestFiltersSummary"),
    explanation,
    nextSteps: [
      t("productsSourcing.stepOpenDiscover"),
      ctx.recommendedCategoryNames[0]
        ? t("productsSourcing.stepTryCat", { cat: ctx.recommendedCategoryNames[0] })
        : t("productsSourcing.stepKeyword"),
    ],
    suggestedAction:
      ctx.recommendedCategoryNames[0] != null
        ? {
            kind: "apply_filter_preset",
            tab: "catalog",
            filterPreset: {
              categoryName: ctx.recommendedCategoryNames[0],
              label: t("productsSourcing.stepTryCat", {
                cat: ctx.recommendedCategoryNames[0],
              }),
            },
            label: t("productsSourcing.stepTryCat", {
              cat: ctx.recommendedCategoryNames[0],
            }),
          }
        : {
            kind: "set_tab",
            tab: "catalog",
            label: t("productsSourcing.discoverAction"),
          },
    targetTab: "catalog",
    highlightArea: "filters",
    openDrawer: null,
  };
}

function goPending(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  if (ctx.pendingCount <= 0) {
    return {
      agentId: "sourcing_advisor",
      intent: "go_pending",
      summary: t("productsSourcing.pendingEmptySummary"),
      explanation: [t("productsSourcing.pendingEmptyExpl")],
      nextSteps:
        ctx.unboundCount > 0
          ? [t("productsSourcing.viewUnbound", { count: ctx.unboundCount })]
          : [t("productsSourcing.discoverSummary")],
      suggestedAction:
        ctx.unboundCount > 0
          ? {
              kind: "set_shop_filter",
              shopFilter: "unbound",
              tab: "shop",
              label: t("productsSourcing.btnViewUnbound"),
            }
          : {
              kind: "set_tab",
              tab: "catalog",
              label: t("productsSourcing.discoverAction"),
            },
      targetTab: ctx.unboundCount > 0 ? "shop" : "catalog",
      highlightArea: "shop_list",
      openDrawer: null,
    };
  }
  return {
    agentId: "sourcing_advisor",
    intent: "go_pending",
    summary: t("productsSourcing.pendingSummary", { count: ctx.pendingCount }),
    explanation: [t("productsSourcing.pendingExpl1"), t("productsSourcing.pendingExpl2")],
    nextSteps: [
      t("productsSourcing.stepSwitchPending"),
      t("productsSourcing.stepConfirmEach"),
    ],
    suggestedAction: {
      kind: "set_shop_filter",
      shopFilter: "pending",
      tab: "shop",
      label: t("productsSourcing.btnViewPending"),
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function goUnbound(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  if (ctx.unboundCount <= 0) {
    return {
      agentId: "sourcing_advisor",
      intent: "go_unbound",
      summary: t("productsSourcing.unboundEmptySummary"),
      explanation: [t("productsSourcing.unboundEmptyExpl")],
      nextSteps: [t("productsSourcing.discoverSummary")],
      suggestedAction: {
        kind: "set_tab",
        tab: "catalog",
        label: t("productsSourcing.discoverAction"),
      },
      targetTab: "catalog",
      highlightArea: "catalog_grid",
      openDrawer: null,
    };
  }
  return {
    agentId: "sourcing_advisor",
    intent: "go_unbound",
    summary: t("productsSourcing.unboundSummary", { count: ctx.unboundCount }),
    explanation: [
      t("productsSourcing.unboundExpl1"),
      ctx.pendingCount > 0
        ? t("productsSourcing.unboundExplPending", { pending: ctx.pendingCount })
        : t("productsSourcing.unboundExplAfter"),
    ],
    nextSteps: [
      t("productsSourcing.stepSwitchUnbound"),
      t("productsSourcing.stepLinkSource"),
    ],
    suggestedAction: {
      kind: "set_shop_filter",
      shopFilter: "unbound",
      tab: "shop",
      label: t("productsSourcing.btnViewUnbound"),
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function goDiscover(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  const explanation = [t("productsSourcing.discoverExplainMain")];
  if (!ctx.pricing.configured) {
    explanation.push(t("productsSourcing.discoverExplainPricing"));
  }
  if (ctx.recommendedCategoryNames.length > 0) {
    explanation.push(
      t("productsSourcing.discoverExplainCategories", {
        categories: ctx.recommendedCategoryNames.join(", "),
      })
    );
  }
  return {
    agentId: "sourcing_advisor",
    intent: "go_discover",
    summary: t("productsSourcing.discoverSummary"),
    explanation,
    nextSteps: [
      t("productsSourcing.discoverNextOpenTab"),
      t("productsSourcing.discoverNextFilter"),
    ],
    suggestedAction: {
      kind: "set_tab",
      tab: "catalog",
      label: t("productsSourcing.discoverAction"),
    },
    targetTab: "catalog",
    highlightArea: "catalog_grid",
    openDrawer: null,
  };
}

/** Rematch all unbound products — per-product search uses focus handlers. */
function proposeCandidateSearch(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  if (ctx.focusProductId && ctx.focusProduct) {
    return handleProductFocusIntent(
      "propose_candidate_search",
      ctx,
      ctx.focusCandidates,
      t
    )!;
  }
  if (ctx.unboundCount > 0) {
    return {
      agentId: "sourcing_advisor",
      intent: "propose_candidate_search",
      summary: t("productsSourcing.rematchSummary"),
      explanation: [
        t("productsSourcing.rematchExpl", { count: ctx.unboundCount }),
        t("productsSourcing.rematchKeepBound"),
      ],
      nextSteps: [
        t("productsSourcing.stepStartRematch"),
        t("productsSourcing.stepConfirmInResult"),
      ],
      suggestedAction: {
        kind: "rematch_unbound",
        tab: "shop",
        label: t("productsSourcing.rematchBtnAll"),
      },
      targetTab: "shop",
      highlightArea: "shop_list",
      openDrawer: null,
    };
  }
  return {
    agentId: "sourcing_advisor",
    intent: "propose_candidate_search",
    summary: t("productsSourcing.unboundEmptySummary"),
    explanation: [t("productsSourcing.rematchEmptyExpl")],
    nextSteps: [
      t("productsSourcing.stepViewPendingList"),
      t("productsSourcing.stepOrDiscover"),
    ],
    suggestedAction:
      ctx.pendingCount > 0
        ? {
            kind: "set_shop_filter",
            shopFilter: "pending",
            tab: "shop",
            label: t("productsSourcing.btnViewPending"),
          }
        : { kind: "set_tab", tab: "catalog", label: t("productsSourcing.btnDiscover") },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}
