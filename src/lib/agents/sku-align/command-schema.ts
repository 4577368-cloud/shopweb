export type SkuCommandId =
  | "open_filter"
  | "focus_product"
  | "batch_confirm_pending"
  | "rerun_auto_align"
  | "explain_sku_match"
  | "open_sku_detail";

export type SkuCommandTargetScope = "current" | "explicit" | "none" | "all";

export type SkuFilterMode = "all" | "fully_linked" | "partially_linked";

export interface SkuCommandParams {
  filterMode?: SkuFilterMode;
  productId?: string;
  productTitleHint?: string;
  batchFilter?: "all" | "partially_linked";
  batchLimit?: number;
  batchProductIds?: string[];
}

export interface SkuCommandDraft {
  intent: SkuCommandId;
  targetScope: SkuCommandTargetScope;
  productId?: string;
  params: SkuCommandParams;
  confirmationRequired: boolean;
}

export type SkuCommandClassifySource = "rules" | "llm" | "default";

export interface SkuCommandClassifyResult {
  confidence: "high" | "none";
  source: SkuCommandClassifySource;
  draft?: SkuCommandDraft;
  clarify?: string;
}

export interface SkuCommandPlan {
  draft: SkuCommandDraft;
  operation: string;
  targetLabel: string;
  detailLines: string[];
  executable: boolean;
  clarify?: string;
}

export type SkuCommandExecution =
  | { type: "agent_action"; action: import("@/lib/agents/types").AgentSuggestedAction }
  | {
      type: "batch_confirm_pending";
      productIds: string[];
      totalCount: number;
      filterLabel: string;
    }
  | {
      type: "rerun_auto_align";
      productId?: string;
    }
  | {
      type: "set_filter";
      filterMode: SkuFilterMode;
    }
  | {
      type: "focus_product";
      productId: string;
    };

export const SKU_COMMAND_IDS: SkuCommandId[] = [
  "open_filter",
  "focus_product",
  "batch_confirm_pending",
  "rerun_auto_align",
  "explain_sku_match",
  "open_sku_detail",
];

export const SKU_COMMAND_SET = new Set<SkuCommandId>(SKU_COMMAND_IDS);

export type CommandSensitivity = "high" | "low";

export const SKU_COMMAND_DEFS: {
  id: SkuCommandId;
  label: string;
  description: string;
  defaultConfirmation: boolean;
  sensitivity: CommandSensitivity;
}[] = [
  {
    id: "open_filter",
    label: "切换筛选",
    description: "切换商品列表筛选，如全部关联、部分关联",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "focus_product",
    label: "聚焦商品",
    description: "在列表中定位并高亮某个商品",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "batch_confirm_pending",
    label: "批量确认",
    description: "批量接受 AI 建议的 SKU 匹配，确认后自动绑定",
    defaultConfirmation: true,
    sensitivity: "high",
  },
  {
    id: "rerun_auto_align",
    label: "重新对齐",
    description: "重新运行自动对齐，为未匹配的变体查找 SKU 候选",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "explain_sku_match",
    label: "解释匹配",
    description: "解释某个变体的 SKU 匹配依据和置信度",
    defaultConfirmation: false,
    sensitivity: "low",
  },
  {
    id: "open_sku_detail",
    label: "打开详情",
    description: "打开商品的 SKU 映射工作台",
    defaultConfirmation: false,
    sensitivity: "low",
  },
];