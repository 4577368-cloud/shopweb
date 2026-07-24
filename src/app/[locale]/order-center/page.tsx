"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { HubSidebar } from "@/components/workbench/hub-sidebar";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { cn } from "@/lib/utils";
import { HUB_ENABLED } from "@/lib/hub/flags";
import { useOnboarding } from "@/context/onboarding-context";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import type { OrderStatus } from "@/lib/order/types";
import { STATUS_ORDER, countByStatus } from "@/lib/order/state-machine";
import { makeMockOrders } from "@/lib/order/mock";
import { fetchOrders, parseCreatedAt, type OrderSource } from "@/lib/order/api";
import { OrderStatusCards } from "@/components/order/order-status-cards";
import {
  OrderFilterBar,
  type ExceptionFilter,
  type TimeRange,
} from "@/components/order/order-filter-bar";
import { OrderTable } from "@/components/order/order-table";
import { OrderAgentPanel, type OrderAgentHandlers, type OrderAgentContext } from "@/components/order/order-agent-panel";
import { Download, Plus } from "@/lib/ui/icons";

type TabKey = OrderStatus | "all";

const TAB_KEYS: TabKey[] = ["all", ...STATUS_ORDER];

// mock 阶段硬编码的"较昨日"涨跌幅；真实接入后由接口注入
const DELTAS: Partial<Record<TabKey, number>> = {
  all: 12.5,
  pendingOrder: -5.2,
  pendingPayment: 8.1,
  preparing: -3.1,
  pendingShipment: 15.3,
  delivered: 6.7,
};

// 数据源标签（内联，避免再动 i18n 字典）
const SOURCE_LABEL: Record<string, { real: string; mock: string }> = {
  zh: { real: "实时数据", mock: "示例数据" },
  en: { real: "Live data", mock: "Sample data" },
  fr: { real: "Données live", mock: "Exemple" },
  es: { real: "Datos en vivo", mock: "Ejemplo" },
};

function OrderCenterContent() {
  const t = useT();
  const locale = useLocale();
  const wb = useWorkbenchPage("order-center");
  const { shop } = useOnboarding();
  const shopName = resolveShopApiName(shop);

  const [activeTab, setActiveTab] = useState<TabKey>("pendingOrder");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [exception, setException] = useState<ExceptionFilter>("all");
  const [country, setCountry] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();

  // 真实订单优先；本地无后端 / 异常 → fetchOrders 内部回退 mock。
  const [orders, setOrders] = useState(() => makeMockOrders());
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<OrderSource>("mock");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrders(shopName)
      .then((res) => {
        if (!alive) return;
        setOrders(res.orders);
        setSource(res.source);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [shopName]);

  const counts = useMemo(() => {
    const byStatus = countByStatus(orders);
    return { all: orders.length, byStatus };
  }, [orders]);

  // 目的地国选项（从数据动态派生；真实订单头无国家 → 仅「—」）
  const countryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const code = o.destinationCountry.code || "—";
      if (!map.has(code)) map.set(code, o.destinationCountry.name || "—");
    }
    return Array.from(map, ([code, name]) => ({ code, name }));
  }, [orders]);

  const visible = useMemo(() => {
    let list =
      activeTab === "all" ? orders : orders.filter((o) => o.status === activeTab);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (o) =>
          o.shopOrderNo.toLowerCase().includes(q) ||
          o.shopifyOrderId.toLowerCase().includes(q) ||
          o.tangbuyOrderNo.toLowerCase().includes(q) ||
          (o.lineItems ?? []).some(
            (it) =>
              it.title.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
          )
      );
    }
    if (timeRange !== "all") {
      const days = timeRange === "7d" ? 7 : 30;
      const cutoff = Date.now() - days * 86_400_000;
      list = list.filter((o) => {
        const ts = parseCreatedAt(o.createdAt);
        return ts != null && ts >= cutoff;
      });
    }
    if (exception === "noQuote") list = list.filter((o) => o.needsQuote);
    if (exception === "stuck") {
      list = list.filter(
        (o) => o.track && (o.track.domestic.abnormal || o.track.intl.abnormal)
      );
    }
    if (country !== "all") {
      list = list.filter((o) => (o.destinationCountry.code || "—") === country);
    }
    return list;
  }, [orders, activeTab, search, timeRange, exception, country]);

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId),
    [orders, selectedOrderId]
  );

  // 右栏 Copilot 上下文 + 处理器（Phase 6）：操作全部落到真实列表状态。
  const shopDomain = shop?.domain || "your-store.myshopify.com";
  const agentContext = useMemo<OrderAgentContext>(
    () => ({
      total: orders.length,
      byStatus: counts.byStatus,
      visibleOrders: visible,
      orders,
      shopDomain,
    }),
    [orders, counts.byStatus, visible, shopDomain]
  );
  const agentHandlers = useMemo<OrderAgentHandlers>(
    () => ({
      onSetTab: (tab) => setActiveTab(tab),
      onSetSearch: (q) => setSearch(q),
      onSetException: (ex) => setException(ex),
      onSetTimeRange: (tr) => setTimeRange(tr),
      onResetFilters: () => {
        setSearch("");
        setTimeRange("all");
        setException("all");
        setCountry("all");
      },
      onSelectOrder: (id) => setSelectedOrderId(id),
    }),
    []
  );

  const breadcrumbs = [
    { label: t("nav.hub"), href: localePath(locale, "/order-center") },
    { label: t("order.breadcrumb") },
  ];

  const activeTabLabel =
    activeTab === "all" ? t("order.all") : t(`order.tabs.${activeTab}`);

  return (
    <WorkbenchShell
      sidebar={<HubSidebar />}
      rail={
        <AssistantRail
          assistantContent={
            <div className="space-y-3">
              {selectedOrder && (
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
                  <p className="truncate text-sm font-semibold text-ink">
                    {selectedOrder.shopOrderNo}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
                    {selectedOrder.lineItems?.[0]?.title}
                  </p>
                  <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                    <span className="text-ink-subtle">{t("order.table.status")}</span>
                    <span className="text-ink">{activeTabLabel}</span>
                    <span className="text-ink-subtle">{t("order.table.amount")}</span>
                    <span className="tabular-nums text-ink">
                      {selectedOrder.productCost ?? "—"}
                    </span>
                    <span className="text-ink-subtle">
                      {t("order.columns.destination")}
                    </span>
                    <span className="text-ink">
                      {selectedOrder.destinationCountry.name}
                    </span>
                  </div>
                </div>
              )}
              <OrderAgentPanel context={agentContext} handlers={agentHandlers} />
            </div>
          }
        />
      }
      {...wb.shellProps}
    >
      <WorkbenchPanel
        title={t("order.pageTitle")}
        breadcrumbs={breadcrumbs}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-brand/40 hover:text-ink"
            >
              <Download className="h-3.5 w-3.5" />
              {t("order.header.exportBtn")}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-accent-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("order.header.createBtn")}
            </button>
          </div>
        }
        {...wb.panelProps}
      >
        <p className="mb-2 text-sm text-ink-muted">{t("order.header.description")}</p>

        <div className="mb-3 flex items-center gap-2 text-[11px]">
          {loading ? (
            <span className="text-ink-subtle">{t("order.loading")}</span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                source === "real"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {SOURCE_LABEL[locale]?.[source] ?? (source === "real" ? "Live" : "Sample")}
            </span>
          )}
        </div>

        <div className="mb-3">
          <OrderStatusCards
            counts={counts}
            deltas={DELTAS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        <div className="mb-3">
          <OrderFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            exception={exception}
            onExceptionChange={setException}
            country={country}
            onCountryChange={setCountry}
            countryOptions={countryOptions}
            onReset={() => {
              setSearch("");
              setTimeRange("all");
              setException("all");
              setCountry("all");
            }}
            statusLabel={activeTabLabel}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {TAB_KEYS.map((k) => (
            <TabPill
              key={k}
              active={activeTab === k}
              onClick={() => setActiveTab(k)}
            >
              {k === "all" ? t("order.all") : t(`order.tabs.${k}`)}
              {k !== "all" && (
                <span
                  className={cn(
                    "ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    activeTab === k
                      ? "bg-white/20 text-white"
                      : "bg-canvas text-ink-subtle"
                  )}
                >
                  {counts.byStatus[k as OrderStatus] ?? 0}
                </span>
              )}
            </TabPill>
          ))}
        </div>

        <OrderTable
          orders={visible}
          selectedOrderId={selectedOrderId}
          shopDomain={shopDomain}
          onRowClick={(o) => setSelectedOrderId(o.id)}
        />

        {visible.length > 0 && (
          <p className="mt-3 text-right text-[11px] text-ink-subtle">
            {t("order.table.total")}: {visible.length}
          </p>
        )}
      </WorkbenchPanel>
    </WorkbenchShell>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-brand-accent text-white"
          : "border border-hairline bg-surface text-ink-muted hover:border-brand/40 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export default function OrderCenterPage() {
  // 运营中枢仅在本地 / 开发环境可用，生产构建默认不暴露（见 src/lib/hub/flags.ts）。
  if (!HUB_ENABLED) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-8 text-center text-sm text-ink-muted">
        运营中枢（订单中心）当前仅本地 / 开发环境可用，生产环境未开放。
      </div>
    );
  }
  return <OrderCenterContent />;
}