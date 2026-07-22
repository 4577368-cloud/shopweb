import type {
  SkuCommandClassifyResult,
  SkuCommandDraft,
  SkuCommandId,
  SkuCommandParams,
  SkuFilterMode,
} from "@/lib/agents/sku-align/command-schema";
import {
  SKU_COMMAND_DEFS,
  SKU_COMMAND_SET,
} from "@/lib/agents/sku-align/command-schema";

function draft(
  intent: SkuCommandId,
  params: SkuCommandParams,
  opts?: {
    targetScope?: SkuCommandDraft["targetScope"];
    productId?: string;
    confirmationRequired?: boolean;
  }
): SkuCommandDraft {
  return {
    intent,
    targetScope: opts?.targetScope ?? "current",
    productId: opts?.productId,
    params,
    confirmationRequired:
      opts?.confirmationRequired ??
      (intent === "batch_confirm_pending"),
  };
}

function refersToBatch(text: string): boolean {
  return /(所有|全部|批量|每个|一次性|统一|统统)/i.test(text);
}

function detectFilterMode(text: string): SkuFilterMode {
  if (/全部关联|fully_linked/i.test(text)) return "fully_linked";
  if (/部分关联|partially_linked|待确认/i.test(text)) return "partially_linked";
  return "all";
}

const FILTER_RULES: {
  filter: SkuFilterMode;
  patterns: RegExp[];
}[] = [
  {
    filter: "partially_linked",
    patterns: [/只?看.*部分关联|部分关联商品|待确认/i],
  },
  {
    filter: "fully_linked",
    patterns: [/只?看.*全部关联|全部关联商品/i],
  },
  {
    filter: "all",
    patterns: [/看全部|全部商品|取消筛选/i],
  },
];

export function classifySkuCommandByRules(
  raw: string
): SkuCommandClassifyResult {
  const text = raw.trim();
  if (!text) {
    return {
      confidence: "none",
      source: "rules",
      clarify: "请输入命令或简短提问。",
    };
  }

  for (const rule of FILTER_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      return {
        confidence: "high",
        source: "rules",
        draft: draft("open_filter", { filterMode: rule.filter }, { targetScope: "none", confirmationRequired: false }),
      };
    }
  }

  if (/重新对齐|重新匹配|再次对齐/i.test(text)) {
    const isBatch = refersToBatch(text);
    return {
      confidence: "high",
      source: "rules",
      draft: draft("rerun_auto_align", {}, { targetScope: isBatch ? "all" : "current", confirmationRequired: false }),
    };
  }

  if (/解释匹配|为什么匹配|匹配依据|置信度/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("explain_sku_match", {}, { confirmationRequired: false }),
    };
  }

  if (/看这个商品|聚焦当前|定位当前|当前商品/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("focus_product", {}, { confirmationRequired: false }),
    };
  }

  if (/打开详情|查看详情|详情/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("open_sku_detail", {}, { confirmationRequired: false }),
    };
  }

  if (/批量确认|接受全部|全部确认/i.test(text)) {
    const batchFilter = detectFilterMode(text);
    return {
      confidence: "high",
      source: "rules",
      draft: draft(
        "batch_confirm_pending",
        { batchFilter: batchFilter === "fully_linked" ? "partially_linked" : batchFilter },
        { targetScope: "all", confirmationRequired: true }
      ),
    };
  }

  return {
    confidence: "none",
    source: "rules",
    clarify:
      "未识别为页面命令。可试试：只看部分关联 / 批量确认待确认 / 重新对齐 / 解释匹配。",
  };
}

export function parseSkuCommandDraft(raw: string): SkuCommandDraft | null {
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
    if (!SKU_COMMAND_SET.has(obj.intent as SkuCommandId)) return null;
    const params =
      obj.params && typeof obj.params === "object"
        ? (obj.params as SkuCommandParams)
        : {};
    const targetScope =
      obj.targetScope === "explicit" || obj.targetScope === "current" || obj.targetScope === "none" || obj.targetScope === "all"
        ? obj.targetScope
        : "current";
    return {
      intent: obj.intent as SkuCommandId,
      targetScope,
      productId: typeof obj.productId === "string" ? obj.productId : undefined,
      params,
      confirmationRequired:
        typeof obj.confirmationRequired === "boolean"
          ? obj.confirmationRequired
          : (obj.intent as SkuCommandId) === "batch_confirm_pending",
    };
  } catch {
    return null;
  }
}

export interface SkuCommandClassifyContext {
  focusProductTitle?: string | null;
  focusProductId?: string | null;
  currentFilter?: string | null;
  needsReviewCount?: number | null;
  fullyLinkedCount?: number | null;
  partiallyLinkedCount?: number | null;
}

export function buildSkuPageContextSummary(ctx: SkuCommandClassifyContext | null): string {
  if (!ctx) return "";
  const lines: string[] = [];
  if (ctx.focusProductTitle) {
    lines.push(`- 当前选中商品：「${ctx.focusProductTitle}」`);
    if (ctx.focusProductId) lines.push(`  ID：${ctx.focusProductId}`);
  } else {
    lines.push("- 当前未选中任何商品");
  }
  if (ctx.currentFilter) lines.push(`- 当前筛选：${ctx.currentFilter}`);
  const stats: string[] = [];
  if (ctx.fullyLinkedCount != null) stats.push(`全部关联 ${ctx.fullyLinkedCount}`);
  if (ctx.partiallyLinkedCount != null) stats.push(`部分关联 ${ctx.partiallyLinkedCount}`);
  if (ctx.needsReviewCount != null) stats.push(`待确认 ${ctx.needsReviewCount}`);
  if (stats.length) lines.push(`- 统计：${stats.join("，")}`);
  return lines.length ? `\n[当前页面上下文]\n${lines.join("\n")}` : "";
}

export function buildSkuCommandClassifySystemPrompt(
  ctx?: SkuCommandClassifyContext | null
): string {
  const lines = SKU_COMMAND_DEFS.map(
    (c) => `- ${c.id}: ${c.description}`
  ).join("\n");
  const contextBlock = buildSkuPageContextSummary(ctx ?? null);
  return `你是一位资深的 SKU 绑定运营专家，专注于变体与货源 SKU 的映射对齐工作。

你的任务：理解用户在 SKU 绑定页面输入的自然语言指令，映射为系统可执行的命令。

可用命令：
${lines}
${contextBlock ? `\n${contextBlock}\n` : ""}
[意图理解规则]
1. "只看部分关联""看待确认商品" → open_filter（params.filterMode = partially_linked）
2. "只看全部关联" → open_filter（params.filterMode = fully_linked）
3. "看全部" → open_filter（params.filterMode = all）
4. "重新对齐""重新匹配" → rerun_auto_align（单个商品时 targetScope=current，批量时 targetScope=all）
5. "解释匹配""为什么匹配这个SKU" → explain_sku_match
6. "看这个商品""聚焦当前商品" → focus_product
7. "打开详情""查看SKU详情" → open_sku_detail
8. "批量确认""接受全部待确认" → batch_confirm_pending（targetScope=all，confirmationRequired=true）

[批量操作识别]
- 包含"所有/全部/批量/每个/一次性/统一/统统"等关键词，且操作对象是多个商品时，targetScope="all"
- 批量确认时 params.batchFilter = all|partially_linked

[输出格式]
- 只输出 JSON：{"intent":"...","targetScope":"current|explicit|none|all","productId":null,"params":{},"confirmationRequired":false}
- intent 必须是上述之一
- open_filter：params.filterMode 填 all|fully_linked|partially_linked
- batch_confirm_pending：confirmationRequired 必须为 true
- 无法判断时输出 {"intent":""}`;
}