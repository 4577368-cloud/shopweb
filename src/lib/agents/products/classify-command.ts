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
import { parseTargetLangFromText } from "@/lib/translate/lang-codes";
import { detectTitleLocalizationStyle } from "@/lib/translate/localize-product-title";

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
    confirmationRequired:
      opts?.confirmationRequired ??
      (intent === "update_listing_price" || intent === "update_product_copy"),
  };
}

function tryListingPriceCommand(text: string): ProductCommandDraft | null {
  if (!/(售价|卖价|上架价|listing|shopify.*价|改成|改为|设为|价格)/i.test(text)) {
    return null;
  }
  // 排除明显是定价配置/汇率/策略相关的，不是改某个商品价格
  if (/(汇率|费率|策略|模板|配置|设置|定价策略|定价模板|默认|全局)/i.test(text)) {
    return null;
  }
  const isBatch = refersToBatch(text);
  if (isBatch) {
    const multiplierMatch = text.match(/采购价(?:的)?\s*(\d+(?:\.\d+)?)\s*倍/i);
    const fixedMatch = parseListingPrice(text);
    if (!multiplierMatch && !fixedMatch) return null;
    const batchFilter = detectBatchFilter(text);
    return draft(
      "batch_update_listing_price",
      {
        batchFilter,
        batchPriceMultiplier: multiplierMatch ? Number(multiplierMatch[1]) : undefined,
        batchPriceFixed: fixedMatch?.price,
      },
      {
        targetScope: "all",
        confirmationRequired: true,
      }
    );
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

function parseTargetLang(text: string): string | undefined {
  return parseTargetLangFromText(text);
}

function detectCopyField(text: string): "title" | "description" | "all" {
  if (/标题|title/i.test(text)) return "title";
  if (/描述|详情|description/i.test(text)) return "description";
  if (/文案|全部|所有|all/i.test(text)) return "all";
  return "title";
}

function detectCopyAction(text: string): "translate" | "rewrite" | "optimize" | null {
  if (/翻译|译一下|译出来|翻一下|translate/i.test(text)) {
    return "translate";
  }
  if (/改写|重写|重写一下|rewrite/i.test(text)) {
    return "rewrite";
  }
  if (/优化|润色|吸引人|更好听|优化一下|optimize/i.test(text)) {
    return "optimize";
  }
  return null;
}

function refersToBatch(text: string): boolean {
  return /(所有|全部|批量|每个|所有商品|全部商品|批量商品|一次性|统一|统统|全部改成|全部换成|给所有|都给|每个商品|都改|统一改|都改掉|全部改)/i.test(
    text
  );
}

function tryProductCopyCommand(text: string): ProductCommandDraft | null {
  const action = detectCopyAction(text);
  if (!action) return null;
  if (!/(标题|描述|详情|文案|这个商品|该商品|商品)/i.test(text) && !refersToCurrentProduct(text) && !refersToBatch(text)) {
    return null;
  }
  const copyField = detectCopyField(text);
  const targetLang = action === "translate" ? parseTargetLang(text) : undefined;
  const copyStyle =
    action === "translate" ? detectTitleLocalizationStyle(text) : undefined;
  const isBatch = refersToBatch(text);

  if (isBatch) {
    const batchFilter = detectBatchFilter(text);
    return draft(
      "batch_update_product_copy",
      {
        copyField,
        copyAction: action,
        copyTargetLang: targetLang,
        copyStyle,
        batchFilter,
      },
      {
        targetScope: "all",
        confirmationRequired: true,
      }
    );
  }

  const productTitleHint = refersToCurrentProduct(text)
    ? undefined
    : extractProductTitleHint(text) ?? undefined;
  return draft(
    "update_product_copy",
    {
      copyField,
      copyAction: action,
      copyTargetLang: targetLang,
      copyStyle,
      productTitleHint,
    },
    {
      targetScope: productTitleHint ? "explicit" : "current",
      confirmationRequired: true,
    }
  );
}

function detectBatchFilter(text: string): "all" | "pending" | "confirmed" | "unbound" {
  if (/待确认|pending/i.test(text)) return "pending";
  if (/已确认|confirmed/i.test(text)) return "confirmed";
  if (/未匹配|未关联|unbound/i.test(text)) return "unbound";
  return "all";
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

  // 无歧义的筛选/解释仍走规则
  for (const rule of FILTER_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        confidence: "high",
        source: "rules",
        draft: draft("open_filter", { shopFilter: rule.filter }, { targetScope: "none", confirmationRequired: false }),
      };
    }
  }

  // 写操作：规则能明确识别的走规则（批量翻译/改价等），其余交给 LLM
  const copyCmd = tryProductCopyCommand(text);
  if (copyCmd) {
    return { confidence: "high", source: "rules", draft: copyCmd };
  }

  const priceCmd = tryListingPriceCommand(text);
  if (priceCmd) {
    return { confidence: "high", source: "rules", draft: priceCmd };
  }

  // 未命中快速操作，交给 LLM 判断

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

  // 未命中快速操作，交给 LLM 判断
  return {
    confidence: "none",
    source: "rules",
    clarify:
      "未识别为页面命令。可试试：只看待确认 / 给这个商品再找候选 / 翻译这个商品标题 / 把售价改成 9.9 美元。",
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

export interface CommandClassifyContext {
  /** 当前选中商品标题 */
  focusProductTitle?: string | null;
  /** 当前选中商品价格 */
  focusProductPrice?: string | null;
  /** 当前选中商品绑定状态 */
  focusProductBindState?: string | null;
  /** 定价是否已配置 */
  pricingConfigured?: boolean | null;
  /** 定价摘要（如"已配置：USD · 汇率 7.2 · 倍率 ×1.5"） */
  pricingSummary?: string | null;
  /** 当前 tab */
  currentTab?: string | null;
  /** 当前筛选 */
  currentFilter?: string | null;
  /** 统计数字 */
  pendingCount?: number | null;
  unboundCount?: number | null;
  analyzedCount?: number | null;
}

export function buildPageContextSummary(ctx: CommandClassifyContext | null): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.focusProductTitle) {
    lines.push(`- 当前选中商品：「${ctx.focusProductTitle}」`);
    if (ctx.focusProductPrice) lines.push(`  售价：${ctx.focusProductPrice}`);
    if (ctx.focusProductBindState) lines.push(`  绑定状态：${ctx.focusProductBindState}`);
  } else {
    lines.push("- 当前未选中任何商品");
  }
  if (ctx.pricingConfigured != null) {
    lines.push(
      ctx.pricingConfigured
        ? `- 定价已配置：${ctx.pricingSummary ?? "已就绪"}`
        : "- 定价尚未配置（当前为系统默认）"
    );
  }
  if (ctx.currentTab) lines.push(`- 当前标签页：${ctx.currentTab}`);
  if (ctx.currentFilter) lines.push(`- 当前筛选：${ctx.currentFilter}`);
  const stats: string[] = [];
  if (ctx.analyzedCount != null) stats.push(`已分析 ${ctx.analyzedCount}`);
  if (ctx.pendingCount != null) stats.push(`待确认 ${ctx.pendingCount}`);
  if (ctx.unboundCount != null) stats.push(`未匹配 ${ctx.unboundCount}`);
  if (stats.length) lines.push(`- 统计：${stats.join("，")}`);
  return lines.length ? `\n[当前页面上下文]\n${lines.join("\n")}` : "";
}

export function buildCommandClassifySystemPrompt(
  ctx?: CommandClassifyContext | null
): string {
  const lines = PRODUCT_COMMAND_DEFS.map(
    (c) => `- ${c.id}: ${c.description}`
  ).join("\n");
  const contextBlock = buildPageContextSummary(ctx ?? null);
  return `你是一位资深的 Shopify 独立站选品运营专家，兼具以下领域能力：
- 选品策略：品类趋势判断、利润空间分析、竞品对比、季节性选品
- 定价分析：汇率换算、成本结构、利润率计算、多市场定价策略
- SKU 管理：变体管理、库存监控、货源绑定、供应链协调
- SEO 文案：商品标题优化、描述改写、关键词布局、多语言翻译
- 数据分析：转化率、ROAS、客单价、退货率等核心指标解读

你的任务：理解用户在选品页面输入的自然语言指令，映射为系统可执行的命令。

不要把自己当"分类器"。要像一个资深运营同事，理解用户的真实意图，再决定执行什么操作。

可用命令：
${lines}
${contextBlock ? `\n${contextBlock}\n` : ""}
[意图理解规则]
1. 先理解用户想做什么（修改价格？翻译文案？打开设置？查看商品？），再映射到对应命令
2. 关键区分——"修改售价" vs "打开定价设置"：
   - "把这个商品价格改成 9.9" → update_listing_price（改某个商品的 Shopify 售价）
   - "定价汇率改为 7.2""定价策略改成 xx""配置定价" → open_pricing_editor（打开定价模板设置）
   - 判断依据：如果说的是针对某个具体商品的价格数值修改 → update_listing_price；如果说的是定价模板/汇率/倍率/策略/配置 → open_pricing_editor
3. "翻译标题""改写描述""优化文案" → update_product_copy（单个商品）
   - 默认 copyStyle=amazon：按 Amazon 热销标题结构本土化，不是机械直译
   - 用户说「直译」时 copyStyle=literal
4. 批量操作识别——包含"所有/全部/批量/每个/一次性/统一/统统"等关键词，且操作对象是多个商品：
   - "所有商品标题翻译成英文" → batch_update_product_copy（批量文案修改）
   - "把全部商品描述改成英文" → batch_update_product_copy
   - 批量操作 targetScope = "all"，params.batchFilter = all|pending|confirmed|unbound
5. "只看待确认""看未匹配" → open_filter
6. "再找候选""重搜货源" → rerun_candidate_search
7. "为什么推荐这个" → explain_product_match (matchExplain=reason)
8. "这个靠谱吗""有什么风险" → explain_product_match (matchExplain=risk)

[结合上下文判断]
- 如果用户说"翻译这个商品标题"，而上下文显示有选中商品，则 targetScope=current
- 如果用户说"把拖鞋价格改成 9.9"，而上下文选中的是别的商品，则 targetScope=explicit，提取商品名
- 如果上下文未选中商品，但用户说"翻译标题"，仍可归类为 update_product_copy，targetScope=current（系统会提示选商品）

[输出格式]
- 只输出 JSON：{"intent":"...","targetScope":"current|explicit|none","productId":null,"params":{},"confirmationRequired":false}
- intent 必须是上述之一
- update_listing_price：从原文提取 price（数字）和 currency（如 USD）；confirmationRequired 必须为 true
- 多规格时 params 填 priceScope=all 或 priceScope=one + variantLabelHint
- open_filter：params.shopFilter 填 all|pending|confirmed|unbound|new_arrivals
- explain_product_match：params.matchExplain = reason|risk
- update_product_copy：
   - params.copyField: title|description|all（默认 title）
   - params.copyAction: translate|rewrite|optimize
   - params.copyTargetLang: 目标语言代码（en/zh/ja/ko/ar/es/fr/de/ru/pt/it/th/vi/tr 等），仅 translate 时需要
   - params.copyStyle: amazon（默认，Amazon 热销标题本土化）| literal（直译）
   - confirmationRequired 必须为 true
- batch_update_product_copy（批量文案修改）：
   - targetScope = "all"
   - params.copyField: title|description|all（默认 title）
   - params.copyAction: translate|rewrite|optimize
   - params.copyTargetLang: 目标语言代码（en/zh/ja/ko/ar/es/fr/de/ru/pt/it/th/vi/tr 等），仅 translate 时需要
   - params.copyStyle: amazon（默认，Amazon 热销标题本土化）| literal（直译）
   - params.batchFilter: all|pending|confirmed|unbound（默认 all）
   - confirmationRequired 必须为 true
- 无法判断时输出 {"intent":""}`;
}
