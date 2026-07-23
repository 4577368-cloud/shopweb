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

export function classifyLogisticsCommandByRules(
  text: string
): LogisticsCommandClassifyResult {
  const lower = text.toLowerCase().trim();

  if (lower.includes("确认") && lower.includes("全部") || lower.includes("accept all")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("accept_all_ready", "all"),
    };
  }

  if (lower.includes("批量接受") || lower.includes("批量确认") || lower.includes("一键确认") || lower.includes("batch accept") || lower.includes("accept all ready")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("accept_all_ready", "all"),
    };
  }

  if (lower.includes("一键预估") || lower.includes("运费预估") || lower.includes("estimate shipping") || lower.includes("get quotes")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("刷新") && (lower.includes("报价") || lower.includes("线路")) || lower.includes("refresh quotes") || lower.includes("refresh shipping")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("拉取") && (lower.includes("报价") || lower.includes("线路")) || lower.includes("fetch quotes") || lower.includes("fetch shipping")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("模板") && (lower.includes("配置") || lower.includes("调整")) || lower.includes("template") && (lower.includes("config") || lower.includes("adjust") || lower.includes("settings"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("open_template", "none"),
    };
  }

  if (lower.includes("查看") && (lower.includes("问题") || lower.includes("待确认")) || lower.includes("view") && (lower.includes("issues") || lower.includes("pending"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_issues", "all", { filterMode: "issues" }),
    };
  }

  if (lower.includes("只看") && lower.includes("异常") || lower.includes("only") && lower.includes("issues")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_issues", "all", { filterMode: "issues" }),
    };
  }

  if (lower.includes("应用") && lower.includes("模板") || lower.includes("apply") && lower.includes("template")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("apply_template", "all"),
    };
  }

  if (lower.includes("打开") && lower.includes("模板") || lower.includes("open") && lower.includes("template")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("apply_template", "none"),
    };
  }

  const statusMap: Record<string, LogisticsDecisionStatus> = {
    pending_sku: "pending_sku",
    pending_postal_meta: "pending_postal_meta",
    ready_for_quote: "ready_for_quote",
    confirmed: "confirmed",
    restricted: "restricted",
    needs_review: "needs_review",
  };

  for (const [keyword, status] of Object.entries(statusMap)) {
    if (lower.includes(keyword)) {
      return {
        confidence: "high",
        source: "rules",
        draft: buildDraft("focus_status", "all", { status }),
      };
    }
  }

  return {
    confidence: "none",
    source: "default",
    clarify: "无法理解您的命令，请试试：运费预估、批量接受、调整模板、查看问题",
  };
}

function buildDraft(
  intent: LogisticsCommandDraft["intent"],
  targetScope: LogisticsCommandTargetScope,
  params: Partial<LogisticsCommandDraft["params"]> = {}
): LogisticsCommandDraft {
  const requiresConfirm = ["accept_all_ready"].includes(intent);
  return {
    intent,
    targetScope,
    params: {
      filterMode: "all",
      ...params,
    },
    confirmationRequired: requiresConfirm,
  };
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
    const targetScope =
      obj.targetScope === "explicit" || obj.targetScope === "current" || obj.targetScope === "none" || obj.targetScope === "all"
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
- fetch_quotes: ${t("agentLogistics.promptCmdFetchQuotes")}
- open_template: ${t("agentLogistics.promptCmdOpenTemplate")}
- focus_issues: ${t("agentLogistics.promptCmdFocusIssues")}
- focus_status: ${t("agentLogistics.promptCmdFocusStatus")}
- apply_template: ${t("agentLogistics.promptCmdApplyTemplate")}
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