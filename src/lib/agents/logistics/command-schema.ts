export type LogisticsCommandId =
  | "accept_all_ready"
  | "start_estimate"
  | "fetch_quotes"
  | "open_template"
  | "focus_status"
  | "explain_quote";

export type LogisticsCommandTargetScope = "current" | "explicit" | "none" | "all";

export type LogisticsFilterMode = "all" | "issues";

export type LogisticsDecisionStatus =
  | "pending_sku"
  | "pending_postal_meta"
  | "ready_for_quote"
  | "confirmed"
  | "restricted"
  | "needs_review";

export interface LogisticsCommandParams {
  filterMode?: LogisticsFilterMode;
  /** List tab filter when focus_status targets a bucket, not a decision status. */
  listFilter?: string;
  status?: LogisticsDecisionStatus;
  productId?: string;
  skuId?: string;
  templateId?: string;
  exceptionType?: string;
  needsMeasure?: boolean;
  quoteStatus?: "quoted" | "unquoted";
  /** Substring or product title for explain_quote (e.g. 拖鞋). */
  productTitleHint?: string;
}

export interface LogisticsCommandDraft {
  intent: LogisticsCommandId;
  targetScope: LogisticsCommandTargetScope;
  productId?: string;
  params: LogisticsCommandParams;
  confirmationRequired: boolean;
}

export type LogisticsCommandClassifySource = "rules" | "llm" | "default";

export interface LogisticsCommandClassifyResult {
  confidence: "high" | "medium" | "none";
  source: LogisticsCommandClassifySource;
  draft?: LogisticsCommandDraft;
  clarify?: string;
}

export interface LogisticsCommandPlan {
  draft: LogisticsCommandDraft;
  operation: string;
  targetLabel: string;
  detailLines: string[];
  executable: boolean;
  clarify?: string;
}

export type LogisticsCommandExecution =
  | { type: "agent_action"; action: import("@/lib/agents/types").AgentSuggestedAction }
  | {
      type: "accept_all_ready";
      variantIds: string[];
      totalCount: number;
    }
  | {
      type: "start_estimate";
    }
  | {
      type: "fetch_quotes";
      variantIds?: string[];
    }
  | {
      type: "open_template";
    }
  | {
      type: "focus_status";
      status: LogisticsDecisionStatus;
    }
  | {
      type: "set_filter";
      /** Agent legacy id (`issues`) or current tab id — normalized on the page. */
      filterMode: string;
    }
  | {
      type: "explain_quote";
      productId: string;
      lines: string[];
    };

export const LOGISTICS_COMMAND_IDS: LogisticsCommandId[] = [
  "accept_all_ready",
  "start_estimate",
  "fetch_quotes",
  "open_template",
  "focus_status",
  "explain_quote",
];

export const LOGISTICS_COMMAND_SET = new Set<LogisticsCommandId>(LOGISTICS_COMMAND_IDS);

export type CommandSensitivity = "high" | "low";

export const LOGISTICS_COMMAND_DEFS: {
  id: LogisticsCommandId;
  label: string;
  description: string;
  defaultConfirmation: boolean;
  sensitivity: CommandSensitivity;
}[] = [
  {
    id: "accept_all_ready",
    label: "批量接受",
    description: "批量接受已有线路报价的 AI 推荐方案",
    defaultConfirmation: true,
    sensitivity: "high",
  },
  {
    id: "start_estimate",
    label: "智能预估",
    description: "启动智能预估管线（并行报价 + 普货自动确认）",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "fetch_quotes",
    label: "刷新报价",
    description: "全量刷新线路报价，不启动智能预估管线",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "open_template",
    label: "打开模板",
    description: "打开物流模板配置抽屉",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "focus_status",
    label: "聚焦状态",
    description: "聚焦特定决策状态或问题项",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "explain_quote",
    label: "解释报价",
    description: "解释指定商品的线路报价与依据（只读）",
    defaultConfirmation: false,
    sensitivity: "low",
  },
];