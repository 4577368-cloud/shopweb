export type SkuCommandId =
  | "open_filter"
  | "focus_product"
  | "batch_confirm_pending"
  | "rerun_auto_align"
  | "explain_sku_match"
  | "open_sku_detail"
  | "bind_variant"
  | "unbind"
  | "change_source"
  | "add_supplement_source"
  | "ignore_match"
  | "set_manual"
  | "tune_threshold";

export type SkuCommandTargetScope = "current" | "explicit" | "none" | "all";

export type SkuFilterMode = "all" | "fully_linked" | "partially_linked";

export interface SkuCommandParams {
  filterMode?: SkuFilterMode;
  productId?: string;
  productTitleHint?: string;
  batchFilter?: "all" | "partially_linked";
  batchLimit?: number;
  batchProductIds?: string[];
  // Phase 2 slot params (natural-language extraction)
  variantSpec?: string; // 规格描述，如 "红色 S 码" / "red S size"
  variantIndex?: number; // 1-based，从 "第 N 个变体" 解析
  sourceRef?: string; // 货源指代：offerId / "第二个货源" / 货源标题片段
  sourceRole?: "primary" | "supplement";
  reason?: string; // 手动绑定 / 忽略原因
  threshold?: number; // 0..1，tune_threshold
}

export interface SkuCommandDraft {
  intent: SkuCommandId;
  targetScope: SkuCommandTargetScope;
  productId?: string;
  params: SkuCommandParams;
  confirmationRequired: boolean;
}

export type SkuCommandClassifySource = "rules" | "llm" | "default";

/** A single plausible intent offered back when the input is ambiguous. */
export interface SkuCommandClarifyCandidate {
  intent: SkuCommandId;
  /** Optional label from the model; the UI overrides with a translated label. */
  label?: string;
}

/** Structured clarification returned when an instruction is ambiguous. */
export interface SkuCommandClarify {
  message: string;
  candidates?: SkuCommandClarifyCandidate[];
}

export interface SkuCommandClassifyResult {
  confidence: "high" | "none";
  source: SkuCommandClassifySource;
  draft?: SkuCommandDraft;
  /** Multi-step command (e.g. "show partially linked, then batch confirm"). */
  steps?: SkuCommandDraft[];
  clarify?: string | SkuCommandClarify;
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
  "bind_variant",
  "unbind",
  "change_source",
  "add_supplement_source",
  "ignore_match",
  "set_manual",
  "tune_threshold",
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
  {
    id: "bind_variant",
    label: "绑定变体到货源",
    description: "将指定变体绑定到某个 1688 货源（在工作台完成货源选择）",
    defaultConfirmation: false,
    sensitivity: "high",
  },
  {
    id: "unbind",
    label: "解除绑定",
    description: "解除某个变体当前的 SKU 绑定",
    defaultConfirmation: true,
    sensitivity: "high",
  },
  {
    id: "change_source",
    label: "更换货源",
    description: "为变体更换主货源（在工作台完成货源选择）",
    defaultConfirmation: false,
    sensitivity: "high",
  },
  {
    id: "add_supplement_source",
    label: "添加补充货源",
    description: "为商品增加补充货源（在工作台完成货源选择）",
    defaultConfirmation: false,
    sensitivity: "high",
  },
  {
    id: "ignore_match",
    label: "忽略匹配",
    description: "将某个待确认匹配标记为忽略，暂不处理",
    defaultConfirmation: false,
    sensitivity: "high",
  },
  {
    id: "set_manual",
    label: "手动绑定",
    description: "人工指定变体绑定的货源（在工作台完成货源选择）",
    defaultConfirmation: false,
    sensitivity: "high",
  },
  {
    id: "tune_threshold",
    label: "调整匹配阈值",
    description: "打开匹配设置以调整自动对齐的置信度阈值",
    defaultConfirmation: false,
    sensitivity: "low",
  },
];

/** Build a sensible default draft for an intent (used by the clarification loop). */
export function buildSkuDraftFromIntent(
  intent: SkuCommandId,
  opts?: {
    targetScope?: SkuCommandTargetScope;
    productId?: string;
    params?: SkuCommandParams;
  }
): SkuCommandDraft {
  const def = SKU_COMMAND_DEFS.find((d) => d.id === intent);
  return {
    intent,
    targetScope: opts?.targetScope ?? "current",
    productId: opts?.productId,
    params: opts?.params ?? {},
    confirmationRequired:
      def?.defaultConfirmation ??
      intent === "batch_confirm_pending",
  };
}