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
export function computeActiveTask(ctx: ProductsPageContext): ActiveTask {
  if (!ctx.authorized) {
    return {
      title: "先连接店铺",
      reason: "授权后才能分析商品与配置定价。",
      intent: "explain_pricing",
      action: { kind: "none", label: "去授权" },
    };
  }

  if (!ctx.pricing.configured) {
    return {
      title: "先配置定价",
      reason: "未配置时建议售价不准。",
      intent: "configure_pricing",
      action: { kind: "open_pricing_drawer", label: "立即配置" },
    };
  }

  if (ctx.pendingCount > 0) {
    return {
      title: `确认 ${ctx.pendingCount} 个待关联`,
      reason: "确认或改绑后即可继续。",
      intent: "go_pending",
      action: {
        kind: "set_shop_filter",
        tab: "shop",
        shopFilter: "pending",
        label: "看待确认",
      },
    };
  }

  if (ctx.unboundCount > 0) {
    return {
      title: `${ctx.unboundCount} 个未匹配`,
      reason: "可批量启动图搜，为未关联商品自动匹配货源。",
      intent: "go_unbound",
      action: {
        kind: "rematch_unbound",
        label: "批量关联",
      },
    };
  }

  if (ctx.tab !== "catalog") {
    return {
      title: "去发现新品",
      reason: "在售关联已就绪，可补充货源。",
      intent: "go_discover",
      action: { kind: "set_tab", tab: "catalog", label: "打开发现新品" },
    };
  }

  return {
    title: "优化筛选",
    reason:
      ctx.recommendedCategoryNames[0] != null
        ? `可按「${ctx.recommendedCategoryNames[0]}」缩小范围。`
        : "用类目或价格带缩小后再上架。",
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
      label: "筛选建议",
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
    // Keep pricing last for stable right-side placement when few chips.
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
