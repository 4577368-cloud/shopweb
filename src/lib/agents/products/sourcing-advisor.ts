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
      summary: "请先授权店铺",
      explanation: ["选品状态与货源建议都依赖已连接的店铺。"],
      nextSteps: ["完成 Shopify 授权后回到智能选品"],
      suggestedAction: { kind: "none" },
      targetTab: null,
      highlightArea: null,
      openDrawer: null,
    };
  }

  const focused = handleProductFocusIntent(intent, ctx, ctx.focusCandidates);
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
      return proposeCandidateSearch(ctx);
    default:
      return summarizeStatus(ctx, t);
  }
}

function summarizeStatus(ctx: ProductsPageContext, t: TranslateFn): AgentResponse {
  const explanation: string[] = [];
  if (ctx.scanHandoff) {
    const h = ctx.scanHandoff;
    explanation.push(
      `首轮 AI 分析已完成：已分析 ${h.productCount} 个商品，找到 ${h.matchedCount} 个推荐匹配${
        h.pendingCount > 0 ? `，其中 ${h.pendingCount} 个待你确认` : ""
      }。`
    );
  }
  explanation.push(
    `已分析在售商品 ${ctx.analyzedCount} 个`,
    `已匹配（含待确认） ${ctx.matchedCount} 个 · 待确认 ${ctx.pendingCount} · 未匹配 ${ctx.unboundCount}`
  );
  const purchaseAligned = purchaseDisplayAlignedWithPricing(
    ctx.pricing,
    ctx.purchaseDisplay
  );
  if (ctx.pricing.configured) {
    explanation.push(
      purchaseAligned
        ? `汇率 ${ctx.pricing.exchangeRate}（${ctx.pricing.targetCurrency}）：采购成本与上架定价共用；采购展示不含倍率加价`
        : ctx.purchaseDisplay.summaryLine
    );
    explanation.push(`上架定价：${ctx.pricing.summaryLine}`);
  } else {
    explanation.push(ctx.purchaseDisplay.summaryLine);
    explanation.push("上架定价尚未完成有效配置（发现新品建议售价需先配定价）");
  }
  if (ctx.recommendedCategoryNames.length > 0) {
    explanation.push(`推荐类目：${ctx.recommendedCategoryNames.join("、")}`);
  }
  if (ctx.filterSummary.length > 0) {
    explanation.push(`当前发现新品筛选：${ctx.filterSummary.join(" · ")}`);
  }

  const nextSteps: string[] = [];
  let suggestedAction: AgentResponse["suggestedAction"] = { kind: "none" };
  let targetTab: "shop" | "catalog" | null = null;

  if (!ctx.pricing.configured) {
    nextSteps.push("先配置定价策略，再推进选品");
  } else if (ctx.pendingCount > 0) {
    nextSteps.push(`优先处理 ${ctx.pendingCount} 个待确认关联`);
    suggestedAction = {
      kind: "set_shop_filter",
      shopFilter: "pending",
      tab: "shop",
      label: "看待确认",
    };
    targetTab = "shop";
  } else if (ctx.unboundCount > 0) {
    nextSteps.push(`为 ${ctx.unboundCount} 个未匹配商品找货源`);
    suggestedAction = {
      kind: "set_shop_filter",
      shopFilter: "unbound",
      tab: "shop",
      label: "看未匹配",
    };
    targetTab = "shop";
  } else {
    nextSteps.push("可去「发现新品」补充货源并上架");
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
    summary: ctx.analysisReady ? "当前选品状态" : "分析尚未就绪",
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
      `可按店铺在售推断，优先试试类目：${ctx.recommendedCategoryNames.join("、")}`
    );
  } else {
    explanation.push("暂无推荐类目数据；可先用关键词或价格带缩小范围。");
  }
  if (ctx.filterSummary.length > 0) {
    explanation.push(`你当前已选：${ctx.filterSummary.join(" · ")}`);
  } else {
    explanation.push("发现新品 Tab 下尚未应用额外筛选。");
  }
  if (!ctx.pricing.configured) {
    explanation.push("定价未配置时，建议售价区间筛选参考价值有限，建议先配定价。");
  } else {
    explanation.push(
      `目标币种 ${ctx.pricing.targetCurrency ?? "—"}：可用价格带按建议售价筛一版，再按利润手感微调。`
    );
  }

  return {
    agentId: "sourcing_advisor",
    intent: "suggest_filters",
    summary: "筛选建议",
    explanation,
    nextSteps: [
      "打开「发现新品」",
      ctx.recommendedCategoryNames[0]
        ? `点选推荐类目「${ctx.recommendedCategoryNames[0]}」试一轮`
        : "用关键词或 USD 价格带缩小结果",
    ],
    suggestedAction:
      ctx.recommendedCategoryNames[0] != null
        ? {
            kind: "apply_filter_preset",
            tab: "catalog",
            filterPreset: {
              categoryName: ctx.recommendedCategoryNames[0],
              label: `应用「${ctx.recommendedCategoryNames[0]}」`,
            },
            label: `应用「${ctx.recommendedCategoryNames[0]}」`,
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
      summary: "暂无待确认商品",
      explanation: ["当前没有待确认的 AI 关联，可去未匹配或发现新品。"],
      nextSteps:
        ctx.unboundCount > 0
          ? [`查看 ${ctx.unboundCount} 个未匹配商品`]
          : [t("productsSourcing.discoverSummary")],
      suggestedAction:
        ctx.unboundCount > 0
          ? {
              kind: "set_shop_filter",
              shopFilter: "unbound",
              tab: "shop",
              label: "看未匹配",
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
    summary: `有 ${ctx.pendingCount} 个待确认`,
    explanation: [
      "待确认表示 AI 已找到候选货源，需要你确认或改绑。",
      "建议先清待确认，再处理未匹配，避免重复劳动。",
    ],
    nextSteps: ["切换到「店铺商品」并筛选待确认", "逐条确认或更换货源"],
    suggestedAction: {
      kind: "set_shop_filter",
      shopFilter: "pending",
      tab: "shop",
      label: "看待确认",
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
      summary: "暂无未匹配商品",
      explanation: ["在售商品均已有关联或待确认；可去发现新品扩品。"],
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
    summary: `有 ${ctx.unboundCount} 个未匹配`,
    explanation: [
      "未匹配商品还没有绑定 Tangbuy 货源，图搜或手动找同款后才能推进物流与同步。",
      ctx.pendingCount > 0
        ? `另有 ${ctx.pendingCount} 个待确认，也可一并处理。`
        : "清完未匹配后，可到发现新品继续扩品。",
    ],
    nextSteps: ["切换到「店铺商品」并筛选未匹配", "为商品关联货源"],
    suggestedAction: {
      kind: "set_shop_filter",
      shopFilter: "unbound",
      tab: "shop",
      label: "看未匹配",
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
function proposeCandidateSearch(ctx: ProductsPageContext): AgentResponse {
  if (ctx.focusProductId && ctx.focusProduct) {
    return handleProductFocusIntent(
      "propose_candidate_search",
      ctx,
      ctx.focusCandidates
    )!;
  }
  if (ctx.unboundCount > 0) {
    return {
      agentId: "sourcing_advisor",
      intent: "propose_candidate_search",
      summary: "重搜未匹配货源",
      explanation: [
        `将对 ${ctx.unboundCount} 个未关联商品重新图搜。`,
        "已关联商品不会改绑。",
      ],
      nextSteps: ["开始重搜", "在结果中确认或改绑"],
      suggestedAction: {
        kind: "rematch_unbound",
        tab: "shop",
        label: "重搜全部未匹配",
      },
      targetTab: "shop",
      highlightArea: "shop_list",
      openDrawer: null,
    };
  }
  return {
    agentId: "sourcing_advisor",
    intent: "propose_candidate_search",
    summary: "暂无未匹配商品",
    explanation: ["当前没有未关联商品，无需重搜。"],
    nextSteps: ["看待确认列表", "或去发现新品"],
    suggestedAction:
      ctx.pendingCount > 0
        ? {
            kind: "set_shop_filter",
            shopFilter: "pending",
            tab: "shop",
            label: "看待确认",
          }
        : { kind: "set_tab", tab: "catalog", label: "发现新品" },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}
