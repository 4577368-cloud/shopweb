import { PRODUCTS_SHORT_INPUT_MAX } from "@/lib/agents/products/classify-intent";
import type {
  ProductCommandClassifyResult,
  ProductCommandDraft,
  ProductCommandId,
  ProductCommandParams,
  ProductCommandShopFilter,
} from "@/lib/agents/products/command-schema";
import {
  PRODUCT_COMMAND_DEFS,
  PRODUCT_COMMAND_SET,
} from "@/lib/agents/products/command-schema";
import { extractProductTitleHint, refersToCurrentProduct } from "@/lib/agents/products/resolve-product-target";
import { extractListingPriceScopeHints } from "@/lib/agents/products/resolve-variant-target";

const PROCUREMENT_BLOCK =
  /采购价|进货价|成本价|货源价|offer\s*price|procurement|purchase\s*cost/i;

const CURRENCY_ALIASES: Record<string, string> = {
  美元: "USD",
  美金: "USD",
  usd: "USD",
  $: "USD",
  欧元: "EUR",
  eur: "EUR",
  英镑: "GBP",
  gbp: "GBP",
  人民币: "CNY",
  cny: "CNY",
  元: "CNY",
};

function normalizeCurrency(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  if (!key) return undefined;
  const upper = key.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return CURRENCY_ALIASES[key] ?? CURRENCY_ALIASES[key.toLowerCase()];
}

function parseListingPrice(text: string): { price: number; currency?: string } | null {
  const patterns = [
    /(?:价格|售价|卖价)\s*(?:改(?:成|为)|设为|设置为)\s*(\d+(?:\.\d+)?)/i,
    /(?:改成|改为|设为|设置为|调整到?)\s*(\d+(?:\.\d+)?)\s*(美元|美金|USD|usd|\$|EUR|eur|欧元|GBP|gbp|英镑|CNY|cny|元)?/i,
    /(\d+(?:\.\d+)?)\s*(美元|美金|USD|usd|\$|EUR|eur|欧元|GBP|gbp|英镑)\s*(?:售价|价格)?/i,
    /\$\s*(\d+(?:\.\d+)?)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const price = Number(m[1]);
    if (!Number.isFinite(price) || price <= 0) continue;
    const currency = normalizeCurrency(m[2] ?? undefined);
    return { price, currency };
  }
  return null;
}

function draft(
  intent: ProductCommandId,
  params: ProductCommandParams,
  opts?: {
    targetScope?: ProductCommandDraft["targetScope"];
    productId?: string;
    confirmationRequired?: boolean;
  }
): ProductCommandDraft {
  return {
    intent,
    targetScope: opts?.targetScope ?? "current",
    productId: opts?.productId,
    params,
    confirmationRequired: opts?.confirmationRequired ?? intent === "update_listing_price",
  };
}

function tryListingPriceCommand(text: string): ProductCommandDraft | null {
  if (!/(售价|卖价|上架价|listing|shopify.*价|改成|改为|设为|价格)/i.test(text)) {
    return null;
  }
  const parsed = parseListingPrice(text);
  if (!parsed) return null;
  const productTitleHint = refersToCurrentProduct(text)
    ? undefined
    : extractProductTitleHint(text) ?? undefined;
  const scopeHints = extractListingPriceScopeHints(text);
  return draft(
    "update_listing_price",
    {
      price: parsed.price,
      currency: parsed.currency,
      productTitleHint,
      ...scopeHints,
    },
    {
      targetScope: productTitleHint ? "explicit" : "current",
      confirmationRequired: true,
    }
  );
}

function withTitleHint(
  text: string,
  base: ProductCommandDraft
): ProductCommandDraft {
  const productTitleHint = extractProductTitleHint(text);
  if (!productTitleHint) return base;
  return {
    ...base,
    targetScope: "explicit",
    params: { ...base.params, productTitleHint },
  };
}

const FILTER_RULES: {
  filter: ProductCommandShopFilter;
  patterns: RegExp[];
}[] = [
  {
    filter: "pending",
    patterns: [/只?看.*待确认|看待确认|待确认商品|筛选.*待确认|pending/i],
  },
  {
    filter: "unbound",
    patterns: [/只?看.*未匹配|未匹配商品|未关联商品|看未关联|unbound/i],
  },
  {
    filter: "confirmed",
    patterns: [/只?看.*已确认|已确认商品|confirmed/i],
  },
  {
    filter: "new_arrivals",
    patterns: [/只?看.*新入库|新入库商品|新商品/i],
  },
  {
    filter: "all",
    patterns: [/看全部|全部商品|取消筛选/i],
  },
];

export function classifyProductCommandByRules(
  raw: string
): ProductCommandClassifyResult {
  const text = raw.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX);
  if (!text) {
    return {
      confidence: "none",
      source: "rules",
      clarify: "请输入命令或简短提问。",
    };
  }

  if (PROCUREMENT_BLOCK.test(text)) {
    return {
      confidence: "none",
      source: "rules",
      clarify:
        "采购价由货源绑定决定，不能通过命令直接修改。如需改 Shopify 售价，请说「把售价改成 9.9 美元」。",
    };
  }

  const listing = tryListingPriceCommand(text);
  if (listing) {
    return { confidence: "high", source: "rules", draft: listing };
  }

  for (const rule of FILTER_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        confidence: "high",
        source: "rules",
        draft: draft("open_filter", { shopFilter: rule.filter }, { targetScope: "none", confirmationRequired: false }),
      };
    }
  }

  if (/再找.*候选|重新搜索|重新查找|重搜候选|更多候选|别的货源/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: withTitleHint(
        text,
        draft("rerun_candidate_search", {}, { confirmationRequired: false })
      ),
    };
  }

  if (/为什么推荐|为何推荐|推荐依据|推荐原因/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: withTitleHint(
        text,
        draft(
          "explain_product_match",
          { matchExplain: "reason" },
          { confirmationRequired: false }
        )
      ),
    };
  }

  if (/不确定|哪里不稳|有什么问题|靠谱吗|不确定点/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: withTitleHint(
        text,
        draft(
          "explain_product_match",
          { matchExplain: "risk" },
          { confirmationRequired: false }
        )
      ),
    };
  }

  if (/打开.*定价|定价设置|定价策略|编辑定价|去配定价/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("open_pricing_editor", {}, { confirmationRequired: false }),
    };
  }

  if (/看这个商品|聚焦当前|定位当前|当前商品|聚焦这个/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("focus_product", {}, { confirmationRequired: false }),
    };
  }

  const titleOnly = extractProductTitleHint(text);
  if (titleOnly && /看|聚焦|定位/.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft(
        "focus_product",
        { productTitleHint: titleOnly },
        { targetScope: "explicit", confirmationRequired: false }
      ),
    };
  }

  return {
    confidence: "none",
    source: "rules",
    clarify:
      "未识别为页面命令。可试试：只看待确认 / 给这个商品再找候选 / 为什么推荐 / 把售价改成 9.9 美元。",
  };
}

export function parseProductCommandDraft(raw: string): ProductCommandDraft | null {
  const cleaned = raw.trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const json =
      start >= 0 && end > start
        ? cleaned.slice(start, end + 1)
        : cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const obj = JSON.parse(json) as {
      intent?: unknown;
      targetScope?: unknown;
      productId?: unknown;
      params?: unknown;
      confirmationRequired?: unknown;
    };
    if (!PRODUCT_COMMAND_SET.has(obj.intent as ProductCommandId)) return null;
    const params =
      obj.params && typeof obj.params === "object"
        ? (obj.params as ProductCommandParams)
        : {};
    if (params.price != null) {
      const n = Number(params.price);
      if (!Number.isFinite(n) || n <= 0) return null;
      params.price = n;
    }
    if (params.currency) {
      params.currency = normalizeCurrency(String(params.currency)) ?? String(params.currency).toUpperCase();
    }
    if (params.priceScope != null && params.priceScope !== "all" && params.priceScope !== "one") {
      delete params.priceScope;
    }
    const targetScope =
      obj.targetScope === "explicit" || obj.targetScope === "current" || obj.targetScope === "none"
        ? obj.targetScope
        : "current";
    return {
      intent: obj.intent as ProductCommandId,
      targetScope,
      productId: typeof obj.productId === "string" ? obj.productId : undefined,
      params,
      confirmationRequired:
        typeof obj.confirmationRequired === "boolean"
          ? obj.confirmationRequired
          : (obj.intent as ProductCommandId) === "update_listing_price",
    };
  } catch {
    return null;
  }
}

export function buildCommandClassifySystemPrompt(): string {
  const lines = PRODUCT_COMMAND_DEFS.map(
    (c) => `- ${c.id}: ${c.description}`
  ).join("\n");
  return `你是商品页受控命令分类器。把用户短句映射为固定 JSON 命令，禁止自由聊天。

可用 intent：
${lines}

规则：
1. 只输出 JSON：{"intent":"...","targetScope":"current|explicit|none","productId":null,"params":{},"confirmationRequired":false}
2. intent 必须是上述之一
3. 「改价格」默认指 Shopify 售价 listing price，不是采购价；若用户明确说采购价/成本价，不要输出命令（由上层拦截）
4. update_listing_price 必须从原文提取 price（数字）和 currency（如 USD）；confirmationRequired 必须为 true
5. 多规格时可在 params 填 priceScope=all（全部规格同价）或 priceScope=one + variantLabelHint（如「M码」「黑色」）
6. open_filter 在 params.shopFilter 填 all|pending|confirmed|unbound|new_arrivals
7. explain_product_match 用 params.matchExplain = reason|risk
8. 无法判断时不要编造字段；若无法映射任何命令，输出 {"intent":""}`;
}
