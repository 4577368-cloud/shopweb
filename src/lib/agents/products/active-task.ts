import type { TranslateFn } from "@/i18n/server";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import type { AgentSuggestedAction } from "@/lib/agents/types";

export interface ActiveTask {
  title: string;
  reason: string;
  intent: ProductsIntentId;
  action: AgentSuggestedAction;
}

function isPricingIntent(id: ProductsIntentId): boolean {
  return id === "explain_pricing" || id === "configure_pricing";
}

export const PRODUCT_FOCUS_INTENTS: ProductsIntentId[] = [
  "explain_match_reason",
  "explain_match_risk",
  "compare_current_candidate",
];

/** Per-product actions live on the product card — not duplicated in the rail. */
export function productFocusChips(_ctx: ProductsPageContext): ProductsIntentId[] {
  return [];
}

/**
 * Single top-priority task for the rail — short, one CTA.
 */
export function computeActiveTask(
  ctx: ProductsPageContext,
  t: TranslateFn
): ActiveTask {
  if (!ctx.authorized) {
    return {
      title: t("productsActiveTask.connectShopTitle"),
      reason: t("productsActiveTask.connectShopReason"),
      intent: "explain_pricing",
      action: { kind: "none", label: t("productsActiveTask.connectShopAction") },
    };
  }

  if (!ctx.pricing.configured) {
    return {
      title: t("productsActiveTask.configurePricingTitle"),
      reason: t("productsActiveTask.configurePricingReason"),
      intent: "configure_pricing",
      action: {
        kind: "open_pricing_drawer",
        label: t("productsActiveTask.configurePricingAction"),
      },
    };
  }

  if (ctx.pendingCount > 0) {
    return {
      title: t("productsActiveTask.confirmPendingTitle", { count: ctx.pendingCount }),
      reason: t("productsActiveTask.confirmPendingReason"),
      intent: "go_pending",
      action: {
        kind: "set_shop_filter",
        tab: "shop",
        shopFilter: "pending",
        label: t("productsActiveTask.confirmPendingAction"),
      },
    };
  }

  if (ctx.unboundCount > 0) {
    return {
      title: t("productsActiveTask.unboundTitle", { count: ctx.unboundCount }),
      reason: t("productsActiveTask.unboundReason"),
      intent: "go_unbound",
      action: {
        kind: "rematch_unbound",
        label: t("productsActiveTask.unboundAction"),
      },
    };
  }

  if (ctx.tab !== "catalog") {
    return {
      title: t("productsActiveTask.discoverTitle"),
      reason: t("productsActiveTask.discoverReason"),
      intent: "go_discover",
      action: {
        kind: "set_tab",
        tab: "catalog",
        label: t("productsActiveTask.discoverAction"),
      },
    };
  }

  return {
    title: t("productsActiveTask.optimizeFiltersTitle"),
    reason:
      ctx.recommendedCategoryNames[0] != null
        ? t("productsActiveTask.optimizeFiltersReasonCategory", {
            category: ctx.recommendedCategoryNames[0],
          })
        : t("productsActiveTask.optimizeFiltersReasonDefault"),
    intent: "suggest_filters",
    action: {
      kind: "apply_filter_preset",
      tab: "catalog",
      filterPreset: ctx.recommendedCategoryNames[0]
        ? {
            categoryName: ctx.recommendedCategoryNames[0],
            label: ctx.recommendedCategoryNames[0],
          }
        : undefined,
      label: t("productsActiveTask.optimizeFiltersAction"),
    },
  };
}

/**
 * Compact task chips. Always includes one pricing chip (unless it is the active task).
 */
export function railTaskChips(
  ctx: ProductsPageContext,
  excludeIntent: ProductsIntentId
): ProductsIntentId[] {
  const ordered: ProductsIntentId[] = [];
  const push = (id: ProductsIntentId) => {
    if (id === excludeIntent) return;
    if (!ordered.includes(id)) ordered.push(id);
  };

  if (!ctx.authorized) {
    push("explain_pricing");
    return ordered;
  }

  push("summarize_shop_status");
  if (ctx.pendingCount > 0) push("go_pending");
  if (ctx.unboundCount > 0) push("go_unbound");
  if (ctx.tab === "catalog" || (ctx.pendingCount === 0 && ctx.unboundCount === 0)) {
    push("suggest_filters");
    push("go_discover");
  }

  if (!ctx.pricing.configured) {
    push("configure_pricing");
  }

  return ordered.filter(
    (id) =>
      (id !== excludeIntent || isPricingIntent(id)) &&
      !PRODUCT_FOCUS_INTENTS.includes(id)
  );
}

/**
 * Primary chips with pricing pinned. If total ≤ maxPrimary, show all (no「更多」).
 * Overflow only when there are more than maxPrimary chips.
 */
export function splitProductChips(
  ordered: ProductsIntentId[],
  maxPrimary = 3
): { primary: ProductsIntentId[]; more: ProductsIntentId[] } {
  if (ordered.length <= maxPrimary) {
    const pricing = ordered.find(isPricingIntent);
    const rest = ordered.filter((id) => !isPricingIntent(id));
    return {
      primary: pricing ? [...rest, pricing] : ordered.slice(),
      more: [],
    };
  }
  const pricing = ordered.find(isPricingIntent);
  const rest = ordered.filter((id) => !isPricingIntent(id));
  const restSlots = Math.max(0, maxPrimary - (pricing ? 1 : 0));
  const primaryRest = rest.slice(0, restSlots);
  const more = rest.slice(restSlots);
  const primary = pricing ? [...primaryRest, pricing] : primaryRest;
  return { primary, more };
}

/** Whether an intent result should hide a strong CTA already owned by the active task. */
export function shouldSuppressResultPrimaryCta(
  activeIntent: ProductsIntentId,
  resultIntent: ProductsIntentId
): boolean {
  if (activeIntent === resultIntent) return true;
  if (resultIntent === "summarize_shop_status") return true;
  if (resultIntent === "go_discover" && activeIntent === "go_discover") return true;
  return false;
}
