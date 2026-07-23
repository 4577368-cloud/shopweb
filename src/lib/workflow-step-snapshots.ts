import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import type { StepStatus } from "@/lib/types";
import type {
  WorkflowBindingProgress,
  WorkflowSkuProgress,
} from "@/lib/workflow-progress";

type TFn = (key: string, params?: Record<string, string | number>) => string;

export type WorkflowStatusKey =
  | "completed"
  | "in_progress"
  | "pending"
  | "not_started"
  | "error"
  | "loading"
  | "ready"
  | "syncing";

export type WorkflowStepSnapshot = {
  /** Locale-agnostic status key — use this for logic/comparisons. */
  statusKey: WorkflowStatusKey;
  /** Localized, display-ready status label. */
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

function keyForStatus(status: StepStatus): WorkflowStatusKey {
  switch (status) {
    case "completed":
      return "completed";
    case "in_progress":
    case "pending_confirm":
      return "in_progress";
    case "error":
      return "error";
    default:
      return "not_started";
  }
}

const STATUS_MSG_KEY: Record<WorkflowStatusKey, string> = {
  completed: "status.done",
  in_progress: "status.inProgress",
  pending: "status.pending",
  not_started: "status.notStarted",
  error: "status.error",
  loading: "status.loading",
  ready: "status.ready",
  syncing: "status.syncing",
};

function statusLabelFor(key: WorkflowStatusKey, t: TFn): string {
  return t(STATUS_MSG_KEY[key]);
}

export function snapshotAuthorizeStep(
  t: TFn,
  authorized: boolean,
  shopLabel?: string
): WorkflowStepSnapshot {
  const statusKey: WorkflowStatusKey = authorized ? "completed" : "not_started";
  const status: StepStatus = authorized ? "completed" : "not_started";
  return {
    statusKey,
    statusLabel: statusLabelFor(statusKey, t),
    statusTone: toneForStatus(status),
    description: authorized
      ? shopLabel?.trim() || t("snapshot.shopConnected")
      : t("snapshot.connectStoreDesc"),
  };
}

export function snapshotProductsStep(
  t: TFn,
  authorized: boolean,
  binding: WorkflowBindingProgress | null
): WorkflowStepSnapshot {
  if (!authorized) {
    return {
      statusKey: "not_started",
      statusLabel: statusLabelFor("not_started", t),
      statusTone: "text-ink-subtle",
      description: t("snapshot.productsNotStarted"),
    };
  }
  if (!binding) {
    return {
      statusKey: "loading",
      statusLabel: statusLabelFor("loading", t),
      statusTone: "text-ink-subtle",
      description: t("snapshot.productsLoading"),
    };
  }
  if (binding.analyzed === 0) {
    return {
      statusKey: "pending",
      statusLabel: statusLabelFor("pending", t),
      statusTone: "text-brand",
      description: t("snapshot.productsEmpty"),
    };
  }

  const linked = binding.confirmed + binding.pending;
  const complete = binding.unbound === 0 && binding.pending === 0;
  const inProgress = linked > 0 || binding.unbound > 0;
  const statusKey: WorkflowStatusKey = complete
    ? "completed"
    : inProgress
      ? "in_progress"
      : "pending";

  const parts: string[] = [t("snapshot.productsLinked", { linked, analyzed: binding.analyzed })];
  if (binding.confirmed > 0) parts.push(t("snapshot.productsConfirmed", { count: binding.confirmed }));
  if (binding.pending > 0) parts.push(t("snapshot.productsPending", { count: binding.pending }));
  if (binding.unbound > 0) parts.push(t("snapshot.productsUnbound", { count: binding.unbound }));

  return {
    statusKey,
    statusLabel: statusLabelFor(statusKey, t),
    statusTone: toneForStatus(
      complete ? "completed" : inProgress ? "in_progress" : "pending_confirm"
    ),
    description: parts.join(" · "),
  };
}

export function snapshotSkuStep(
  t: TFn,
  authorized: boolean,
  productsComplete: boolean,
  sku: WorkflowSkuProgress | null
): WorkflowStepSnapshot {
  if (!authorized || !productsComplete) {
    return {
      statusKey: "not_started",
      statusLabel: statusLabelFor("not_started", t),
      statusTone: "text-ink-subtle",
      description: t("snapshot.skuNotStarted"),
    };
  }
  if (!sku) {
    return {
      statusKey: "loading",
      statusLabel: statusLabelFor("loading", t),
      statusTone: "text-ink-subtle",
      description: t("snapshot.skuLoading"),
    };
  }
  if (sku.productCount === 0) {
    return {
      statusKey: "pending",
      statusLabel: statusLabelFor("pending", t),
      statusTone: "text-brand",
      description: t("snapshot.skuEmpty"),
    };
  }

  const mapped = sku.activeAuto + sku.manualActive;
  const complete = sku.issueProductCount === 0;
  const statusKey: WorkflowStatusKey = complete
    ? "completed"
    : mapped > 0
      ? "in_progress"
      : "pending";

  const parts: string[] = [t("snapshot.skuMapped", { mapped, total: sku.variantCount })];
  if (sku.needsReview > 0) parts.push(t("snapshot.skuPending", { count: sku.needsReview }));
  if (sku.unbound > 0) parts.push(t("snapshot.skuUnbound", { count: sku.unbound }));

  return {
    statusKey,
    statusLabel: statusLabelFor(statusKey, t),
    statusTone: toneForStatus(
      complete ? "completed" : mapped > 0 ? "in_progress" : "pending_confirm"
    ),
    description: parts.join(" · "),
  };
}

export function snapshotLogisticsStep(
  t: TFn,
  input: {
    authorized: boolean;
    skuReady: boolean;
    metrics: LogisticsPlanMetrics | null;
    pipelineActive: boolean;
    hasTemplate: boolean;
  }
): WorkflowStepSnapshot {
  if (!input.authorized || !input.skuReady) {
    return {
      statusKey: "not_started",
      statusLabel: statusLabelFor("not_started", t),
      statusTone: "text-ink-subtle",
      description: t("snapshot.logisticsNotStarted"),
    };
  }

  if (input.pipelineActive) {
    return {
      statusKey: "syncing",
      statusLabel: statusLabelFor("syncing", t),
      statusTone: "text-brand",
      description: t("snapshot.logisticsPipeline"),
    };
  }

  const m = input.metrics;
  if (!m || m.variantCount === 0) {
    return {
      statusKey: "syncing",
      statusLabel: statusLabelFor("syncing", t),
      statusTone: "text-brand",
      description: input.hasTemplate
        ? t("snapshot.logisticsTemplateSaved")
        : t("snapshot.logisticsSaveTemplate"),
    };
  }

  const parts: string[] = [];
  if (m.quotedCount > 0) parts.push(t("snapshot.logisticsQuoted", { count: m.quotedCount }));
  if (m.confirmedCount > 0) parts.push(t("snapshot.logisticsConfirmed", { count: m.confirmedCount }));
  parts.push(t("snapshot.logisticsVariantTotal", { total: m.variantCount }));
  const description = parts.join(" · ");

  const allConfirmed = m.confirmedCount >= m.variantCount;
  const hasProgress = m.quotedCount > 0 || m.confirmedCount > 0;

  const statusKey: WorkflowStatusKey = allConfirmed ? "completed" : "syncing";
  return {
    statusKey,
    statusLabel: statusLabelFor(statusKey, t),
    statusTone: "text-brand",
    description,
  };
}

export function snapshotSyncStep(
  t: TFn,
  input: {
    syncCompleted: boolean;
    syncPhase: "blocked" | "ready" | "syncing" | "completed";
    logisticsReady: boolean;
  }
): WorkflowStepSnapshot {
  if (input.syncCompleted) {
    return {
      statusKey: "completed",
      statusLabel: statusLabelFor("completed", t),
      statusTone: "text-brand",
      description: t("snapshot.syncDone"),
    };
  }
  if (input.syncPhase === "syncing") {
    return {
      statusKey: "syncing",
      statusLabel: statusLabelFor("syncing", t),
      statusTone: "text-brand",
      description: t("snapshot.syncSyncing"),
    };
  }
  if (input.logisticsReady) {
    return {
      statusKey: "ready",
      statusLabel: statusLabelFor("ready", t),
      statusTone: "text-brand",
      description: t("snapshot.syncReady"),
    };
  }
  return {
    statusKey: "not_started",
    statusLabel: statusLabelFor("not_started", t),
    statusTone: "text-ink-subtle",
    description: t("snapshot.syncBlocked"),
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
