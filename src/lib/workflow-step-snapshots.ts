import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import type { StepStatus } from "@/lib/types";
import type {
  WorkflowBindingProgress,
  WorkflowSkuProgress,
} from "@/lib/workflow-progress";

export type WorkflowStepSnapshot = {
  statusLabel: string;
  statusTone: string;
  description: string;
};

function toneForStatus(status: StepStatus): string {
  switch (status) {
    case "completed":
      return "text-brand";
    case "in_progress":
    case "pending_confirm":
      return "text-brand";
    case "error":
      return "text-red-500";
    default:
      return "text-ink-subtle";
  }
}

function labelForStatus(status: StepStatus): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "in_progress":
    case "pending_confirm":
      return "进行中";
    case "error":
      return "异常";
    default:
      return "待开始";
  }
}

export function snapshotAuthorizeStep(
  authorized: boolean,
  shopLabel?: string
): WorkflowStepSnapshot {
  const status: StepStatus = authorized ? "completed" : "not_started";
  return {
    statusLabel: labelForStatus(status),
    statusTone: toneForStatus(status),
    description: authorized
      ? shopLabel?.trim() || "店铺连接成功"
      : "连接 Shopify 店铺并同步基础数据",
  };
}

export function snapshotProductsStep(
  authorized: boolean,
  binding: WorkflowBindingProgress | null
): WorkflowStepSnapshot {
  if (!authorized) {
    return {
      statusLabel: "待开始",
      statusTone: "text-ink-subtle",
      description: "在售关联 + 目录上架",
    };
  }
  if (!binding) {
    return {
      statusLabel: "加载中",
      statusTone: "text-ink-subtle",
      description: "正在同步店铺商品…",
    };
  }
  if (binding.analyzed === 0) {
    return {
      statusLabel: "待处理",
      statusTone: "text-brand",
      description: "店铺暂无商品，或镜像同步中",
    };
  }

  const linked = binding.confirmed + binding.pending;
  const complete = binding.unbound === 0 && binding.pending === 0;
  const inProgress = linked > 0 || binding.unbound > 0;
  const status: StepStatus = complete
    ? "completed"
    : inProgress
      ? "in_progress"
      : "pending_confirm";

  const parts: string[] = [`${linked}/${binding.analyzed} 商品已关联`];
  if (binding.confirmed > 0) parts.push(`已确认 ${binding.confirmed}`);
  if (binding.pending > 0) parts.push(`待确认 ${binding.pending}`);
  if (binding.unbound > 0) parts.push(`未关联 ${binding.unbound}`);

  return {
    statusLabel: complete ? "已完成" : labelForStatus(status),
    statusTone: toneForStatus(status),
    description: parts.join(" · "),
  };
}

export function snapshotSkuStep(
  authorized: boolean,
  productsComplete: boolean,
  sku: WorkflowSkuProgress | null
): WorkflowStepSnapshot {
  if (!authorized || !productsComplete) {
    return {
      statusLabel: "待开始",
      statusTone: "text-ink-subtle",
      description: "核对规格映射关系",
    };
  }
  if (!sku) {
    return {
      statusLabel: "加载中",
      statusTone: "text-ink-subtle",
      description: "正在汇总 SKU 映射…",
    };
  }
  if (sku.productCount === 0) {
    return {
      statusLabel: "待处理",
      statusTone: "text-brand",
      description: "暂无 SKU 数据",
    };
  }

  const mapped = sku.activeAuto + sku.manualActive;
  const complete = sku.issueProductCount === 0;
  const status: StepStatus = complete
    ? "completed"
    : mapped > 0
      ? "in_progress"
      : "pending_confirm";

  const parts: string[] = [`${mapped}/${sku.variantCount} 变体已映射`];
  if (sku.needsReview > 0) parts.push(`待确认 ${sku.needsReview}`);
  if (sku.unbound > 0) parts.push(`未匹配 ${sku.unbound}`);

  return {
    statusLabel: complete ? "已完成" : labelForStatus(status),
    statusTone: toneForStatus(status),
    description: parts.join(" · "),
  };
}

export function snapshotLogisticsStep(input: {
  authorized: boolean;
  skuReady: boolean;
  metrics: LogisticsPlanMetrics | null;
  pipelineActive: boolean;
  hasTemplate: boolean;
}): WorkflowStepSnapshot {
  if (!input.authorized || !input.skuReady) {
    return {
      statusLabel: "待开始",
      statusTone: "text-ink-subtle",
      description: "识别物流类型并配置策略模板",
    };
  }

  if (input.pipelineActive) {
    return {
      statusLabel: "进行中",
      statusTone: "text-brand",
      description: "物流线路预估进行中",
    };
  }

  const m = input.metrics;
  if (!m || m.variantCount === 0) {
    return {
      statusLabel: "进行中",
      statusTone: "text-brand",
      description: input.hasTemplate
        ? "模板已保存，待拉取线路报价"
        : "先保存物流模板与销售国家",
    };
  }

  const parts: string[] = [];
  if (m.quotedCount > 0) parts.push(`已报价 ${m.quotedCount}`);
  if (m.confirmedCount > 0) parts.push(`已确认 ${m.confirmedCount}`);
  parts.push(`共 ${m.variantCount} 变体`);
  const description = parts.join(" · ");

  const allConfirmed = m.confirmedCount >= m.variantCount;
  const hasProgress = m.quotedCount > 0 || m.confirmedCount > 0;

  if (allConfirmed) {
    return {
      statusLabel: "已完成",
      statusTone: "text-brand",
      description,
    };
  }

  if (hasProgress) {
    return {
      statusLabel: "进行中",
      statusTone: "text-brand",
      description,
    };
  }

  return {
    statusLabel: "进行中",
    statusTone: "text-brand",
    description,
  };
}

export function snapshotSyncStep(input: {
  syncCompleted: boolean;
  syncPhase: "blocked" | "ready" | "syncing" | "completed";
  logisticsReady: boolean;
}): WorkflowStepSnapshot {
  if (input.syncCompleted) {
    return {
      statusLabel: "已完成",
      statusTone: "text-brand",
      description: "开店准备仪式已完成",
    };
  }
  if (input.syncPhase === "syncing") {
    return {
      statusLabel: "同步中",
      statusTone: "text-brand",
      description: "正在写入映射与履约配置",
    };
  }
  if (input.logisticsReady) {
    return {
      statusLabel: "可开始",
      statusTone: "text-brand",
      description: "前置步骤已就绪，可进入完成仪式",
    };
  }
  return {
    statusLabel: "待开始",
    statusTone: "text-ink-subtle",
    description: "完成物流确认后可同步",
  };
}

export function computeWorkflowPercent(input: {
  authorized: boolean;
  syncCompleted: boolean;
  binding: WorkflowBindingProgress | null;
  sku: WorkflowSkuProgress | null;
  logistics: LogisticsPlanMetrics | null;
}): number {
  if (input.syncCompleted) return 100;
  if (!input.authorized) return 0;

  let percent = 12;

  const binding = input.binding;
  if (binding && binding.analyzed > 0) {
    const linked = binding.confirmed + binding.pending;
    percent += Math.round(23 * Math.min(1, linked / binding.analyzed));
  }

  const sku = input.sku;
  if (sku && sku.variantCount > 0) {
    const mapped = sku.activeAuto + sku.manualActive;
    percent += Math.round(30 * Math.min(1, mapped / sku.variantCount));
  }

  const logistics = input.logistics;
  if (logistics && logistics.variantCount > 0) {
    const progress = Math.max(
      logistics.confirmedCount,
      logistics.quotedCount
    );
    percent += Math.round(30 * Math.min(1, progress / logistics.variantCount));
  }

  return Math.min(99, Math.max(percent, 4));
}
