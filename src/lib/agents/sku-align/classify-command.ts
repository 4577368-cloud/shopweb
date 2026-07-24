import type {
  SkuCommandClassifyResult,
  SkuCommandClarify,
  SkuCommandDraft,
  SkuCommandId,
  SkuCommandParams,
  SkuCommandTargetScope,
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

  if (/解绑|取消绑定|解除绑定|去掉绑定|unbind/i.test(text)) {
    return {
      confidence: "high",
      source: "rules",
      draft: draft("unbind", {}, { targetScope: "current", confirmationRequired: true }),
    };
  }

  return {
    confidence: "none",
    source: "rules",
    clarify:
      "未识别为页面命令。可试试：只看部分关联 / 批量确认待确认 / 重新对齐 / 解释匹配。",
  };
}

type RawDraftObj = {
  intent?: unknown;
  targetScope?: unknown;
  productId?: unknown;
  params?: unknown;
  confirmationRequired?: unknown;
};

function extractJson(raw: string): string {
  const cleaned = raw.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function buildDraftFromObj(obj: RawDraftObj): SkuCommandDraft | null {
  if (!SKU_COMMAND_SET.has(obj.intent as SkuCommandId)) return null;
  const params =
    obj.params && typeof obj.params === "object"
      ? (obj.params as SkuCommandParams)
      : {};
  const targetScope =
    obj.targetScope === "explicit" ||
    obj.targetScope === "current" ||
    obj.targetScope === "none" ||
    obj.targetScope === "all"
      ? (obj.targetScope as SkuCommandTargetScope)
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
}

export function parseSkuCommandDraft(raw: string): SkuCommandDraft | null {
  try {
    return buildDraftFromObj(JSON.parse(extractJson(raw)) as RawDraftObj);
  } catch {
    return null;
  }
}

export type SkuCommandParsed =
  | { kind: "draft"; draft: SkuCommandDraft }
  | { kind: "steps"; steps: SkuCommandDraft[] }
  | { kind: "clarify"; clarify: SkuCommandClarify }
  | null;

/** Parse the LLM response into one of three shapes: a single draft, a
 *  multi-step sequence, or a structured clarification with candidate intents. */
export function parseSkuCommandResponse(raw: string): SkuCommandParsed {
  try {
    const obj = JSON.parse(extractJson(raw)) as {
      intent?: unknown;
      steps?: unknown;
      clarify?: unknown;
    };

    if (Array.isArray(obj.steps) && obj.steps.length > 0) {
      const steps = (obj.steps as RawDraftObj[])
        .map((s) => buildDraftFromObj(s))
        .filter((d): d is SkuCommandDraft => d !== null);
      if (steps.length > 0) return { kind: "steps", steps };
    }

    if (obj.intent != null && SKU_COMMAND_SET.has(obj.intent as SkuCommandId)) {
      const draft = buildDraftFromObj(obj as RawDraftObj);
      if (draft) return { kind: "draft", draft };
    }

    if (obj.clarify && typeof obj.clarify === "object") {
      const c = obj.clarify as { message?: unknown; candidates?: unknown };
      const candidates = Array.isArray(c.candidates)
        ? (c.candidates as { intent?: unknown; label?: unknown }[])
            .filter((x) => x && SKU_COMMAND_SET.has(x.intent as SkuCommandId))
            .map((x) => ({
              intent: x.intent as SkuCommandId,
              label: typeof x.label === "string" ? x.label : undefined,
            }))
        : undefined;
      const message = typeof c.message === "string" ? c.message : "";
      if (message || (candidates && candidates.length > 0)) {
        return { kind: "clarify", clarify: { message, candidates } };
      }
    }
    return null;
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
  ctx?: SkuCommandClassifyContext | null,
  responseLanguageRule?: string
): string {
  const lines = SKU_COMMAND_DEFS.map(
    (c) => `- ${c.id}: ${c.description}`
  ).join("\n");

  // Example phrasings per intent — the key lever for natural-language recall.
  // Mixes Chinese / English / colloquial forms so the model generalises
  // beyond literal keywords (the old rules-only path matched almost none of these).
  const examples: Record<string, string[]> = {
    open_filter: [
      "只看部分关联", "看未绑定的商品", "显示待确认的商品", "筛选需要复核的",
      "show partially linked", "show pending confirm", "只看全部关联", "取消筛选看全部",
    ],
    focus_product: [
      "聚焦当前商品", "定位这个商品", "高亮选中的商品", "滚动到当前商品",
      "focus this product", "locate the selected item",
    ],
    batch_confirm_pending: [
      "批量确认待确认", "把需要复核的一起确认", "接受所有建议的匹配", "确认 pending 的",
      "batch confirm pending", "accept all suggested matches",
    ],
    rerun_auto_align: [
      "重新对齐", "重新匹配一遍", "再跑一次自动对齐", "为未匹配的找候选",
      "re-align", "re-run auto align", "重新生成匹配",
    ],
    explain_sku_match: [
      "解释这个匹配", "为什么会对上", "匹配依据是什么", "这个置信度怎么来的",
      "explain the match", "why did this match", "show match evidence",
    ],
    open_sku_detail: [
      "打开详情", "查看 SKU 映射工作台", "展开这个商品的工作台", "打开映射详情",
      "open sku detail", "open the mapping workbench",
    ],
    bind_variant: [
      "把红色 S 码绑定到第二个货源", "将这个变体绑定货源", "bind the red S to the 2nd source",
      "给『红色连衣裙』的 M 码绑定货源", "把第 3 个变体绑到货源",
    ],
    unbind: [
      "解绑红色 S 码", "取消这个变体的绑定", "unbind the red S size", "解除绑定",
      "把 M 码解开", "去掉绑定",
    ],
    change_source: [
      "把红色 S 码换成第三个货源", "更换主货源", "change source for the red S",
      "换个货源", "主货源改成第二个",
    ],
    add_supplement_source: [
      "给这个商品加一个补充货源", "添加补充货源", "add a supplement source",
      "再挂一个货源", "增加备选货源",
    ],
    ignore_match: [
      "忽略红色 S 码的待确认匹配", "先不管这个变体", "ignore the red S match",
      "跳过这个匹配", "暂时不处理 M 码",
    ],
    set_manual: [
      "手动把红色 S 码绑到货源 12345", "手动指定绑定", "set manual binding for red S",
      "人工绑定 M 码到货源",
    ],
    tune_threshold: [
      "调高匹配阈值", "把匹配阈值调低一点", "lower the match threshold",
      "调整自动对齐的置信度", "匹配更严格一些",
    ],
  };
  const examplesBlock = Object.entries(examples)
    .map(([id, ph]) => `- ${id}:\n${ph.map((p) => `    · ${p}`).join("\n")}`)
    .join("\n");

  const contextBlock = buildSkuPageContextSummary(ctx ?? null);
  const langBlock = responseLanguageRule
    ? `\n[Language]\n${responseLanguageRule}\n`
    : "\n[Language]\nUnderstand user input in any language; output intent ids exactly as listed above.\n";
  return `You are a SKU mapping operator on a Shopify supply-chain app. Your job is to map the user's natural-language instruction — which may be vague, colloquial, in Chinese or English — to one of the executable intents below. Prefer genuine language understanding over literal keyword matching.

Available commands:
${lines}

[Example phrasings → intent]
${examplesBlock}
${contextBlock ? `\n${contextBlock}\n` : ""}
${langBlock}
[Reference & scope rules]
1. Determine targetScope:
   - User refers to the currently selected/focused product (this one / 当前 / 这个 / 选中) → targetScope="current", leave productId null.
   - User refers to a specific product by title or id (e.g. "把『红色连衣裙』…") → targetScope="explicit"; set productId to that id if it is known from the page context, otherwise leave it null (the caller resolves by title).
   - User says all / 全部 / 批量 / 每个 / 一次性 → targetScope="all".
2. filterMode synonyms (used by open_filter):
   - partially_linked: 部分关联 / 待确认 / 需要复核 / 未绑定 / 还没对上 / pending / needs review.
   - fully_linked: 全部关联 / 已绑定 / 都对上了 / fully linked.
   - all: 全部商品 / 取消筛选 / 看全部 / show all.
3. batch_confirm_pending is a sensitive (high-risk) action → always set confirmationRequired=true.
4. Slot extraction (fill params only when the user actually specifies them):
   - Variant targeting: if the user names a variant by spec (e.g. "红色 S 码" / "red S size") put it in params.variantSpec; if by ordinal (e.g. "第 3 个变体" / "the 2nd variant") put 1-based number in params.variantIndex.
   - Source targeting: if the user names a source by ordinal (e.g. "第二个货源" / "the 3rd source") put it in params.sourceRef as the ordinal word/number; if by id/title fragment put that text in params.sourceRef. Default role is params.sourceRole="primary" unless they say 补充/备选/supplement.
   - ignore_match / set_manual may carry a short params.reason.
   - tune_threshold: map "调高/更严格/higher/stricter" → threshold closer to 1 (e.g. 0.8); "调低/更宽松/lower/looser" → threshold closer to 0 (e.g. 0.5). Put the number in params.threshold.
5. bind_variant / change_source / add_supplement_source / set_manual / ignore_match are operations that finish inside the product's SKU workbench — after parsing, set targetScope to the product (current or explicit) and leave the exact source selection to the workbench. Always set confirmationRequired=true for bind_variant / unbind / change_source / add_supplement_source / set_manual / ignore_match (they are high-risk mutations).
6. unbind removes the current binding of a variant — require params.variantSpec or params.variantIndex; confirmationRequired=true.

[Multi-step commands]
- If the user gives a SEQUENCE of operations (e.g. "先看部分关联，再把待确认的批量确认" / "show partially linked then batch confirm"), output a "steps" array — each element is a normal draft object:
  {"steps":[{"intent":"open_filter","targetScope":"none","productId":null,"params":{"filterMode":"partially_linked"},"confirmationRequired":false},{"intent":"batch_confirm_pending","targetScope":"all","productId":null,"params":{"batchFilter":"partially_linked"},"confirmationRequired":true}]}
- Steps run in order, top to bottom.

[Ambiguous instructions → structured clarification]
- If the instruction is vague or could match several intents, do NOT guess a single intent. Output a "clarify" object with a short question and the 2–4 most plausible intents (by id only):
  {"clarify":{"message":"你想解绑当前商品的红色 S 码，还是先打开它的工作台看看？","candidates":[{"intent":"unbind"},{"intent":"open_sku_detail"}]}}
- Only list candidates that exist in the Available commands list above.

[Output format]
- Respond with JSON ONLY, no prose, no markdown fences.
- Single command: {"intent":"<id>","targetScope":"current|explicit|none|all","productId":null,"params":{},"confirmationRequired":false}
- Multi-step: {"steps":[<draft>,<draft>]}
- Ambiguous: {"clarify":{"message":"...","candidates":[{"intent":"<id>"},...]}}
- open_filter: params.filterMode must be one of all|fully_linked|partially_linked.
- batch_confirm_pending: confirmationRequired=true.
- bind_variant / unbind / change_source / add_supplement_source / set_manual / ignore_match: confirmationRequired=true; include params.variantSpec or params.variantIndex when a variant is named.
- tune_threshold: include params.threshold as a number between 0 and 1 when the user indicates a direction.
- If the instruction truly cannot be mapped to any intent, output {"intent":"","targetScope":"current","productId":null,"params":{},"confirmationRequired":false}.

[Few-shot examples]
Input: 只看部分关联，然后把待确认的都确认了
Output: {"steps":[{"intent":"open_filter","targetScope":"none","productId":null,"params":{"filterMode":"partially_linked"},"confirmationRequired":false},{"intent":"batch_confirm_pending","targetScope":"all","productId":null,"params":{"batchFilter":"partially_linked"},"confirmationRequired":true}]}
Input: 把红色 S 码解绑，还是先看下这个商品？
Output: {"clarify":{"message":"你想解绑当前商品的红色 S 码，还是先打开它的工作台查看？","candidates":[{"intent":"unbind"},{"intent":"open_sku_detail"}]}}
Input: 调高匹配阈值
Output: {"intent":"tune_threshold","targetScope":"current","productId":null,"params":{"threshold":0.8},"confirmationRequired":false}
Input: 给这个商品加个补充货源，再把需要复核的批量确认
Output: {"steps":[{"intent":"add_supplement_source","targetScope":"current","productId":null,"params":{},"confirmationRequired":true},{"intent":"batch_confirm_pending","targetScope":"all","productId":null,"params":{"batchFilter":"partially_linked"},"confirmationRequired":true}]}`;
}