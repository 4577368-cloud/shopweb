import type { AgentId } from "@/lib/agents/types";
import type { PageIntentDef } from "@/lib/agents/runtime";

/**
 * Fixed intents for 智能选品 — no open-domain NLU.
 */
export type ProductsIntentId =
  | "summarize_shop_status"
  | "explain_pricing"
  | "configure_pricing"
  | "suggest_filters"
  | "go_pending"
  | "go_unbound"
  | "go_discover"
  | "propose_candidate_search";

export interface ProductsIntentDef extends PageIntentDef<ProductsIntentId> {
  agent: AgentId;
  when?: "always" | "pricing_unset" | "has_pending" | "has_unbound" | "authorized";
}

export const PRODUCTS_INTENTS: ProductsIntentDef[] = [
  {
    id: "summarize_shop_status",
    label: "状态",
    description: "汇总已分析 / 匹配 / 待确认 / 未匹配与下一步",
    agent: "sourcing_advisor",
    when: "authorized",
  },
  {
    id: "explain_pricing",
    label: "定价策略",
    description: "查看或调整定价模板",
    agent: "pricing_strategist",
    when: "always",
  },
  {
    id: "configure_pricing",
    label: "定价策略",
    description: "打开定价模板侧栏",
    agent: "pricing_strategist",
    when: "pricing_unset",
  },
  {
    id: "suggest_filters",
    label: "筛选",
    description: "基于推荐类目与状态给出发现新品筛选建议",
    agent: "sourcing_advisor",
    when: "authorized",
  },
  {
    id: "go_pending",
    label: "待确认",
    description: "引导处理 AI 待确认关联",
    agent: "sourcing_advisor",
    when: "has_pending",
  },
  {
    id: "go_unbound",
    label: "未匹配",
    description: "引导为未关联商品找货源",
    agent: "sourcing_advisor",
    when: "has_unbound",
  },
  {
    id: "go_discover",
    label: "发现新品",
    description: "引导进入 Tangbuy 商城选品上架",
    agent: "sourcing_advisor",
    when: "authorized",
  },
  {
    id: "propose_candidate_search",
    label: "重搜候选",
    description: "为全部未关联商品重新图搜，不自动改绑已确认货源",
    agent: "sourcing_advisor",
    when: "authorized",
  },
];

export function intentDef(id: ProductsIntentId): ProductsIntentDef {
  const found = PRODUCTS_INTENTS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown products intent: ${id}`);
  return found;
}
