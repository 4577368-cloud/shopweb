import type { AgentResponse } from "@/lib/agents/types";
import type { TranslateFn } from "@/i18n/server";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";

/**
 * Pricing Strategist — rule skeleton for actions + template copy fallback.
 * Live copy may be enriched by LLM via resolveProductsAgentResponse.
 */
export function handlePricingStrategist(
  intent: ProductsIntentId,
  ctx: ProductsPageContext,
  t: TranslateFn
): AgentResponse {
  const { pricing } = ctx;

  if (intent === "configure_pricing") {
    if (pricing.configured) {
      return {
        agentId: "pricing_strategist",
        intent,
        summary: t("productsPricing.configuredSummary"),
        explanation: [pricing.summaryLine, t("productsPricing.configuredExpl")],
        nextSteps: [
          t("productsPricing.stepOpenPricingSidebar"),
          t("productsPricing.stepSaveThenContinue"),
        ],
        suggestedAction: {
          kind: "open_pricing_drawer",
          label: t("productsPricing.btnAdjustPricing"),
        },
        openDrawer: "pricing",
        highlightArea: "pricing_card",
        targetTab: null,
      };
    }
    return {
      agentId: "pricing_strategist",
      intent,
      summary: t("productsPricing.notConfiguredSummary"),
      explanation: [
        t("productsPricing.defaultTemplateExpl1"),
        t("productsPricing.defaultTemplateExpl2"),
      ],
      nextSteps: [
        t("productsPricing.stepOpenRightSidebar"),
        t("productsPricing.stepFillRateSave"),
      ],
      suggestedAction: {
        kind: "open_pricing_drawer",
        label: t("productsPricing.btnConfigureNow"),
      },
      openDrawer: "pricing",
      highlightArea: "pricing_card",
      targetTab: null,
    };
  }

  // explain_pricing (default for this agent)
  if (!ctx.authorized) {
    return {
      agentId: "pricing_strategist",
      intent: "explain_pricing",
      summary: t("productsPricing.unauthorizedSummary"),
      explanation: [
        t("productsPricing.unauthorizedExpl1"),
        t("productsPricing.unauthorizedExpl2"),
      ],
      nextSteps: [t("productsPricing.stepGoAuthorize")],
      suggestedAction: { kind: "none" },
      openDrawer: null,
      highlightArea: null,
      targetTab: null,
    };
  }

  if (pricing.configured) {
    return {
      agentId: "pricing_strategist",
      intent: "explain_pricing",
      summary: t("productsPricing.readySummary"),
      explanation: [
        pricing.summaryLine,
        t("productsPricing.readyExplPath"),
        t("productsPricing.readyExplShared"),
        t("productsPricing.readyExplSidebar"),
      ],
      nextSteps: [
        ctx.pendingCount > 0
          ? t("productsPricing.nextPendingOrFilter")
          : t("productsPricing.nextFilterDiscover"),
      ],
      suggestedAction: {
        kind: "open_pricing_drawer",
        label: t("productsPricing.btnViewPricing"),
      },
      openDrawer: "pricing",
      highlightArea: "pricing_card",
      targetTab: null,
    };
  }

  return {
    agentId: "pricing_strategist",
    intent: "explain_pricing",
    summary: t("productsPricing.whySummary"),
    explanation: [
      t("productsPricing.whyExpl"),
      pricing.summaryLine,
      ctx.purchaseDisplay.summaryLine,
      t("productsPricing.whyExplTemplate"),
    ],
    nextSteps: [
      t("productsPricing.stepClickConfigure"),
      t("productsPricing.stepSaveTemplate"),
    ],
    suggestedAction: {
      kind: "open_pricing_drawer",
      label: t("productsPricing.btnGoConfigure"),
    },
    openDrawer: "pricing",
    highlightArea: "pricing_card",
    targetTab: null,
  };
}
