import type { ScanTaskStatus, ScanTaskView } from "@/components/workbench/scan-stage";
import type { ShopScanContext } from "@/lib/scan/shop-scan-context";

export interface ScanSummaryStats {
  productCount: number;
  /** Products with binding among current mirrored catalog. */
  matchedCount: number;
  pendingCount: number;
  confirmedCount: number;
  unboundCount: number;
  matchJobTotal: number;
  matchJobProcessed: number;
  matchJobLinked: number;
  matchJobSkipped: number;
  shopContext: ShopScanContext;
}

export type CopilotWorkflowStepId =
  | "sync"
  | "features"
  | "match"
  | "orders";

export interface CopilotWorkflowStep {
  id: CopilotWorkflowStepId;
  title: string;
  subtitle: string;
  status: ScanTaskStatus;
  resultText: string;
  reasonText?: string;
}

function taskOf(tasks: ScanTaskView[], id: string): ScanTaskView | undefined {
  return tasks.find((t) => t.id === id);
}

function isSettled(status: ScanTaskStatus): boolean {
  return status === "done" || status === "failed" || status === "skipped";
}

function ratio(n: number, total: number, label: string): string {
  if (total <= 0) return label;
  return `${n} / ${total} ${label}`;
}

function unboundSkipReason(stats: ScanSummaryStats): string | undefined {
  if (stats.unboundCount <= 0 && stats.matchJobSkipped <= 0) return undefined;
  const parts: string[] = [];
  if (stats.matchJobSkipped > 0) parts.push("缺少有效图片");
  if (stats.unboundCount > 0) parts.push("暂无可用候选");
  return parts.length > 0 ? parts.join("，") : undefined;
}

function syncStatus(tasks: ScanTaskView[]): ScanTaskStatus {
  const t = taskOf(tasks, "sync");
  return t?.status ?? "pending";
}

function featuresStatus(tasks: ScanTaskView[]): ScanTaskStatus {
  const sync = syncStatus(tasks);
  if (!isSettled(sync) && sync !== "failed") return "pending";
  const load = taskOf(tasks, "load");
  return load?.status ?? "pending";
}

function matchStatus(tasks: ScanTaskView[]): ScanTaskStatus {
  const features = featuresStatus(tasks);
  if (!isSettled(features) && features !== "failed") return "pending";
  const match = taskOf(tasks, "match");
  if (!match) return "pending";
  return match.status;
}

/** Catalog-level outcome overrides queue FAILED when every product is matched. */
function effectiveMatchStatus(
  tasks: ScanTaskView[],
  stats: ScanSummaryStats
): ScanTaskStatus {
  const raw = matchStatus(tasks);
  if (raw !== "failed") return raw;
  if (stats.productCount > 0 && stats.unboundCount === 0) return "done";
  return "failed";
}

function ordersStatus(tasks: ScanTaskView[], stats: ScanSummaryStats): ScanTaskStatus {
  const features = featuresStatus(tasks);
  if (!isSettled(features) && features !== "failed") return "pending";
  const orders = taskOf(tasks, "orders");
  if (orders) return orders.status;
  return stats.shopContext.loaded ? "done" : "pending";
}

/** Map internal scan tasks → four AI Copilot workflow steps. */
export function deriveCopilotWorkflow(
  tasks: ScanTaskView[],
  stats: ScanSummaryStats,
  done: boolean
): CopilotWorkflowStep[] {
  const total = stats.productCount;
  const matched = stats.matchedCount;
  const unbound = stats.unboundCount;
  const orders = stats.shopContext;

  let sync = syncStatus(tasks);
  let features = featuresStatus(tasks);
  let match = effectiveMatchStatus(tasks, stats);
  let ordersSt = ordersStatus(tasks, stats);

  if (done) {
    if (ordersSt === "pending") ordersSt = orders.loaded ? "done" : "skipped";
    if (match === "failed" && stats.unboundCount === 0) match = "done";
  }

  const syncLine = (): { resultText: string; reasonText?: string } => {
    if (sync === "running") return { resultText: "同步中…" };
    if (sync === "pending") return { resultText: "等待中" };
    if (total > 0) return { resultText: ratio(total, total, "已同步") };
    return { resultText: "暂无商品" };
  };

  const featuresLine = (): { resultText: string; reasonText?: string } => {
    if (features === "running") return { resultText: "分析中…" };
    if (features === "pending") return { resultText: "等待中" };
    if (total > 0) return { resultText: ratio(total, total, "已理解") };
    return { resultText: "—" };
  };

  const matchLine = (): { resultText: string; reasonText?: string } => {
    if (match === "running") {
      const jt = stats.matchJobTotal;
      if (jt > 0) {
        return {
          resultText: ratio(stats.matchJobProcessed, jt, "处理中"),
          reasonText:
            stats.matchJobLinked > 0 ? `本轮新关联 ${stats.matchJobLinked}` : undefined,
        };
      }
      return { resultText: "匹配中…" };
    }
    if (match === "pending") return { resultText: "等待中" };
    if (total <= 0) return { resultText: "—" };
    const parts = [ratio(matched, total, "已匹配")];
    if (unbound > 0) parts.push(ratio(unbound, total, "无匹配"));
    return { resultText: parts.join("，"), reasonText: unboundSkipReason(stats) };
  };

  const ordersLine = (): { resultText: string; reasonText?: string } => {
    if (ordersSt === "running") return { resultText: "读取订单中…" };
    if (ordersSt === "pending") return { resultText: "等待中" };
    if (!orders.loaded || orders.orderCount == null) {
      return { resultText: "暂无订单数据", reasonText: "订单需经 Shopify 同步" };
    }
    if (orders.orderCount === 0) return { resultText: "0 笔近期订单" };
    const unfulfilled = orders.unfulfilledOrderCount ?? 0;
    if (unfulfilled > 0) {
      return {
        resultText: `${orders.orderCount} 笔订单，${unfulfilled} 笔待发货`,
      };
    }
    return { resultText: `${orders.orderCount} 笔订单已读取` };
  };

  return [
    {
      id: "sync",
      title: "同步店铺镜像",
      subtitle: "从 Shopify 拉取在售商品",
      status: sync,
      ...syncLine(),
    },
    {
      id: "features",
      title: "理解商品特征",
      subtitle: "分析图片、标题与类目规格",
      status: features,
      ...featuresLine(),
    },
    {
      id: "match",
      title: "匹配供应链",
      subtitle: "图搜 Tangbuy 货源并建立关联",
      status: match,
      ...matchLine(),
    },
    {
      id: "orders",
      title: "读取店铺订单",
      subtitle: "同步近期订单与发货状态",
      status: ordersSt,
      ...ordersLine(),
    },
  ];
}

export function computeWorkflowProgress(
  steps: CopilotWorkflowStep[],
  matchProgressPercent: number,
  done?: boolean
): number {
  if (done) return 100;
  const slice = 100 / steps.length;
  let pct = 0;
  for (const step of steps) {
    if (step.status === "done" || step.status === "skipped") {
      pct += slice;
    } else if (step.status === "failed") {
      pct += slice * 0.6;
    } else if (step.status === "running") {
      if (step.id === "match" && matchProgressPercent > 0) {
        pct += slice * (matchProgressPercent / 100);
      } else {
        pct += slice * 0.45;
      }
      break;
    } else {
      break;
    }
  }
  return Math.min(100, Math.round(pct));
}

export function completedWorkflowSteps(steps: CopilotWorkflowStep[]): number {
  return steps.filter((s) => s.status === "done" || s.status === "skipped").length;
}

export function activeWorkflowStep(
  steps: CopilotWorkflowStep[]
): CopilotWorkflowStep | null {
  return steps.find((s) => s.status === "running") ?? null;
}

export function copilotStatusHeadline(
  steps: CopilotWorkflowStep[],
  done: boolean
): { title: string; hint?: string } {
  if (done) {
    return { title: "AI 已完成首轮选品分析" };
  }
  const active = activeWorkflowStep(steps);
  const completed = completedWorkflowSteps(steps);
  const hint =
    completed > 0 ? `${completed} / ${steps.length} 步已完成` : undefined;
  switch (active?.id) {
    case "sync":
      return { title: "正在同步店铺商品…", hint };
    case "features":
      return { title: "正在理解商品特征…", hint };
    case "match":
      return { title: "正在匹配 Tangbuy 供应链…", hint };
    case "orders":
      return { title: "正在读取店铺订单…", hint };
    default:
      return { title: "AI 正在分析你的店铺", hint };
  }
}

export function scanBriefingLine(stats: ScanSummaryStats): string {
  if (stats.productCount <= 0) return "暂无可分析商品";
  const pending =
    stats.pendingCount > 0 ? `，${stats.pendingCount} 个待确认` : "";
  return `已分析 ${stats.productCount} 个商品，${stats.matchedCount} 个推荐匹配${pending}`;
}
