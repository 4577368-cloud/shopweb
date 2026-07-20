import type { AgentResponse } from "@/lib/agents/types";
import type { ProductsIntentId } from "@/lib/agents/products/intents";
import type { ProductsPageContext } from "@/lib/agents/products/page-context";

/**
 * Pricing Strategist — rule skeleton for actions + template copy fallback.
 * Live copy may be enriched by LLM via resolveProductsAgentResponse.
 */
export function handlePricingStrategist(
  intent: ProductsIntentId,
  ctx: ProductsPageContext
): AgentResponse {
  const { pricing } = ctx;

  if (intent === "configure_pricing") {
    if (pricing.configured) {
      return {
        agentId: "pricing_strategist",
        intent,
        summary: "定价已配置，可按需微调",
        explanation: [
          pricing.summaryLine,
          "建议售价会按当前模板计算；改参数后会即时反映在发现新品与上架预览中。",
        ],
        nextSteps: ["打开定价侧栏调整汇率、倍率或加价", "保存后继续选品或上架"],
        suggestedAction: {
          kind: "open_pricing_drawer",
          label: "调整定价",
        },
        openDrawer: "pricing",
        highlightArea: "pricing_card",
        targetTab: null,
      };
    }
    return {
      agentId: "pricing_strategist",
      intent,
      summary: "建议先配置定价策略",
      explanation: [
        "当前仍是系统默认模板，建议售价可能不符合你的利润预期。",
        "配置目标币种、汇率与倍率后，发现新品与上架预览才会按你的规则出价。",
      ],
      nextSteps: ["打开右侧定价侧栏", "填写汇率与倍率后保存"],
      suggestedAction: {
        kind: "open_pricing_drawer",
        label: "立即配置",
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
      summary: "授权后再配置店铺定价",
      explanation: [
        "定价模板按店铺生效：目标币种、汇率、倍率决定建议售价。",
        "请先完成店铺授权，再回到本页配置。",
      ],
      nextSteps: ["前往授权店铺"],
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
      summary: "定价已就绪",
      explanation: [
        pricing.summaryLine,
        "建议售价路径：采购价（RMB）→ 乘汇率换成目标币 → 乘倍率 → 加固定加价 → 按取整规则。",
        "右侧策略卡可随时调整；主区继续负责选品与上架执行。",
      ],
      nextSteps: [
        ctx.pendingCount > 0
          ? "优先处理待确认关联"
          : "可在「发现新品」按建议售价筛选上架",
      ],
      suggestedAction: {
        kind: "open_pricing_drawer",
        label: "查看/调整定价",
      },
      openDrawer: "pricing",
      highlightArea: "pricing_card",
      targetTab: null,
    };
  }

  return {
    agentId: "pricing_strategist",
    intent: "explain_pricing",
    summary: "为什么要先配定价",
    explanation: [
      "未配置有效定价时，系统只能用默认汇率与倍率估算售价，容易偏离你的目标毛利。",
      pricing.summaryLine,
      "先配好模板，再去做待确认、未匹配或发现新品，建议售价才会可信。",
    ],
    nextSteps: ["点击下方「去配置定价」或策略卡「立即配置」", "保存模板后再继续选品"],
    suggestedAction: {
      kind: "open_pricing_drawer",
      label: "去配置定价",
    },
    openDrawer: "pricing",
    highlightArea: "pricing_card",
    targetTab: null,
  };
}
