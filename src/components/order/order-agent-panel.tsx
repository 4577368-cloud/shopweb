"use client";

// 订单中心右侧 Copilot 面板（Phase 6）。
// 复用 command-schema 范式：自然语言 → 规则分类 → 计划预览 → 执行（经页面回调落地真实列表操作）。
// 所有指令都作用于我们真实拥有的订单数据，不调 LLM、零成本、可预测。
import { useCallback, useMemo, useState } from "react";
import { Send, Loader2, Download, ExternalLink, CheckCircle2, AlertTriangle } from "@/lib/ui/icons";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import type { OrderStatus, OrderSummary } from "@/lib/order/types";
import type { ExceptionFilter, TimeRange } from "@/components/order/order-filter-bar";
import type { OrderTabKey } from "@/lib/agents/order/command-schema";
import {
  classifyOrderCommandInput,
  type OrderClassifyContext,
} from "@/lib/agents/order/classify-command";
import {
  planOrderCommand,
  resolveOrderCommandExecution,
  type OrderPlanContext,
} from "@/lib/agents/order/plan-command";
import type { OrderCommandPlan } from "@/lib/agents/order/command-schema";

export interface OrderAgentHandlers {
  onSetTab: (tab: OrderTabKey) => void;
  onSetSearch: (q: string) => void;
  onSetException: (ex: ExceptionFilter) => void;
  onSetTimeRange: (tr: TimeRange) => void;
  onResetFilters: () => void;
  onSelectOrder: (id: string) => void;
}

export interface OrderAgentContext {
  total: number;
  byStatus: Record<OrderStatus, number>;
  visibleOrders: OrderSummary[];
  orders: OrderSummary[];
  shopDomain: string;
}

export interface OrderAgentPanelProps {
  context: OrderAgentContext;
  handlers: OrderAgentHandlers;
}

function csvCell(s: string | undefined): string {
  const v = (s ?? "").toString();
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportOrdersCsv(orders: OrderSummary[], t: (k: string) => string): number {
  const headers = [
    t("order.table.info"),
    t("order.columns.tangbuyOrderNo"),
    t("order.table.status"),
    t("order.table.paymentStatus"),
    t("order.table.amount"),
    t("order.card.createdAt"),
  ];
  const rows = orders.map((o) => [
    o.shopOrderNo,
    o.tangbuyOrderNo ?? "—",
    t(`order.tabs.${o.status}`),
    o.paymentStatus ? t(`order.paymentStatus.${o.paymentStatus}`) : "—",
    o.productCost ?? "—",
    o.createdAt,
  ]);
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return orders.length;
}

export function OrderAgentPanel({ context, handlers }: OrderAgentPanelProps) {
  const t = useT();
  const locale = useLocale();
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<OrderCommandPlan | null>(null);
  const [clarify, setClarify] = useState<string | { message: string; candidates?: { intent: string; label: string }[] } | null>(null);
  const [execState, setExecState] = useState<"idle" | "done" | "error">("idle");
  const [execError, setExecError] = useState<string | null>(null);

  const examples = useMemo(
    () => [t("order.agent.ex1"), t("order.agent.ex2"), t("order.agent.ex3"), t("order.agent.ex4"), t("order.agent.ex5")],
    [t]
  );

  const planCtx = useMemo<OrderPlanContext>(
    () => ({
      t,
      total: context.total,
      byStatus: context.byStatus,
      visibleOrders: context.visibleOrders,
      orders: context.orders,
      shopDomain: context.shopDomain,
    }),
    [t, context.total, context.byStatus, context.visibleOrders, context.orders, context.shopDomain]
  );

  const classifyCtx = useMemo<OrderClassifyContext>(
    () => ({ t, orders: context.orders }),
    [t, context.orders]
  );

  const resetTransient = useCallback(() => {
    setPlan(null);
    setClarify(null);
    setExecState("idle");
    setExecError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    resetTransient();

    const result = classifyOrderCommandInput(text, classifyCtx);
    if (result.confidence === "high" && result.draft) {
      setPlan(planOrderCommand(t, result.draft, planCtx));
      return;
    }
    if (result.clarify) {
      setClarify(typeof result.clarify === "string" ? result.clarify : { message: result.clarify.message, candidates: result.clarify.candidates });
    }
  }, [input, resetTransient, classifyCtx, t, planCtx]);

  const executePlan = useCallback(
    (p: OrderCommandPlan) => {
      const exec = resolveOrderCommandExecution(p, planCtx);
      if (!exec) {
        setClarify(p.clarify ?? t("order.agent.cannotExec"));
        setPlan(null);
        setExecState("idle");
        return;
      }
      try {
        switch (exec.type) {
          case "set_tab":
            handlers.onSetTab(exec.tab);
            break;
          case "search":
            handlers.onSetSearch(exec.query);
            break;
          case "reset_filters":
            handlers.onResetFilters();
            break;
          case "set_exception":
            handlers.onSetException(exec.exception);
            break;
          case "set_time_range":
            handlers.onSetTimeRange(exec.timeRange);
            break;
          case "focus_order":
            handlers.onSelectOrder(exec.orderId);
            break;
          case "open_shopify":
            handlers.onSelectOrder(exec.orderId);
            if (typeof window !== "undefined") window.open(exec.url, "_blank", "noreferrer");
            break;
          case "export_csv":
            exportOrdersCsv(exec.orders, t);
            break;
          case "summary":
            break;
        }
        if (exec.type === "summary") {
          setExecState("done"); // 保留 plan 卡片以展示分布
        } else {
          setPlan(null);
          setExecState("done");
        }
      } catch (err) {
        setExecError(err instanceof Error ? err.message : t("order.agent.cannotExec"));
        setExecState("error");
      }
    },
    [handlers, planCtx, t]
  );

  const handleQuick = useCallback(
    (cmd: string) => {
      setInput(cmd);
      const text = cmd.trim();
      resetTransient();
      const result = classifyOrderCommandInput(text, classifyCtx);
      if (result.confidence === "high" && result.draft) {
        setPlan(planOrderCommand(t, result.draft, planCtx));
      } else if (result.clarify) {
        setClarify(typeof result.clarify === "string" ? result.clarify : { message: result.clarify.message, candidates: result.clarify.candidates });
      }
    },
    [classifyCtx, resetTransient, t, planCtx]
  );

  return (
    <section className="space-y-3">
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <p className="text-sm font-semibold text-ink">{t("order.agent.title")}</p>
        <p className="mt-1 text-[11px] leading-5 text-ink-subtle">{t("order.agent.intro")}</p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {examples.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => handleQuick(cmd)}
              className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-medium text-ink-muted hover:border-brand-soft hover:text-brand transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder={t("order.agent.inputPlaceholder")}
            className="flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
            aria-label={t("order.agent.inputPlaceholder")}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {clarify && typeof clarify === "string" ? (
        <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
          {clarify}
        </div>
      ) : null}

      {clarify && typeof clarify !== "string" ? (
        <div className="rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft p-3 text-xs text-warning">
          <div>{clarify.message}</div>
          {clarify.candidates && clarify.candidates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {clarify.candidates.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => handleQuick(c.label)}
                  className="rounded-lg border border-warning/40 bg-surface px-2 py-1 text-[11px] font-medium text-warning hover:border-warning hover:bg-warning-soft transition-colors"
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {plan ? (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
              {plan.operation}
            </span>
            <span className="text-ink-muted">{plan.targetLabel}</span>
          </div>
          {plan.detailLines.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {plan.detailLines.map((line, i) => (
                <li key={i} className="flex gap-2 text-ink-muted">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => executePlan(plan)}
              disabled={!plan.executable}
              className={cn(
                "flex-1 rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium",
                plan.executable
                  ? "bg-brand text-white hover:bg-brand-hover"
                  : "cursor-not-allowed border border-hairline text-ink-subtle"
              )}
            >
              {plan.executable ? t("order.agent.execBtn") : t("order.agent.needMore")}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setExecState("idle");
              }}
              className="rounded-[var(--radius-control)] border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              {t("order.filter.reset")}
            </button>
          </div>
          {!plan.executable && plan.clarify ? (
            <p className="mt-2 text-[11px] text-warning">{plan.clarify}</p>
          ) : null}
        </div>
      ) : null}

      {execState === "done" ? (
        <div className="flex items-center gap-1.5 rounded-[var(--radius-card)] border border-success/30 bg-success-soft p-3 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {t("order.agent.execDone")}
        </div>
      ) : null}

      {execState === "error" ? (
        <div className="flex items-center gap-1.5 rounded-[var(--radius-card)] border border-destructive/30 bg-destructive-soft p-3 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {execError ?? t("order.agent.cannotExec")}
        </div>
      ) : null}

      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-[11px] leading-5 text-ink-subtle">
        <p className="font-medium text-ink-muted">{t("order.agent.cmdHintTitle")}</p>
        <ul className="mt-1.5 space-y-1">
          <li>• {t("order.agent.cmdHint1")}</li>
          <li>• {t("order.agent.cmdHint2")}</li>
          <li>• {t("order.agent.cmdHint3")}</li>
        </ul>
      </div>
    </section>
  );
}
