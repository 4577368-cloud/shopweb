export type LogisticsCommandId =
  | "accept_all_ready"
  | "fetch_quotes"
  | "open_template"
  | "focus_issues"
  | "focus_status"
  | "explain_quote"
  | "apply_template";

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
  status?: LogisticsDecisionStatus;
  productId?: string;
  skuId?: string;
  templateId?: string;
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
  confidence: "high" | "none";
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
      type: "apply_template";
      templateId: string;
    };

export const LOGISTICS_COMMAND_IDS: LogisticsCommandId[] = [
  "accept_all_ready",
  "fetch_quotes",
  "open_template",
  "focus_issues",
  "focus_status",
  "explain_quote",
  "apply_template",
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
    label: "批量确认",
    description: "批量接受 AI 推荐的物流方案",
    defaultConfirmation: true,
    sensitivity: "high",
  },
  {
    id: "fetch_quotes",
    label: "刷新报价",
    description: "重新拉取线路报价",
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
    id: "focus_issues",
    label: "查看问题",
    description: "只显示需要人工确认的问题项",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "focus_status",
    label: "聚焦状态",
    description: "聚焦特定决策状态的商品",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "explain_quote",
    label: "解释报价",
    description: "解释某个规格的物流报价详情",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "apply_template",
    label: "应用模板",
    description: "应用指定的物流模板",
    defaultConfirmation: false,
    sensitivity: "low",
  },
];