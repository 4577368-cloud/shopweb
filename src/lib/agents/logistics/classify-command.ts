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

  if (lower.includes("确认") && lower.includes("全部")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("accept_all_ready", "all"),
    };
  }

  if (lower.includes("批量接受") || lower.includes("批量确认") || lower.includes("一键确认")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("accept_all_ready", "all"),
    };
  }

  if (lower.includes("一键预估") || lower.includes("运费预估")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("刷新") && (lower.includes("报价") || lower.includes("线路"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("拉取") && (lower.includes("报价") || lower.includes("线路"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("fetch_quotes", "all"),
    };
  }

  if (lower.includes("模板") && (lower.includes("配置") || lower.includes("调整"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("open_template", "none"),
    };
  }

  if (lower.includes("查看") && (lower.includes("问题") || lower.includes("待确认"))) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_issues", "all", { filterMode: "issues" }),
    };
  }

  if (lower.includes("只看") && lower.includes("异常")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("focus_issues", "all", { filterMode: "issues" }),
    };
  }

  if (lower.includes("解释") && lower.includes("报价")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("explain_quote", "current"),
    };
  }

  if (lower.includes("应用") && lower.includes("模板")) {
    return {
      confidence: "high",
      source: "rules",
      draft: buildDraft("apply_template", "all"),
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
  text: string,
  context: LogisticsCommandClassifyContext | null
): string {
  const contextLines: string[] = [];
  if (context) {
    if (context.focusProductTitle) {
      contextLines.push(`当前聚焦商品: ${context.focusProductTitle}`);
    }
    if (context.currentFilter) {
      contextLines.push(`当前筛选: ${context.currentFilter}`);
    }
    if (context.readyAcceptCount > 0) {
      contextLines.push(`可确认数量: ${context.readyAcceptCount}`);
    }
    if (context.pendingCount > 0) {
      contextLines.push(`待处理数量: ${context.pendingCount}`);
    }
    if (context.highRiskTypes.length > 0) {
      contextLines.push(`高风险类型: ${context.highRiskTypes.join(", ")}`);
    }
  }

  const commandList = `
可用命令:
- accept_all_ready: 批量接受方案（已有线路报价的 SKU）
- fetch_quotes: 运费预估 / 刷新线路报价
- open_template: 打开物流模板配置
- focus_issues: 查看需要人工确认的问题项
- focus_status: 聚焦特定决策状态的商品
- explain_quote: 解释某个规格的物流报价详情
- apply_template: 应用指定的物流模板
`;

  return `
你是一个物流智能助手，需要分析用户的自然语言输入并生成结构化命令。

当前上下文:
${contextLines.length > 0 ? contextLines.join("\n") : "无"}

用户输入: ${text}

${commandList}

请分析用户意图，选择最合适的命令。
返回格式必须是严格的JSON:
{
  "confidence": "high" | "none",
  "source": "llm",
  "draft": {
    "intent": "命令ID",
    "targetScope": "current" | "explicit" | "none" | "all",
    "params": {
      "filterMode": "all" | "issues",
      "status": "pending_sku" | "pending_postal_meta" | "ready_for_quote" | "confirmed" | "restricted" | "needs_review"
    },
    "confirmationRequired": true | false
  },
  "clarify": "如果无法理解，填写澄清问题"
}

规则:
- 如果用户输入明确匹配某个命令，confidence设为"high"
- 如果用户询问报价详情但没有指定具体商品，targetScope设为"current"（假设用户指的是当前聚焦的商品）
- accept_all_ready 需要确认（confirmationRequired: true）
- 其他命令不需要确认（confirmationRequired: false）
`;
}