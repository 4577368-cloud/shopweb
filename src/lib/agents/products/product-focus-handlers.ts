import type { AgentResponse } from "@/lib/agents/types";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";
import {
  buildCandidateCompareLines,
  type CandidateSummary,
} from "@/lib/agents/products/product-focus-snapshot";

function noFocusResponse(intent: ProductsIntentId): AgentResponse {
  return {
    agentId: "sourcing_advisor",
    intent,
    summary: "请先选择商品",
    explanation: [
      "在「我的 Shopify」中点击一个商品卡片，再问我为什么推荐、哪里不确定，或要找更多候选。",
    ],
    nextSteps: ["在商品列表中选中要解释的商品"],
    suggestedAction: { kind: "none" },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

export function handleProductFocusIntent(
  intent: ProductsIntentId,
  ctx: ProductsPageContext,
  candidates: CandidateSummary[] = []
): AgentResponse | null {
  const focus = ctx.focusProduct;
  const needsFocus =
    intent === "explain_match_reason" ||
    intent === "explain_match_risk" ||
    intent === "compare_current_candidate";

  if (needsFocus && !focus) {
    return noFocusResponse(intent);
  }

  if (intent === "propose_candidate_search" && ctx.focusProductId && focus) {
    return proposeProductSearch(ctx, focus);
  }

  if (!focus) return null;

  switch (intent) {
    case "explain_match_reason":
      return explainMatchReason(ctx, focus);
    case "explain_match_risk":
      return explainMatchRisk(ctx, focus);
    case "compare_current_candidate":
      return compareCandidate(ctx, focus, candidates);
    default:
      return null;
  }
}

function explainMatchReason(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>
): AgentResponse {
  const explanation = [
    `商品：${focus.title}`,
    ...focus.rankingReasons,
    ctx.pricing.configured
      ? `定价策略（${ctx.pricing.targetCurrency} · 汇率 ${ctx.pricing.exchangeRate}）与采购成本展示共用汇率；倍率加价仅用于发现新品建议售价。`
      : "尚未配置定价策略：采购成本按店铺币种默认汇率展示；发现新品建议售价需先配定价。",
  ];
  if (focus.bindState === "unbound") {
    explanation.push("当前未绑定货源，可先图搜查找候选。");
  }

  return {
    agentId: "sourcing_advisor",
    intent: "explain_match_reason",
    summary: "为什么推荐这个货源",
    explanation,
    nextSteps:
      focus.bindState === "pending"
        ? ["确认关联", "或打开候选对比后改绑"]
        : focus.bindState === "confirmed"
          ? ["如需更换货源可重新匹配"]
          : ["打开图搜查找候选"],
    suggestedAction:
      focus.bindState === "unbound"
        ? {
            kind: "open_candidate_search",
            productId: focus.productId,
            tab: "shop",
            label: "查找候选",
          }
        : {
            kind: "focus_product",
            productId: focus.productId,
            tab: "shop",
            label: "查看商品",
          },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function explainMatchRisk(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>
): AgentResponse {
  const explanation =
    focus.riskFlags.length > 0
      ? [...focus.riskFlags]
      : ["暂无明显风险标记；若仍有疑虑可打开候选托盘对比或驳回重搜。"];

  if (focus.profitPerOrder != null && focus.profitPerOrder < 0) {
    explanation.push(
      `按 Shopify 售价与采购成本估算每单约 ${focus.profitLabel}，利润空间偏紧`
    );
  }
  if (ctx.tab === "catalog" && !ctx.pricing.configured) {
    explanation.push("你在发现新品 Tab：上架建议售价需先配置定价策略再判断。");
  }

  return {
    agentId: "sourcing_advisor",
    intent: "explain_match_risk",
    summary: "匹配不确定点",
    explanation,
    nextSteps:
      focus.bindState === "pending"
        ? ["逐条确认或驳回", "驳回后将重新图搜匹配"]
        : ["打开候选对比", "或重新匹配"],
    suggestedAction:
      focus.bindState === "pending"
        ? {
            kind: "set_shop_filter",
            shopFilter: "pending",
            tab: "shop",
            label: "看待确认",
          }
        : {
            kind: "open_candidate_search",
            productId: focus.productId,
            tab: "shop",
            label: "查看候选",
          },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function compareCandidate(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>,
  candidates: CandidateSummary[]
): AgentResponse {
  const lines = buildCandidateCompareLines(
    focus,
    candidates,
    ctx.focusCandidateId
  );

  return {
    agentId: "sourcing_advisor",
    intent: "compare_current_candidate",
    summary: "候选对比",
    explanation: lines,
    nextSteps: [
      candidates.length > 0
        ? "在候选托盘中改绑更合适的货源"
        : "先打开图搜查看多个候选",
    ],
    suggestedAction: {
      kind: "open_candidate_search",
      productId: focus.productId,
      tab: "shop",
      label: candidates.length > 0 ? "打开候选托盘" : "查找候选",
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}

function proposeProductSearch(
  ctx: ProductsPageContext,
  focus: NonNullable<ProductsPageContext["focusProduct"]>
): AgentResponse {
  return {
    agentId: "sourcing_advisor",
    intent: "propose_candidate_search",
    summary: "为这个商品找更多候选",
    explanation: [
      `将对「${focus.title}」重新图搜 Tangbuy 货源（最多展示 5 个候选）。`,
      "不会自动改绑已确认的关联；待确认项可先驳回再重搜。",
    ],
    nextSteps: ["打开图搜托盘", "对比后确认或改绑"],
    suggestedAction: {
      kind: "open_candidate_search",
      productId: focus.productId,
      tab: "shop",
      label: "查找候选",
    },
    targetTab: "shop",
    highlightArea: "shop_list",
    openDrawer: null,
  };
}
