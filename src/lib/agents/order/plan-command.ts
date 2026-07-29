// 订单指令「计划 + 执行解析」（Phase 6）。
// planOrderCommand：把 Draft 变成人类可读的 Plan（operation / targetLabel / detailLines，本地化）。
// resolveOrderCommandExecution：把 Plan 变成可执行的 Execution（判别联合），由面板经页面回调落地。
import type { OrderStatus, OrderSummary } from "@/lib/order/types";
import { STATUS_ORDER } from "@/lib/order/state-machine";
import type {
  OrderCommandDraft,
  OrderCommandExecution,
  OrderCommandPlan,
  OrderTabKey,
} from "./command-schema";

export interface OrderPlanContext {
  t: (key: string, params?: Record<string, string | number>) => string;
  total: number;
  byStatus: Record<OrderStatus, number>;
  visibleOrders: OrderSummary[];
  orders: OrderSummary[];
  shopDomain: string;
}

function statusLabel(t: (key: string) => string, tab: OrderTabKey): string {
  return tab === "all" ? t("order.all") : t(`order.tabs.${tab}`);
}

function findOrderByFragment(
  orders: OrderSummary[],
  fragment: string | undefined
): OrderSummary | null {
  if (!fragment) return null;
  const f = fragment.trim();
  if (!f) return null;
  return (
    orders.find(
      (o) =>
        (o.shopOrderNo ?? "").includes(f) || (o.shopifyOrderId ?? "").includes(f)
    ) ?? null
  );
}

export function planOrderCommand(
  t: (key: string, params?: Record<string, string | number>) => string,
  draft: OrderCommandDraft,
  ctx: OrderPlanContext
): OrderCommandPlan {
  const op = (id: string) => t(`order.agent.op.${id}`);
  const { params } = draft;

  switch (draft.intent) {
    case "set_tab": {
      if (!params.tab) {
        return notExecutable(draft, op("setTab"), t("order.agent.needTab"));
      }
      const label = statusLabel(t, params.tab);
      return {
        draft,
        operation: op("setTab"),
        targetLabel: label,
        detailLines: [t("order.agent.planGoToTab", { tab: label })],
        executable: true,
      };
    }
    case "search": {
      const q = (params.query ?? "").trim();
      if (!q) return notExecutable(draft, op("search"), t("order.agent.needQuery"));
      return {
        draft,
        operation: op("search"),
        targetLabel: q,
        detailLines: [t("order.agent.planSearch", { q })],
        executable: true,
      };
    }
    case "reset_filters":
      return {
        draft,
        operation: op("resetFilters"),
        targetLabel: "—",
        detailLines: [t("order.agent.planReset")],
        executable: true,
      };
    case "set_exception": {
      const ex = params.exception ?? "all";
      const exLabel =
        ex === "noQuote"
          ? t("order.filter.exNoQuote")
          : ex === "stuck"
            ? t("order.filter.exStuck")
            : t("order.filter.exAll");
      return {
        draft,
        operation: op("setException"),
        targetLabel: exLabel,
        detailLines: [t("order.agent.planException", { ex: exLabel })],
        executable: true,
      };
    }
    case "set_time_range": {
      const tr = params.timeRange ?? "all";
      const trLabel =
        tr === "7d" ? t("order.filter.time7d") : tr === "30d" ? t("order.filter.time30d") : t("order.filter.timeAll");
      return {
        draft,
        operation: op("setTimeRange"),
        targetLabel: trLabel,
        detailLines: [t("order.agent.planTimeRange", { tr: trLabel })],
        executable: true,
      };
    }
    case "focus_order": {
      const found = findOrderByFragment(ctx.orders, params.orderFragment);
      if (!found) {
        return notExecutable(
          draft,
          op("focusOrder"),
          t("order.agent.noOrderMatch", { q: params.orderFragment ?? "" })
        );
      }
      return {
        draft,
        operation: op("focusOrder"),
        targetLabel: found.shopOrderNo,
        detailLines: [t("order.agent.planFocus", { no: found.shopOrderNo })],
        executable: true,
      };
    }
    case "open_shopify": {
      const found = findOrderByFragment(ctx.orders, params.orderFragment);
      if (!found) {
        return notExecutable(
          draft,
          op("openShopify"),
          t("order.agent.noOrderMatch", { q: params.orderFragment ?? "" })
        );
      }
      const url = `https://${ctx.shopDomain}/admin/orders/${found.shopifyOrderId}`;
      return {
        draft,
        operation: op("openShopify"),
        targetLabel: found.shopOrderNo,
        detailLines: [t("order.agent.planOpen", { no: found.shopOrderNo })],
        executable: true,
      };
    }
    case "export_csv": {
      const n = ctx.visibleOrders.length;
      return {
        draft,
        operation: op("exportCsv"),
        targetLabel: t("order.agent.planExportTarget", { n }),
        detailLines: [t("order.agent.planExport")],
        executable: true,
      };
    }
    case "summary": {
      const lines = STATUS_ORDER.map(
        (s) => `${statusLabel(t, s)}：${ctx.byStatus[s] ?? 0}`
      );
      lines.push(`${t("order.all")}：${ctx.total}`);
      return {
        draft,
        operation: op("summary"),
        targetLabel: t("order.agent.planSummaryTarget", { n: ctx.total }),
        detailLines: lines,
        executable: true,
      };
    }
  }
}

export function resolveOrderCommandExecution(
  plan: OrderCommandPlan,
  ctx: OrderPlanContext
): OrderCommandExecution | null {
  const { draft } = plan;
  if (!plan.executable) return null;
  const { params } = draft;

  switch (draft.intent) {
    case "set_tab":
      if (!params.tab) return null;
      return { type: "set_tab", tab: params.tab };
    case "search":
      if (!params.query?.trim()) return null;
      return { type: "search", query: params.query.trim() };
    case "reset_filters":
      return { type: "reset_filters" };
    case "set_exception":
      return { type: "set_exception", exception: params.exception ?? "all" };
    case "set_time_range":
      return { type: "set_time_range", timeRange: params.timeRange ?? "all" };
    case "focus_order": {
      const found = findOrderByFragment(ctx.orders, params.orderFragment);
      return found ? { type: "focus_order", orderId: found.id } : null;
    }
    case "open_shopify": {
      const found = findOrderByFragment(ctx.orders, params.orderFragment);
      if (!found) return null;
      const url = `https://${ctx.shopDomain}/admin/orders/${found.shopifyOrderId}`;
      return { type: "open_shopify", orderId: found.id, url };
    }
    case "export_csv":
      return { type: "export_csv", orders: ctx.visibleOrders };
    case "summary":
      return { type: "summary", text: plan.detailLines.join("\n") };
  }
}

function notExecutable(
  draft: OrderCommandDraft,
  operation: string,
  clarify: string
): OrderCommandPlan {
  return { draft, operation, targetLabel: "—", detailLines: [], executable: false, clarify };
}
