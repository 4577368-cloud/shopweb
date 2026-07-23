import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import { LOGISTICS_LOCAL_SAVED_DETAIL } from "@/lib/sync/fulfillment-copy";
import type { ActivityItem, ShopInfo } from "@/lib/types";
import type {
  WorkflowBindingProgress,
  WorkflowSkuProgress,
} from "@/lib/workflow-progress";

type TFn = (key: string, params?: Record<string, string | number>) => string;

function formatAuthActivityTime(authorizedAt?: string): string {
  if (!authorizedAt?.trim()) return "—";
  const parsed = new Date(authorizedAt.replace(/-/g, "/"));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const match = authorizedAt.match(/(\d{1,2}:\d{2})/);
  return match?.[1] ?? "—";
}

function formatRelativeActivityTime(refreshedAt: string, t: TFn): string {
  const refreshed = new Date(refreshedAt);
  if (Number.isNaN(refreshed.getTime())) return "—";
  const diffMs = Date.now() - refreshed.getTime();
  if (diffMs < 60_000) return t("activity.now");
  if (diffMs < 3_600_000) {
    return t("activity.minutesAgo", {
      count: Math.max(1, Math.floor(diffMs / 60_000)),
    });
  }
  return refreshed.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const WAITING_AUTH_ACTIVITY = (t: TFn): ActivityItem => ({
  id: "waiting-auth",
  time: "—",
  title: t("activity.waitingTitle"),
  detail: t("activity.waitingDetail"),
  level: "info",
});

export function buildDashboardActivities(
  input: {
    isAuthorized: boolean;
    shop: ShopInfo;
    binding: WorkflowBindingProgress | null;
    sku: WorkflowSkuProgress | null;
    logistics: LogisticsPlanMetrics | null;
    logisticsCompleted: boolean;
    syncCompleted: boolean;
    refreshedAt: string | null;
  },
  t: TFn
): ActivityItem[] {
  if (!input.isAuthorized) {
    return [WAITING_AUTH_ACTIVITY(t)];
  }

  const refreshedAt = input.refreshedAt ?? new Date().toISOString();
  const relativeTime = formatRelativeActivityTime(refreshedAt, t);
  const activities: ActivityItem[] = [];

  if (input.syncCompleted) {
    activities.push({
      id: "sync",
      time: relativeTime,
      title: t("activity.syncDoneTitle"),
      detail: t("activity.syncDoneDetail"),
      level: "success",
    });
  }

  if (input.logistics && input.logistics.variantCount > 0) {
    const logisticsDone =
      input.logisticsCompleted ||
      input.logistics.confirmedCount >= input.logistics.variantCount;
    activities.push({
      id: "logistics",
      time: relativeTime,
      title: logisticsDone ? t("activity.logisticsDoneTitle") : t("activity.logisticsProgressTitle"),
      detail: logisticsDone
        ? t(LOGISTICS_LOCAL_SAVED_DETAIL)
        : t("activity.logisticsProgressDetail", {
            quoted: input.logistics.quotedCount,
            pending: input.logistics.pendingConfirmCount,
          }),
      level: logisticsDone ? "success" : "info",
    });
  }

  if (input.sku && input.sku.variantCount > 0) {
    const aligned = input.sku.activeAuto + input.sku.manualActive;
    const pending = input.sku.needsReview + input.sku.unbound;
    activities.push({
      id: "sku",
      time: relativeTime,
      title:
        input.sku.issueProductCount === 0 ? t("activity.skuDoneTitle") : t("activity.skuProgressTitle"),
      detail: t("activity.skuDetail", { aligned, pending }),
      level: input.sku.issueProductCount === 0 ? "success" : "info",
    });
  }

  if (input.binding && input.binding.analyzed > 0) {
    const productsDone =
      input.binding.unbound === 0 && input.binding.pending === 0;
    activities.push({
      id: "products",
      time: relativeTime,
      title: productsDone ? t("activity.productsDoneTitle") : t("activity.productsProgressTitle"),
      detail: t("activity.productsDetail", {
        analyzed: input.binding.analyzed,
        matched: input.binding.matched,
        pending: input.binding.pending,
      }),
      level: productsDone ? "success" : "info",
    });
  } else {
    activities.push({
      id: "products-loading",
      time: relativeTime,
      title: t("activity.productsLoadingTitle"),
      detail: t("activity.productsLoadingDetail"),
      level: "info",
    });
  }

  activities.push({
    id: "auth",
    time: formatAuthActivityTime(input.shop.authorizedAt),
    title: t("activity.authTitle"),
    detail: t("activity.authDetail", { name: input.shop.name || input.shop.domain }),
    level: "success",
  });

  return activities;
}
