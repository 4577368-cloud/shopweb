import type {
  LogisticsCommandDraft,
  LogisticsCommandExecution,
  LogisticsCommandPlan,
  LogisticsFilterMode,
  LogisticsDecisionStatus,
} from "./command-schema";

const FILTER_LABELS: Record<LogisticsFilterMode, string> = {
  all: "全部商品",
  issues: "待处理项",
};

const STATUS_LABELS: Record<LogisticsDecisionStatus, string> = {
  pending_sku: "等待SKU",
  pending_postal_meta: "等待邮限",
  ready_for_quote: "可报价",
  confirmed: "已确认",
  restricted: "受限",
  needs_review: "需审核",
};

export interface LogisticsPageContext {
  focusProductTitle: string | null;
  focusProductId: string | null;
  currentFilter: string | null;
  readyAcceptCount: number;
  pendingCount: number;
  confirmedCount: number;
  highRiskTypes: string[];
  readyVariantIds: string[];
}

function needsFocusProduct(intent: LogisticsCommandDraft["intent"]): boolean {
  return intent === "explain_quote";
}

export function planLogisticsCommand(
  draft: LogisticsCommandDraft,
  ctx: LogisticsPageContext
): LogisticsCommandPlan {
  const focusTitle =
    ctx.focusProductTitle ??
    (ctx.focusProductId ? `商品 ${ctx.focusProductId.slice(-8)}` : "未选中商品");

  switch (draft.intent) {
    case "accept_all_ready": {
      const totalCount = ctx.readyAcceptCount;
      if (totalCount === 0) {
        return {
          draft,
          operation: "批量接受方案",
          targetLabel: "待确认方案",
          detailLines: [],
          executable: false,
          clarify: "当前没有待确认的报价方案，请先完成运费预估。",
        };
      }
      return {
        draft: {
          ...draft,
          targetScope: "all",
          confirmationRequired: true,
          params: {
            ...draft.params,
          },
        },
        operation: "批量接受方案",
        targetLabel: `待确认方案 · ${totalCount} 个`,
        detailLines: [
          `将接受 ${totalCount} 个已有线路报价的 SKU 方案`,
          "采用 AI 推荐线路，标记为已确认",
        ],
        executable: true,
      };
    }
    case "fetch_quotes": {
      return {
        draft: {
          ...draft,
          targetScope: "all",
        },
        operation: "运费预估",
        targetLabel: "全部可报价项",
        detailLines: [
          "将从 Tangbuy 获取各规格的线路运费",
          "更新推荐线路与运费估算",
        ],
        executable: true,
      };
    }
    case "open_template": {
      return {
        draft: {
          ...draft,
          targetScope: "none",
        },
        operation: "打开物流模板",
        targetLabel: "物流模板配置",
        detailLines: [
          "将打开物流模板配置抽屉",
          "可调整包装方式、时效偏好、销售市场等",
        ],
        executable: true,
      };
    }
    case "focus_issues": {
      if (ctx.pendingCount === 0) {
        return {
          draft,
          operation: "查看问题项",
          targetLabel: "待处理项",
          detailLines: [],
          executable: false,
          clarify: "当前没有需要人工确认的问题项。",
        };
      }
      return {
        draft: {
          ...draft,
          targetScope: "all",
          params: {
            ...draft.params,
            filterMode: "issues",
          },
        },
        operation: "查看问题项",
        targetLabel: `待处理项 · ${ctx.pendingCount} 个`,
        detailLines: [`将筛选出 ${ctx.pendingCount} 个需要人工确认的异常项`],
        executable: true,
      };
    }
    case "focus_status": {
      const status = draft.params.status ?? "needs_review";
      return {
        draft: {
          ...draft,
          targetScope: "all",
          params: {
            ...draft.params,
            status,
          },
        },
        operation: "聚焦状态",
        targetLabel: STATUS_LABELS[status],
        detailLines: [`将筛选出状态为「${STATUS_LABELS[status]}」的商品`],
        executable: true,
      };
    }
    case "explain_quote": {
      if (!ctx.focusProductId) {
        return {
          draft,
          operation: "解释报价",
          targetLabel: focusTitle,
          detailLines: [],
          executable: false,
          clarify:
            "请先在列表中点选商品，或在命令里写出商品名（如：解释「拖鞋」的报价）。",
        };
      }
      return {
        draft: { ...draft, productId: ctx.focusProductId },
        operation: "解释报价",
        targetLabel: focusTitle,
        detailLines: [`将说明「${focusTitle}」的物流报价详情和推荐依据`],
        executable: true,
      };
    }
    case "apply_template": {
      return {
        draft: {
          ...draft,
          targetScope: "all",
        },
        operation: "应用物流模板",
        targetLabel: "当前模板",
        detailLines: ["将应用当前选中的物流模板配置"],
        executable: true,
      };
    }
    default:
      return {
        draft,
        operation: "执行命令",
        targetLabel: focusTitle,
        detailLines: [],
        executable: false,
        clarify: "该命令暂未实现",
      };
  }
}

export function commandRequiresConfirmation(plan: LogisticsCommandPlan): boolean {
  return (
    plan.draft.confirmationRequired ||
    plan.draft.intent === "accept_all_ready"
  );
}

export function commandOperationLabel(intent: LogisticsCommandDraft["intent"]): string {
  switch (intent) {
    case "accept_all_ready":
      return "批量接受方案";
    case "fetch_quotes":
      return "运费预估";
    case "open_template":
      return "打开物流模板";
    case "focus_issues":
      return "查看问题项";
    case "focus_status":
      return "聚焦状态";
    case "explain_quote":
      return "解释报价";
    case "apply_template":
      return "应用物流模板";
    default:
      return "执行命令";
  }
}

export function resolveLogisticsCommandExecution(
  plan: LogisticsCommandPlan
): LogisticsCommandExecution | null {
  switch (plan.draft.intent) {
    case "accept_all_ready": {
      return {
        type: "accept_all_ready",
        variantIds: [],
        totalCount: plan.draft.params.status ? 0 : plan.draft.params.status ? 0 : 0,
      };
    }
    case "fetch_quotes": {
      return { type: "fetch_quotes" };
    }
    case "open_template": {
      return { type: "open_template" };
    }
    case "focus_issues": {
      return { type: "set_filter", filterMode: "issues" };
    }
    case "focus_status": {
      const status = plan.draft.params.status ?? "needs_review";
      return { type: "focus_status", status };
    }
    case "apply_template": {
      return { type: "apply_template", templateId: plan.draft.params.templateId ?? "" };
    }
    default:
      return null;
  }
}