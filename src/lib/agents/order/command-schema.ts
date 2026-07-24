// 订单中心 Copilot 命令范式（Phase 6）。
// 复用 sku/products command-schema 的结构（controlled NL commands，非开放聊天）：
//   CommandId 联合 → Params → Draft → Plan → Execution（判别联合）+ COMMAND_DEFS。
// 但分类走「确定性规则」（见 classify-command.ts），不调 LLM：订单域当前可落地的都是
// 列表操作（切 Tab / 搜索 / 重置筛选 / 设异常 / 设时间范围 / 选中并跳 Shopify / 导出 CSV / 统计），
// 这些操作可预测、零成本、无需模型，且全部作用于我们真实拥有的订单数据，避免「AI 感」空转。

import type { OrderStatus, OrderSummary } from "@/lib/order/types";
import type { ExceptionFilter, TimeRange } from "@/components/order/order-filter-bar";

export type OrderTabKey = OrderStatus | "all";

export type OrderCommandId =
  | "set_tab"
  | "search"
  | "reset_filters"
  | "set_exception"
  | "set_time_range"
  | "focus_order"
  | "open_shopify"
  | "export_csv"
  | "summary";

export interface OrderCommandParams {
  /** set_tab：目标状态 Tab */
  tab?: OrderTabKey;
  /** search / focus_order / open_shopify：查询词或订单号片段 */
  query?: string;
  /** set_exception：异常筛选 */
  exception?: ExceptionFilter;
  /** set_time_range：时间范围 */
  timeRange?: TimeRange;
  /** focus_order / open_shopify：从查询中提取的订单号片段（含 # 或不带） */
  orderFragment?: string;
}

export type OrderCommandTargetScope = "none" | "explicit";

export interface OrderCommandDraft {
  intent: OrderCommandId;
  targetScope: OrderCommandTargetScope;
  params: OrderCommandParams;
  confirmationRequired: boolean;
}

export type OrderCommandClassifySource = "rules";

export interface OrderCommandClarifyCandidate {
  intent: OrderCommandId;
  /** 展示用标签（已由调用方本地化） */
  label: string;
}

export interface OrderCommandClassifyResult {
  confidence: "high" | "none";
  source: OrderCommandClassifySource;
  draft?: OrderCommandDraft;
  clarify?: string | { message: string; candidates?: OrderCommandClarifyCandidate[] };
}

export interface OrderCommandPlan {
  draft: OrderCommandDraft;
  operation: string;
  targetLabel: string;
  detailLines: string[];
  executable: boolean;
  clarify?: string;
}

export type OrderCommandExecution =
  | { type: "set_tab"; tab: OrderTabKey }
  | { type: "search"; query: string }
  | { type: "reset_filters" }
  | { type: "set_exception"; exception: ExceptionFilter }
  | { type: "set_time_range"; timeRange: TimeRange }
  | { type: "focus_order"; orderId: string }
  | { type: "open_shopify"; orderId: string; url: string }
  | { type: "export_csv"; orders: OrderSummary[] }
  | { type: "summary"; text: string };

export type CommandSensitivity = "high" | "low";

export const ORDER_COMMAND_IDS: OrderCommandId[] = [
  "set_tab",
  "search",
  "reset_filters",
  "set_exception",
  "set_time_range",
  "focus_order",
  "open_shopify",
  "export_csv",
  "summary",
];

export const ORDER_COMMAND_SET = new Set<OrderCommandId>(ORDER_COMMAND_IDS);

/** 指令定义：标签/描述/i18n 操作键/确认/敏感度。描述用于澄清候选展示。 */
export const ORDER_COMMAND_DEFS: {
  id: OrderCommandId;
  /** i18n 键前缀：order.agent.op.<id> 取操作名；order.agent.cmd.<id> 取描述 */
  i18nKey: string;
  defaultConfirmation: boolean;
  sensitivity: CommandSensitivity;
}[] = [
  { id: "set_tab", i18nKey: "setTab", defaultConfirmation: false, sensitivity: "low" },
  { id: "search", i18nKey: "search", defaultConfirmation: false, sensitivity: "low" },
  { id: "reset_filters", i18nKey: "resetFilters", defaultConfirmation: false, sensitivity: "low" },
  { id: "set_exception", i18nKey: "setException", defaultConfirmation: false, sensitivity: "low" },
  { id: "set_time_range", i18nKey: "setTimeRange", defaultConfirmation: false, sensitivity: "low" },
  { id: "focus_order", i18nKey: "focusOrder", defaultConfirmation: false, sensitivity: "low" },
  { id: "open_shopify", i18nKey: "openShopify", defaultConfirmation: false, sensitivity: "low" },
  { id: "export_csv", i18nKey: "exportCsv", defaultConfirmation: false, sensitivity: "low" },
  { id: "summary", i18nKey: "summary", defaultConfirmation: false, sensitivity: "low" },
];

export function buildOrderDraftFromIntent(
  intent: OrderCommandId,
  params: OrderCommandParams = {}
): OrderCommandDraft {
  const def = ORDER_COMMAND_DEFS.find((d) => d.id === intent);
  return {
    intent,
    targetScope: params.query || params.tab || params.exception || params.timeRange || params.orderFragment
      ? "explicit"
      : "none",
    params,
    confirmationRequired: def?.defaultConfirmation ?? false,
  };
}

export function orderCommandRequiresConfirmation(plan: OrderCommandPlan): boolean {
  return plan.draft.confirmationRequired;
}

export function orderCommandOperationLabel(
  opKey: (id: OrderCommandId) => string,
  intent: OrderCommandId
): string {
  return opKey(intent);
}
