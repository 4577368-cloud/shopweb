import {
  PRODUCTS_INTENTS,
  type ProductsIntentId,
} from "@/lib/agents/products/intents";
import {
  classifyByRules,
  DEFAULT_SHORT_INPUT_MAX,
  type IntentKeywordRule,
} from "@/lib/agents/runtime";
import type { IntentClassifyResult } from "@/lib/agents/runtime/types";

export const PRODUCTS_SHORT_INPUT_MAX = DEFAULT_SHORT_INPUT_MAX;

export type { IntentClassifyResult, IntentClassifySource } from "@/lib/agents/runtime/types";

/** Keyword rules — first pass; order matters (more specific first). */
export const PRODUCTS_CLASSIFY_RULES: IntentKeywordRule<ProductsIntentId>[] = [
  {
    intent: "configure_pricing",
    patterns: [
      /配置定价|设置定价|改定价|调定价|打开定价|定价侧栏|定价模板|去配定价|配一下定价/,
      /configure\s*pric|set\s*pric|open\s*pric/i,
    ],
  },
  {
    intent: "explain_pricing",
    patterns: [
      /为什么.*定价|为啥.*定价|定价.*为什么|先配定价|定价策略|汇率|倍率|建议售价|怎么定价|定价说明/,
      /explain\s*pric|why\s*pric|pricing\s*strateg/i,
    ],
  },
  {
    intent: "propose_candidate_search",
    patterns: [
      /再找.*候选|重新搜索|重新查找|别的货源|其他货源|换个货源|便宜.*候选|候选.*搜索|搜索候选|还有别的/,
      /re-?search|other\s*sourc|more\s*candidat|cheaper\s*candidat/i,
    ],
  },
  {
    intent: "go_pending",
    patterns: [
      /待确认|待我确认|人工确认|确认关联|确认货源/,
      /pending|to\s*confirm/i,
    ],
  },
  {
    intent: "go_unbound",
    patterns: [
      /未匹配|未关联|没匹配|没有货源|找货源|未绑定/,
      /unbound|unmatched|no\s*sourc/i,
    ],
  },
  {
    intent: "go_discover",
    patterns: [
      /发现新品|去上架|商城选品|新品|catalog|去发现/,
      /discover|new\s*product|catalog/i,
    ],
  },
  {
    intent: "suggest_filters",
    patterns: [
      /筛选建议|怎么筛|过滤|价格带|类目建议|筛选一下|怎么找/,
      /filter|screening/i,
    ],
  },
  {
    intent: "summarize_shop_status",
    patterns: [
      /当前状态|店铺状态|选品状态|看一下进度|总览|汇总|概况|怎么样了|进度/,
      /status|summary|overview/i,
    ],
  },
];

const PRODUCTS_INTENT_SET = new Set(
  PRODUCTS_INTENTS.map((i) => i.id)
) as ReadonlySet<ProductsIntentId>;

export function classifyProductsIntentByRules(
  raw: string
): IntentClassifyResult<ProductsIntentId> {
  return classifyByRules(raw, {
    maxLength: PRODUCTS_SHORT_INPUT_MAX,
    rules: PRODUCTS_CLASSIFY_RULES,
    fallbackIntent: "summarize_shop_status",
    emptyClarify: "请输入简短问题，或直接点击上方任务。",
    missClarify:
      "暂时无法匹配到任务。可试试：当前状态 / 为什么要配定价 / 看待确认 / 去发现新品，或点击上方芯片。",
  });
}

export function isProductsIntentId(v: unknown): v is ProductsIntentId {
  return typeof v === "string" && PRODUCTS_INTENT_SET.has(v as ProductsIntentId);
}

export { PRODUCTS_INTENT_SET };
