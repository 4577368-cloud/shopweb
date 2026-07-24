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
import { extractProductTitleHint, refersToCurrentProduct, refersToCurrentProductForCopy } from "@/lib/agents/products/resolve-product-target";
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

const TITLE_CHANGE_TO_LANG =
  /(?:修改|改|调整|翻译)(?:为|成|到)|改成|改为|调整为|翻译为|翻译成|译成|译为/i;

const COPY_SUBJECT =
  /(?:标题|描述|详情|文案|title|description|商品标题|商品)/i;

function hasCopySubject(text: string): boolean {
  return (
    refersToCurrentProductForCopy(text) ||
    refersToBatch(text) ||
    COPY_SUBJECT.test(text)
  );
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
  if (/(售价|卖价|上架价|listing\s*price)/i.test(text)) {
    return null;
  }
  const targetLang = parseTargetLangFromText(text);
  if (targetLang && hasCopySubject(text) && TITLE_CHANGE_TO_LANG.test(text)) {
    return "translate";
  }
  if (/翻译\s*(?:这个|该|当前|此)?\s*商品/i.test(text) && targetLang) {
    return "translate";
  }
  if (/(?:标题|title)/i.test(text) && TITLE_CHANGE_TO_LANG.test(text) && targetLang) {
    return "translate";
  }
  if (refersToCurrentProductForCopy(text) && TITLE_CHANGE_TO_LANG.test(text) && targetLang) {
    return "translate";
  }
  if (
    /(?:把它|将它|给它)/.test(text) &&
    /(?:标题|title)/i.test(text) &&
    TITLE_CHANGE_TO_LANG.test(text)
  ) {
    return "translate";
  }
  return null;
}

function refersToBatch(text: string): boolean {
  return /(所有|全部|批量|每个|所有商品|全部商品|批量商品|一次性|统一|统统|全部改成|全部换成|给所有|都给|每个商品|都改|统一改|都改掉|全部改)/i.test(
    text
  );
}

function tryProductStatusCommand(text: string): ProductCommandDraft | null {
  const wantsDraft = /(放到草稿|设为草稿|改成草稿|移入草稿|保存为草稿|转草稿|draft)/i.test(
    text
  );
  const wantsArchive =
    /(下架|归档|archive)/i.test(text) && !wantsDraft;

  if (!wantsDraft && !wantsArchive) return null;
  if (
    !refersToCurrentProduct(text) &&
    !/(商品|这个品|该品)/i.test(text) &&
    !refersToBatch(text) &&
    !extractProductTitleHint(text)
  ) {
    return null;
  }

  const isBatch = refersToBatch(text);
  const batchFilter = detectBatchFilter(text);
  const productTitleHint = refersToCurrentProduct(text)
    ? undefined
    : extractProductTitleHint(text) ?? undefined;

  if (wantsDraft) {
    const intent = isBatch ? "batch_draft_products" : "draft_product";
    return draft(
      intent,
      isBatch ? { batchFilter } : { productTitleHint },
      {
        targetScope: isBatch ? "all" : productTitleHint ? "explicit" : "current",
        confirmationRequired: true,
      }
    );
  }

  const intent = isBatch ? "batch_archive_products" : "archive_product";
  return draft(
    intent,
    isBatch ? { batchFilter } : { productTitleHint },
    {
      targetScope: isBatch ? "all" : productTitleHint ? "explicit" : "current",
      confirmationRequired: true,
    }
  );
}

function tryProductCopyCommand(text: string): ProductCommandDraft | null {
  const action = detectCopyAction(text);
  if (!action) return null;
  if (!hasCopySubject(text)) {
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

  const productTitleHint = refersToCurrentProductForCopy(text)
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

/** Rule-based product copy intent — used before LLM and in rule fallback. */
export function matchProductCopyCommand(text: string): ProductCommandDraft | null {
  return tryProductCopyCommand(text.trim().slice(0, PRODUCTS_SHORT_INPUT_MAX));
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

function parseChineseOrdinal(raw: string): number | null {
  const t = raw.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (t.length === 1 && map[t] != null) return map[t];
  if (t.startsWith("十")) {
    const rest = t.slice(1);
    return 10 + (map[rest] ?? 0);
  }
  if (t.endsWith("十")) {
    const head = t.slice(0, -1);
    return (map[head] ?? 0) * 10 || 10;
  }
  const tenIdx = t.indexOf("十");
  if (tenIdx > 0) {
    const tens = map[t.slice(0, tenIdx)] ?? 0;
    const ones = map[t.slice(tenIdx + 1)] ?? 0;
    const n = tens * 10 + ones;
    return n > 0 ? n : null;
  }
  return null;
}

const EN_ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

function tryPublishListIndex(text: string): number | null {
  const patterns: RegExp[] = [
    /(?:上架|发布|publish|list|publier|publicar)\s*(?:item\s*)?#?\s*(\d+)\s*(?:个)?/i,
    /(?:上架|发布|publish|list)\s*(?:第)?\s*([一二三四五六七八九十两\d]+)\s*个?/i,
    /第?\s*(\d+)\s*个.*(?:上架|发布|publish|list)/i,
    /(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:one|item)/i,
    /(?:le|la)\s+(premier|première|deuxième|troisième|quatrième|cinquième)/i,
    /(?:el|la)\s+(primer|primera|segundo|segunda|tercer|tercera)\s+(?:artículo|producto)?/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const raw = m[1];
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (n > 0) return n;
    }
    const cn = parseChineseOrdinal(raw);
    if (cn != null) return cn;
    const en = EN_ORDINAL_WORDS[raw.toLowerCase()];
    if (en != null) return en;
    const frMap: Record<string, number> = {
      premier: 1,
      première: 1,
      deuxième: 2,
      troisième: 3,
      quatrième: 4,
      cinquième: 5,
    };
    if (frMap[raw.toLowerCase()]) return frMap[raw.toLowerCase()];
    const esMap: Record<string, number> = {
      primer: 1,
      primera: 1,
      segundo: 2,
      segunda: 2,
      tercer: 3,
      tercera: 3,
    };
    if (esMap[raw.toLowerCase()]) return esMap[raw.toLowerCase()];
  }
  return null;
}

function trySourcingCommand(text: string): ProductCommandDraft | null {
  const publishIndex = tryPublishListIndex(text);
  if (publishIndex != null) {
    return draft(
      "publish_sourcing_item",
      { sourcingListIndex: publishIndex },
      { targetScope: "none", confirmationRequired: true }
    );
  }

  if (/^(上架|发布|publish|list)\s*(这个|这款|它|this|it)?[。.!]?$/i.test(text.trim())) {
    return draft(
      "publish_sourcing_item",
      {},
      { targetScope: "current", confirmationRequired: true }
    );
  }

  const budgetMatch =
    text.match(
      /(?:预算|价格|不超过|以内|under|max|moins\s+de|menos\s+de)\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:美元|美金|usd|\$)?/i
    ) ??
    text.match(/(\d+(?:\.\d+)?)\s*(?:美元|美金|usd|\$)\s*(?:以内|以下|under|max)/i);
  const only1688 =
    /只看.*1688|只要.*1688|only\s*1688|1688\s*only|solo\s*1688|uniquement\s*1688/i.test(
      text
    );
  const onlyTangbuy =
    /只看.*tangbuy|只要tangbuy|only\s*tangbuy|solo\s*tangbuy|uniquement\s*tangbuy/i.test(
      text
    );
  if (budgetMatch || only1688 || onlyTangbuy) {
    const params: ProductCommandParams = {};
    if (budgetMatch) {
      params.sourcingPriceMaxUsd = Number(budgetMatch[1]);
    }
    if (only1688) params.sourcingSourceFilter = "1688";
    if (onlyTangbuy) params.sourcingSourceFilter = "tangbuy";
    return draft("set_sourcing_filters", params, {
      targetScope: "none",
      confirmationRequired: false,
    });
  }

  const implicit1688 = text.match(
    /^(?:在)?1688\s*(?:上|里|的)?\s*(?:找|搜|搜索)?\s*(.+)/i
  );
  if (implicit1688) {
    const kw = implicit1688[1].replace(/[。.!？?]+$/, "").trim();
    if (kw.length >= 2) {
      return draft(
        "search_sourcing",
        { sourcingKeywords: kw, sourcingSourceFilter: "1688" },
        { targetScope: "none", confirmationRequired: false }
      );
    }
  }

  const searchMatch =
    text.match(/(?:帮我)?(?:找|搜索|寻)\s*(.+)/) ??
    text.match(
      /(?:look\s*for|search\s*for|find|buscar|chercher|trouver)\s+(.+)/i
    );
  if (
    searchMatch &&
    !/(待确认|未匹配|店铺商品|shop\s*product|produit.*boutique)/i.test(text)
  ) {
    let kw = searchMatch[1].replace(/[。.!？?]+$/, "").trim();
    kw = kw.replace(/^1688\s*(上|的|里)?\s*/i, "").trim();
    kw = kw.replace(/^(on|from)\s+1688\s*/i, "").trim();
    if (kw.length >= 2) {
      const params: ProductCommandParams = { sourcingKeywords: kw };
      if (/1688/i.test(text) && !/tangbuy/i.test(text)) {
        params.sourcingSourceFilter = "1688";
      }
      return draft("search_sourcing", params, {
        targetScope: "none",
        confirmationRequired: false,
      });
    }
  }

  return null;
}

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

  const statusCmd = tryProductStatusCommand(text);
  if (statusCmd) {
    return { confidence: "high", source: "rules", draft: statusCmd };
  }

  const sourcingCmd = trySourcingCommand(text);
  if (sourcingCmd) {
    return { confidence: "high", source: "rules", draft: sourcingCmd };
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
      "未识别为页面命令。可试试：只看待确认 / 给这个商品再找候选 / 翻译这个商品标题 / 把售价改成 9.9 美元 / 把这个商品放到草稿 / 批量下架所有商品。",
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
  ctx?: CommandClassifyContext | null,
  responseLanguageRule?: string
): string {
  const lines = PRODUCT_COMMAND_DEFS.map(
    (c) => `- ${c.id}: ${c.description}`
  ).join("\n");
  const contextBlock = buildPageContextSummary(ctx ?? null);
  const langBlock = responseLanguageRule
    ? `\n[Language]\n${responseLanguageRule}\n`
    : "\n[Language]\nUnderstand user input in any language (English, French, Spanish, Chinese, etc.).\n";
  return `You are a senior Shopify product-sourcing operator. Map natural-language commands to executable system intents.

Available commands:
${lines}
${contextBlock ? `\n${contextBlock}\n` : ""}
${langBlock}
[Intent rules]
1. Understand what the user wants (change price? translate copy? open settings? view products?) before mapping.
2. Distinguish "change listing price" vs "open pricing settings":
   - "Set this product price to 9.9" → update_listing_price
   - "Change exchange rate to 7.2" / "configure pricing" → open_pricing_editor
3. Product copy / translation (NOT listing price unless 售价/卖价/金额数字):
   - Synonyms for translate: 翻译/译/翻, and when a target language is named: 修改为/改成/改为/调整为/翻译为/翻译成/成为/成/为/到 + language
   - Language names → params.copyTargetLang: 英文/英语→en, 日文/日语/日本语→ja, 韩文/韩语→ko, 中文/中文简体/简体→zh, etc.
   - Field: 标题/title (default if omitted), 描述/description, 文案/all
   - Scope: 这个商品/当前商品/这个/当前/把它/将它/翻译这个商品… with no other product name → targetScope=current (use [当前页面上下文] selected product)
   - Examples: 「标题修改为英文」「把它标题改成韩文」「翻译这个商品成为日语」→ update_product_copy, copyAction=translate
   - 「改写/优化」→ rewrite or optimize; batch keywords → batch_update_product_copy
   - Default copyStyle=amazon unless user asks for literal translation
4. Batch ops — keywords like all/every/batch/each → batch_* intents with targetScope=all
5. "Show pending only" / "show unlinked" → open_filter
6. "Re-search candidates" → rerun_candidate_search
7. "Why recommend this" → explain_product_match (matchExplain=reason)
8. "Is this reliable" / "any risks" → explain_product_match (matchExplain=risk)
9. "Move to draft" → draft_product or batch_draft_products
10. "Archive" / "delist" → archive_product or batch_archive_products
11. Discover sourcing — "find red dress" / "search phone cases on 1688" → search_sourcing (params.sourcingKeywords, optional sourcingSourceFilter)
12. "List item 2" / "publish the second one" → publish_sourcing_item (params.sourcingListIndex)
13. "Under $15" / "Tangbuy only" / "1688 only" on discover → set_sourcing_filters

[Output format]
- JSON only: {"intent":"...","targetScope":"current|explicit|none|all","productId":null,"params":{},"confirmationRequired":false}
- intent must be one of the commands above
- update_listing_price: extract price + currency; confirmationRequired=true
- open_filter: params.shopFilter = all|pending|confirmed|unbound|new_arrivals
- explain_product_match: params.matchExplain = reason|risk
- update_product_copy / batch_update_product_copy:
   - params.copyField: title|description|all
   - params.copyAction: translate|rewrite|optimize
   - params.copyTargetLang: en/zh/ja/ko/ar/es/fr/de/ru/pt/it/th/vi/tr etc. (translate only)
   - params.copyStyle: amazon|literal
   - confirmationRequired=true for write ops
- draft/archive batch ops: params.batchFilter = all|pending|confirmed|unbound
- If unsure, output {"intent":""}`;
}
