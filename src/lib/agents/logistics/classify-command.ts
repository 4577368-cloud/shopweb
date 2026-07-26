import type {
  LogisticsCommandClassifyResult,
  LogisticsCommandDraft,
  LogisticsCommandTargetScope,
  LogisticsDecisionStatus,
  LogisticsCommandId,
  LogisticsCommandParams,
} from "./command-schema";
import { LOGISTICS_COMMAND_SET } from "./command-schema";

export interface LogisticsCommandClassifyContext {
  focusProductTitle: string | null;
  focusProductId: string | null;
  currentFilter: string | null;
  readyAcceptCount: number;
  pendingCount: number;
  confirmedCount: number;
  highRiskTypes: string[];
}

/**
 * 规则分类器：仅对高置信度的明确指令短路。
 * 自由表达交由 LLM 处理（command-client 使用 llm-first）。
 *
 * confidence 分档：
 * - high: 精确匹配命令关键词（如"批量接受"、"全量刷新报价"）
 * - medium: 模糊匹配（如"看看问题"、"处理一下"），需 LLM 复核
 * - none: 无匹配
 */
export function classifyLogisticsCommandByRules(
  text: string,
  context?: LogisticsCommandClassifyContext | null
): LogisticsCommandClassifyResult {
  const lower = text.toLowerCase().trim();

  const hasNegation =
    lower.includes("不") ||
    lower.includes("别") ||
    lower.includes("不要") ||
    lower.includes("don't") ||
    lower.includes("do not") ||
    lower.includes("no ") ||
    lower.includes("cancel") ||
    lower.includes("undo");

  // explain_quote — 解释报价（只读）
  if (wantsExplainQuote(lower)) {
    const hint =
      extractProductTitleHint(text) ||
      context?.focusProductTitle?.trim() ||
      undefined;
    if (hint || context?.focusProductId) {
      return {
        confidence: hint ? "high" : "medium",
        source: "rules",
        draft: buildDraft(
          "explain_quote",
          "current",
          { productTitleHint: hint },
          context?.focusProductId ?? undefined
        ),
      };
    }
    return {
      confidence: "medium",
      source: "rules",
      draft: buildDraft("explain_quote", "current", {}),
    };
  }

  // accept_all_ready — 高置信度精确匹配
  if (
    (lower.includes("确认") && lower.includes("全部")) ||
    (lower.includes("确认") && lower.includes("所有")) ||
    lower.includes("accept all") ||
    lower.includes("batch accept") ||
    lower.includes("accept all ready") ||
    lower.includes("批量接受") ||
    lower.includes("批量确认") ||
    lower.includes("一键确认") ||
    lower.includes("confirm all") ||
    lower.includes("confirmar todo") ||
    lower.includes("confirmar todos") ||
    lower.includes("aceptar todo") ||
    lower.includes("aceptar todos") ||
    lower.includes("confirmer tout") ||
    lower.includes("tout accepter")
  ) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("accept_all_ready", "all"),
    };
  }

  // fetch_quotes — 高置信度精确匹配
  if (
    lower.includes("全量刷新") ||
    (lower.includes("刷新") &&
      (lower.includes("报价") || lower.includes("线路"))) ||
    lower.includes("refresh quotes") ||
    lower.includes("refresh shipping") ||
    lower.includes("fetch quotes") ||
    lower.includes("fetch shipping") ||
    lower.includes("update quotes") ||
    lower.includes("actualizar cotizaciones") ||
    lower.includes("refrescar cotizaciones") ||
    lower.includes("actualiser les devis") ||
    (lower.includes("拉取") &&
      (lower.includes("报价") || lower.includes("线路")))
  ) {
    return {
      confidence: hasNegation ? "medium" : "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  // start_estimate — 高置信度精确匹配
  if (
    lower.includes("一键预估") ||
    lower.includes("智能预估") ||
    lower.includes("开始预估") ||
    lower.includes("开始智能预估") ||
    lower.includes("运费预估") ||
    lower.includes("estimate shipping") ||
    lower.includes("smart estimate") ||
    lower.includes("start estimate") ||
    lower.includes("run estimate") ||
    lower.includes("estimación inteligente") ||
    lower.includes("estimar envío") ||
    lower.includes("estimation intelligente") ||
    lower.includes("estimer les frais")
  ) {
    return {
      confidence: hasNegation ? "medium" : "high",
      source: "rules",
      draft: buildDraft("start_estimate", "all"),
    };
  }

  // open_template（合并了 apply_template）
  if (
    (lower.includes("模板") &&
      (lower.includes("配置") ||
        lower.includes("调整") ||
        lower.includes("应用") ||
        lower.includes("打开"))) ||
    (lower.includes("template") &&
      (lower.includes("config") ||
        lower.includes("adjust") ||
        lower.includes("settings") ||
        lower.includes("apply") ||
        lower.includes("open"))) ||
    (lower.includes("plantilla") &&
      (lower.includes("config") ||
        lower.includes("abrir") ||
        lower.includes("ajust"))) ||
    (lower.includes("modèle") && lower.includes("config"))
  ) {
    return {
      confidence: hasNegation ? "medium" : "high",
      source: "rules",
      draft: buildDraft("open_template", "none"),
    };
  }

  // focus_status (合并了 focus_issues)
  // "查看问题"/"查看异常" → set_filter issues
  if (
    (lower.includes("查看") &&
      (lower.includes("问题") || lower.includes("异常"))) ||
    (lower.includes("view") && lower.includes("issues")) ||
    (lower.includes("show") && lower.includes("issues")) ||
    (lower.includes("ver") &&
      (lower.includes("problemas") || lower.includes("incidencias"))) ||
    (lower.includes("voir") && lower.includes("problèmes")) ||
    (lower.includes("只看") && lower.includes("异常")) ||
    (lower.includes("only") && lower.includes("issues"))
  ) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_status", "all", { listFilter: "issues" }),
    };
  }

  if (
    (lower.includes("查看") && lower.includes("待确认")) ||
    lower.includes("pending confirm") ||
    lower.includes("pending_confirm")
  ) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_status", "all", {
        listFilter: "pending_confirm",
      }),
    };
  }

  if (
    (lower.includes("查看") && lower.includes("待报价")) ||
    lower.includes("pending quote") ||
    lower.includes("pending_quote")
  ) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_status", "all", { listFilter: "pending_quote" }),
    };
  }

  // 通用的状态关键词匹配 — medium 置信度，交 LLM 复核
  const statusKeywords: Record<string, LogisticsDecisionStatus> = {
    pending_sku: "pending_sku",
    待绑: "pending_sku",
    未绑: "pending_sku",
    unbound: "pending_sku",
    "sin vincular": "pending_sku",
    pending_postal_meta: "pending_postal_meta",
    ready_for_quote: "ready_for_quote",
    confirmed: "confirmed",
    restricted: "restricted",
    needs_review: "needs_review",
    "needs review": "needs_review",
    "needs attention": "needs_review",
  };

  for (const [keyword, status] of Object.entries(statusKeywords)) {
    if (lower.includes(keyword)) {
      return {
        confidence: "medium",
        source: "rules",
        draft: buildDraft("focus_status", "all", { status }),
      };
    }
  }

  return {
    confidence: "none",
    source: "default",
    clarify: "logisticsAgent.errCannotUnderstand",
  };
}

function buildDraft(
  intent: LogisticsCommandDraft["intent"],
  targetScope: LogisticsCommandTargetScope,
  params: Partial<LogisticsCommandDraft["params"]> = {},
  productId?: string
): LogisticsCommandDraft {
  const requiresConfirm = ["accept_all_ready"].includes(intent);
  return {
    intent,
    targetScope,
    productId,
    params: {
      filterMode: "all",
      ...params,
    },
    confirmationRequired: requiresConfirm,
  };
}

function wantsExplainQuote(lower: string): boolean {
  return (
    (/(解释|说明|为何|为什么|怎么看)/.test(lower) &&
      /(报价|运费|线路|line|quote|shipping|rate)/i.test(lower)) ||
    /explain\s+(the\s+)?(quote|shipping|rate|freight)/i.test(lower) ||
    /(explicar|explica)\s+(la\s+)?(cotización|envío|tarifa)/i.test(lower) ||
    /(expliquer|pourquoi).*(devis|frais|livraison)/i.test(lower)
  );
}

function extractProductTitleHint(text: string): string | undefined {
  const book = text.match(/[「《]([^》」]+)[》」]/);
  if (book?.[1]?.trim()) return book[1].trim();
  const quoted = text.match(/["“]([^"”]+)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim();
  const forProduct = text.match(
    /(?:解释|说明|explain|explicar|expliquer)[^「」"“]{0,12}[「《"]([^》」"”]+)[》」"]?/i
  );
  if (forProduct?.[1]?.trim()) return forProduct[1].trim();
  return undefined;
}

export function parseLogisticsCommandDraft(raw: string): LogisticsCommandDraft | null {
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
    if (!LOGISTICS_COMMAND_SET.has(obj.intent as LogisticsCommandId)) return null;
    const params =
      obj.params && typeof obj.params === "object"
        ? (obj.params as LogisticsCommandParams)
        : {};
    if (
      typeof (params as { productTitleHint?: unknown }).productTitleHint ===
      "string"
    ) {
      params.productTitleHint = (
        params as { productTitleHint: string }
      ).productTitleHint.trim();
    }
    const targetScope =
      obj.targetScope === "explicit" ||
      obj.targetScope === "current" ||
      obj.targetScope === "none" ||
      obj.targetScope === "all"
        ? obj.targetScope
        : "current";
    return {
      intent: obj.intent as LogisticsCommandId,
      targetScope,
      productId: typeof obj.productId === "string" ? obj.productId : undefined,
      params,
      confirmationRequired:
        typeof obj.confirmationRequired === "boolean"
          ? obj.confirmationRequired
          : (obj.intent as LogisticsCommandId) === "accept_all_ready",
    };
  } catch {
    return null;
  }
}

export { normalizeLogisticsCommandDraft } from "./llm-classify-calibration";

export function buildLogisticsClassifyPrompt(
  t: (key: string) => string,
  text: string,
  context: LogisticsCommandClassifyContext | null,
  responseLanguageRule?: string
): string {
  const contextLines: string[] = [];
  if (context) {
    if (context.focusProductTitle) {
      contextLines.push(`${t("agentLogistics.promptFocusProduct")}: ${context.focusProductTitle}`);
    }
    if (context.currentFilter) {
      contextLines.push(`${t("agentLogistics.promptCurrentFilter")}: ${context.currentFilter}`);
    }
    if (context.readyAcceptCount > 0) {
      contextLines.push(`${t("agentLogistics.promptReadyAcceptCount")}: ${context.readyAcceptCount}`);
    }
    if (context.pendingCount > 0) {
      contextLines.push(`${t("agentLogistics.promptPendingCount")}: ${context.pendingCount}`);
    }
    if (context.highRiskTypes.length > 0) {
      contextLines.push(`${t("agentLogistics.promptHighRiskTypes")}: ${context.highRiskTypes.join(", ")}`);
    }
  }

  const commandList = `
${t("agentLogistics.promptAvailableCommands")}:
- accept_all_ready: ${t("agentLogistics.promptCmdAcceptAllReady")}
- start_estimate: ${t("agentLogistics.promptCmdStartEstimate")}
- fetch_quotes: ${t("agentLogistics.promptCmdFetchQuotes")}
- open_template: ${t("agentLogistics.promptCmdOpenTemplate")}
- focus_status: ${t("agentLogistics.promptCmdFocusStatus")}
- explain_quote: ${t("agentLogistics.promptCmdExplainQuote")}
`;

  return `
${t("agentLogistics.promptRole")}

${t("agentLogistics.promptContext")}:
${contextLines.length > 0 ? contextLines.join("\n") : t("agentLogistics.promptNoContext")}

${t("agentLogistics.promptUserInput")}: ${text}

${commandList}

${t("agentLogistics.promptInstruction")}
${responseLanguageRule ? `${responseLanguageRule}\n` : "Understand user input in any language.\n"}
${t("agentLogistics.promptJsonFormat")}
${t("agentLogistics.promptRules")}
`;
}
