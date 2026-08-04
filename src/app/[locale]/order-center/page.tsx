"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { WorkbenchShell } from "@/components/workbench/workbench-shell";
import { WorkbenchPanel } from "@/components/workbench/workbench-panel";
import { AssistantRail } from "@/components/workbench/assistant-rail";
import { WorkbenchSidebar } from "@/components/workbench/workbench-sidebar";
import { useWorkbenchPage } from "@/components/workbench/workbench-page";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { useOnboarding } from "@/context/onboarding-context";
import { resolveShopApiName } from "@/lib/resolve-shop-api-name";
import type { OrderStatus, OrderSummary } from "@/lib/order/types";
import { STATUS_ORDER, countByStatus } from "@/lib/order/state-machine";
import { makeMockOrders } from "@/lib/order/mock";
import {
  fetchOrders,
  invalidateOrderHeadersCache,
  isRecipientIncomplete,
  parseCreatedAt,
  placeDropshipOrder,
  type OrderSource,
} from "@/lib/order/api";
import { buildPackageCreateInfoForOrder, PackageCreateInfoError } from "@/lib/order/build-package-create-info";
import { ApiError } from "@/lib/api";
import { MetricSummaryCards, type MetricSummaryItem, type MetricTone } from "@/components/workbench/metric-summary-cards";
import { SegmentedTabs } from "@/components/workbench/segmented-tabs";
import { Button } from "@/components/ui/button";
import {
  OrderFilterBar,
  type ExceptionFilter,
  type TimeRange,
} from "@/components/order/order-filter-bar";
import { OrderTable } from "@/components/order/order-table";
import { OrderDetailDrawer } from "@/components/order/order-detail-drawer";
import { OrderSkeleton } from "@/components/order/order-skeleton";
import { OrderAgentPanel, type OrderAgentHandlers, type OrderAgentContext } from "@/components/order/order-agent-panel";
import { PaymentModal } from "@/components/order/payment-modal";
import { exportOrdersCsv } from "@/lib/order/export";
import {
  hydrateOrders,
  getBalanceCny,
  setBalanceCny as persistBalanceCny,
  setOrderInternal,
  generateTangbuyOrderNo,
  generateSupplierOrderNo,
} from "@/lib/order/mock-store";
import { deriveAmountUsd } from "@/lib/order/payment";
import { billingApi } from "@/lib/billing/api";
import { RechargeModal } from "@/components/billing/recharge-modal";
import { Download, RefreshCw, ShoppingBag, Clock, Coins, Package, Truck, CheckCircle2 } from "@/lib/ui/icons";

type TabKey = OrderStatus | "all";

const TAB_KEYS: TabKey[] = ["all", ...STATUS_ORDER];

// 顶部状态概览卡：复用开店共享 MetricSummaryCards 的规范（4 色调色板 + 同款卡片形状），不另写视觉。
const STATUS_CARD_DEFS: { key: TabKey; icon: ReactNode; tone: MetricTone }[] = [
  { key: "all", icon: <ShoppingBag className="h-4 w-4" />, tone: "brand" },
  { key: "pendingOrder", icon: <Clock className="h-4 w-4" />, tone: "default" },
  { key: "pendingPayment", icon: <Coins className="h-4 w-4" />, tone: "warning" },
  { key: "preparing", icon: <Package className="h-4 w-4" />, tone: "neutral" },
  { key: "pendingShipment", icon: <Truck className="h-4 w-4" />, tone: "default" },
  { key: "delivered", icon: <CheckCircle2 className="h-4 w-4" />, tone: "default" },
];

function OrderCenterContent() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const wb = useWorkbenchPage("order-center");
  const { shop } = useOnboarding();
  const shopName = resolveShopApiName(shop);

  const [activeTab, setActiveTab] = useState<TabKey>("pendingOrder");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [exception, setException] = useState<ExceptionFilter>("all");
  const [country, setCountry] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | undefined>();
  const [drawerOrderId, setDrawerOrderId] = useState<string | undefined>();
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  // A+ 批：跑通下单/支付流程
  const [placingId, setPlacingId] = useState<string | undefined>();
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<string | undefined>();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [balanceCny, setBalanceCnyState] = useState<number>(() => getBalanceCny());
  // 内部状态版本号：触发 hydrateOrders 重算（仅 mock 阶段需要）
  const [internalVersion, setInternalVersion] = useState(0);
  const refreshInternal = () => setInternalVersion((v) => v + 1);

  // 真实订单优先；本地无后端 / 异常 → fetchOrders 内部回退 mock。
  const [rawOrders, setRawOrders] = useState(() => makeMockOrders());
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<OrderSource>("mock");
  const [loadError, setLoadError] = useState<"backend_unavailable" | "no_shop" | null>(null);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    fetchOrders(shopName)
      .then((res) => {
        if (!alive) return;
        setRawOrders(res.orders);
        setSource(res.source);
        setLoadError(res.error ?? null);
        setLastUpdated(
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [shopName]);

  useEffect(() => load(), [load]);

  // P3.1：从真实后端拉取余额覆盖 mock 默认值（10000 元）。
  // 失败时保持 mock 值，避免阻塞本地联调（如后端未启动 / 未登录）。
  useEffect(() => {
    let alive = true;
    billingApi.overview()
      .then((acc: { balanceCny: number }) => {
        if (!alive) return;
        const yuan = acc.balanceCny / 100;
        // 同步到 localStorage（mock-store）+ 本地 state
        persistBalanceCny(yuan);
        setBalanceCnyState(yuan);
      })
      .catch((err: unknown) => {
        // 静默失败：本地 mock 默认值仍可用
        // eslint-disable-next-line no-console
        console.warn("[billing] load overview failed, fallback to mock:", err);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 内部态（已下单/已支付）merge 进视图订单
  const orders = useMemo(
    () => hydrateOrders(rawOrders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawOrders, internalVersion]
  );

  // 行末「补充货源」➕：未关联的 line 触发。跳到 SKU 对齐页面。
  const handleNeedBindSource = useCallback(
    (line: { outerVariantId?: string; title?: string; sku?: string }) => {
      const params = new URLSearchParams();
      if (line.outerVariantId) params.set("variant", line.outerVariantId);
      if (line.sku) params.set("sku", line.sku);
      const qs = params.toString();
      router.push(localePath(locale, `/sku-align${qs ? `?${qs}` : ""}`));
    },
    [locale, router]
  );

  // 代发下单：组装 packageCreateInfo + 地址门禁；失败诚实提示，不再静默 mock 当真成功
  const handlePlace = useCallback(
    async (order: OrderSummary) => {
      if (order.status !== "pendingOrder") return;
      setPlaceError(null);

      const unbound = (order.lineItems ?? []).some((it) => !it.linkedOffer);
      if ((order.lineItems?.length ?? 0) > 0 && unbound) {
        const first = order.lineItems!.find((it) => !it.linkedOffer);
        if (first) handleNeedBindSource(first);
        return;
      }

      if (!order.recipient || isRecipientIncomplete(order.recipient)) {
        setDrawerOrderId(order.id);
        setPlaceError(t("order.action.needAddress"));
        return;
      }

      if (!shopName) {
        setPlaceError(t("order.action.placeFailed"));
        return;
      }

      setPlacingId(order.id);
      const amountUsd = deriveAmountUsd(order);
      try {
        const packageCreateInfo = await buildPackageCreateInfoForOrder({
          shopName,
          order,
          goodsAmount: amountUsd,
        });
        const res = await placeDropshipOrder({
          shopName,
          outerOrderId: order.shopifyOrderId || order.id,
          orderType: 1,
          packageCreateInfo,
        });
        const tradeNo = res.tradeNo?.trim() || "";
        const tangbuyNo =
          res.tangbuyOrderNo || tradeNo || generateTangbuyOrderNo(order.id);
        const supplierNo = res.lineNos?.[0] || generateSupplierOrderNo(order.id);
        setOrderInternal(order.id, {
          tangbuyOrderNo: tangbuyNo,
          supplierOrderNo: supplierNo,
          placedAt: new Date().toISOString(),
          amountUsd:
            res.payableAmountCny != null ? Number(res.payableAmountCny) : amountUsd,
          paymentStatus: "unpaid",
        });
        setRawOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  status: "pendingPayment",
                  tangbuyOrderNo: tangbuyNo,
                  tradeNo: tradeNo || o.tradeNo,
                  supplierOrderNo: supplierNo,
                  payableAmount:
                    res.payableAmountCny != null
                      ? `CNY ${Number(res.payableAmountCny).toFixed(2)}`
                      : `USD ${amountUsd.toFixed(2)}`,
                  payMethod: "—",
                  paymentStatus: "unpaid",
                }
              : o
          )
        );
        invalidateOrderHeadersCache(shopName);
        refreshInternal();
        // Prefer authoritative list refresh when real backend is available
        if (source === "real") {
          load();
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[order] placeDropshipOrder failed:", err);
        let msg = t("order.action.placeFailed");
        if (err instanceof PackageCreateInfoError) {
          msg =
            err.code === "no_line"
              ? t("order.action.needLogisticsLine")
              : t("order.action.placeFailed");
        } else if (err instanceof ApiError) {
          const m = err.message?.trim();
          if (m?.toLowerCase().includes("shipping address")) {
            msg = t("order.action.needAddress");
            setDrawerOrderId(order.id);
          } else if (m?.toLowerCase().includes("lineid")) {
            msg = t("order.action.needLogisticsLine");
          } else if (m) {
            msg = m;
          }
        }
        setPlaceError(msg);
      } finally {
        setPlacingId(undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopName, handleNeedBindSource, t, source, load]
  );

  // A+ 批：打开支付弹窗
  const handleOpenPayment = useCallback((order: OrderSummary) => {
    if (order.status !== "pendingPayment") return;
    if (!order.tradeNo?.trim()) {
      setPlaceError(t("order.payment.missingTradeNo"));
      return;
    }
    setPaymentOrderId(order.id);
  }, [t]);

  // 支付提交成功 → 刷新列表（信 payCb / draft 状态），不本地硬切 preparing
  const handlePaid = useCallback(
    (_channel: string) => {
      setPaymentOrderId(undefined);
      if (shopName) invalidateOrderHeadersCache(shopName);
      load();
      refreshInternal();
    },
    [shopName, load]
  );

  const paymentOrder = useMemo(
    () => rawOrders.find((o) => o.id === paymentOrderId) ?? null,
    [rawOrders, paymentOrderId]
  );

  const counts = useMemo(() => {
    const byStatus = countByStatus(orders);
    return { all: orders.length, byStatus };
  }, [orders]);

  const statusCards = useMemo<MetricSummaryItem[]>(
    () =>
      STATUS_CARD_DEFS.map(({ key, icon, tone }) => ({
        label: key === "all" ? t("order.all") : t(`order.tabs.${key}`),
        value: key === "all" ? counts.all : (counts.byStatus[key as OrderStatus] ?? 0),
        icon,
        tone,
      })),
    [counts, t]
  );

  // 目的地国选项（从数据动态派生；真实订单头无国家 → 仅「—」）
  const countryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of orders) {
      const code = o.destinationCountry.code || "—";
      if (!map.has(code)) map.set(code, o.destinationCountry.name || "—");
    }
    return Array.from(map, ([code, name]) => ({ code, name }));
  }, [orders]);

  // 诚实化（P0-6/P0-8）：无真实数据时禁用对应筛选，避免假可用控件
  const countryDisabled =
    countryOptions.length === 1 && (countryOptions[0]?.code ?? "—") === "—";
  const stuckDisabled = !orders.some((o) => o.track);

  const drawerOrder = useMemo(
    () => orders.find((o) => o.id === drawerOrderId) ?? null,
    [orders, drawerOrderId]
  );

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
    { label: t("nav.workbench"), href: localePath(locale, "/") },
    { label: t("order.breadcrumb") },
  ];

  const activeTabLabel =
    activeTab === "all" ? t("order.all") : t(`order.tabs.${activeTab}`);

  return (
    <WorkbenchShell
      sidebar={<WorkbenchSidebar />}
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
            <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-[12px]">
              <span className="text-ink-subtle">{t("billing.recharge.currentBalance")}:</span>
              <span className="font-semibold text-ink">CNY {balanceCny.toFixed(2)}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setRechargeOpen(true)}>
              <Coins className="h-3.5 w-3.5" />
              {t("billing.recharge.button")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => exportOrdersCsv(visible, t)}>
              <Download className="h-3.5 w-3.5" />
              {t("order.header.exportBtn")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => load()} title={t("order.header.refreshBtn")} aria-label={t("order.header.refreshBtn")}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
        {...wb.panelProps}
      >
        {loading ? (
          <OrderSkeleton rows={6} />
        ) : (
          <>
            <div className="mb-3">
              <MetricSummaryCards items={statusCards} columns={statusCards.length} />
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
                countryDisabled={countryDisabled}
                stuckDisabled={stuckDisabled}
                onReset={() => {
                  setSearch("");
                  setTimeRange("all");
                  setException("all");
                  setCountry("all");
                }}
                statusLabel={activeTabLabel}
              />
            </div>

            <div className="mb-3">
              <SegmentedTabs
                variant="chip"
                tabs={TAB_KEYS.map((k) => ({
                  id: k,
                  label: k === "all" ? t("order.all") : t(`order.tabs.${k}`),
                  count: k === "all" ? counts.all : (counts.byStatus[k as OrderStatus] ?? 0),
                }))}
                value={activeTab}
                onValueChange={(id) => setActiveTab(id as TabKey)}
              />
            </div>

            {placeError ? (
              <div className="mb-3 flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-destructive/30 bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
                <p className="min-w-0 flex-1">{placeError}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 px-0"
                  title={t("order.drawer.close")}
                  aria-label={t("order.drawer.close")}
                  onClick={() => setPlaceError(null)}
                >
                  ×
                </Button>
              </div>
            ) : null}

            {loadError === "backend_unavailable" ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-hairline bg-surface px-6 py-12 text-center">
                <p className="text-sm font-medium text-ink">
                  {t("order.error.backendUnavailable.title")}
                </p>
                <p className="max-w-md text-[12px] leading-relaxed text-ink-subtle">
                  {t("order.error.backendUnavailable.desc")}
                </p>
                <Button size="sm" variant="secondary" onClick={() => load()}>
                  {t("order.header.refreshBtn")}
                </Button>
              </div>
            ) : (
              <>
                <OrderTable
                  orders={visible}
                  selectedOrderId={selectedOrderId}
                  shopDomain={shopDomain}
                  onRowClick={(o) => setSelectedOrderId(o.id)}
                  onOpenDetail={(o) => setDrawerOrderId(o.id)}
                  onPlace={handlePlace}
                  onOpenPayment={handleOpenPayment}
                  onNeedBindSource={handleNeedBindSource}
                  placingId={placingId}
                />

                {visible.length > 0 && (
                  <p className="mt-3 text-right text-[11px] text-ink-subtle">
                    {t("order.table.total")}: {visible.length}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </WorkbenchPanel>

      <OrderDetailDrawer
        order={drawerOrder}
        shopDomain={shopDomain}
        shopName={shopName}
        onClose={() => setDrawerOrderId(undefined)}
        onPlace={handlePlace}
        onOpenPayment={handleOpenPayment}
        placingId={placingId}
        onRecipientSaved={(orderId, recipient) => {
          setRawOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, recipient } : o))
          );
        }}
      />

      <PaymentModal
        open={!!paymentOrderId}
        order={paymentOrder}
        onClose={() => setPaymentOrderId(undefined)}
        onPaid={handlePaid}
      />

      <RechargeModal
        open={rechargeOpen}
        balanceCny={balanceCny}
        onClose={() => setRechargeOpen(false)}
        onSuccess={(newBalanceYuan: number) => {
          persistBalanceCny(newBalanceYuan);
          setBalanceCnyState(newBalanceYuan);
          setRechargeOpen(false);
        }}
      />
    </WorkbenchShell>
  );
}

export default function OrderCenterPage() {
  return <OrderCenterContent />;
}