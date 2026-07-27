"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  billingApi,
  centsToYuan,
  type AccountOverview,
  type PaymentOrderItem,
  type PaymentOrderListResponse,
  type PaymentOrderStatus,
  type TransactionItem,
  type TransactionListResponse,
} from "@/lib/billing/api";
import { RechargeModal } from "@/components/billing/recharge-modal";
import { useUser } from "@/context/user-context";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { localeHtmlLang } from "@/i18n/config";
import { cn } from "@/lib/utils";
import {
  AccountCard,
  AccountEmptyState,
  AccountLoadingState,
  AccountPageHeader,
  AccountRowError,
  AccountRowLoading,
  AccountSignInState,
} from "@/components/account/account-primitives";
import {
  AccountLedgerTable,
  AccountPagination,
  AccountSegmentedFilter,
  AccountStatItem,
} from "@/components/account/account-data";

/**
 * Account → Bills (账单).
 *
 * Three sections, all on one page:
 *   1. Overview — current balance + totals (recharged / consumed / refunded).
 *   2. Balance ledger — paginated transactions with a business-behavior
 *      filter. Each row surfaces a behavior tag derived from
 *      `type + refType` (订单支付 / 订单退款 / 超时赔付 / 订单补款 /
 *      订阅扣费 / 余额充值 / 人工调整). refId is shown when present so the
 *      user can correlate the movement with a concrete order/subscription.
 *   3. Payment orders — paginated PayPal orders, with status filter.
 *
 * The behavior tag mapping is intentionally frontend-only — the backend
 * already stores `refType` as free-form text, so adding a new behavior just
 * means extending `BEHAVIOR_META` below, no schema change required.
 */
export default function AccountBillsPage() {
  const t = useT();
  const locale = useLocale();
  const { status, bootstrapping } = useUser();

  // ===== Overview =====
  const [overview, setOverview] = useState<AccountOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);

  // ===== Transactions =====
  const [txBehavior, setTxBehavior] = useState<string>("");
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const TX_PAGE_SIZE = 20;

  // ===== Payment orders =====
  const [orderStatus, setOrderStatus] = useState<string>("");
  const [orders, setOrders] = useState<PaymentOrderItem[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderOffset, setOrderOffset] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const ORDER_PAGE_SIZE = 10;

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const o = await billingApi.overview();
      setOverview(o);
    } catch (err) {
      setOverviewError(readError(err, t));
    } finally {
      setOverviewLoading(false);
    }
  }, [t]);

  const loadTransactions = useCallback(
    async (behavior: string, offset: number) => {
      setTxLoading(true);
      setTxError(null);
      try {
        // Backend filters by `type` (recharge/consume/refund/adjust). The
        // behavior filter on the UI is a higher-level concept that maps to
        // `type + refType`. For now we filter client-side by refType after
        // fetching by type, since the backend does not support refType filter.
        // Map behavior → type to narrow the fetch:
        const typeFilter = behaviorToType(behavior);
        const resp: TransactionListResponse = await billingApi.listTransactions({
          type: typeFilter || undefined,
          limit: TX_PAGE_SIZE,
          offset,
        });
        const all = resp.items ?? [];
        // Apply secondary refType filter if behavior implies a specific refType.
        const refTypeFilter = behaviorToRefType(behavior);
        const filtered = refTypeFilter
          ? all.filter((tx) => tx.refType === refTypeFilter)
          : all;
        setTransactions(filtered);
        // Note: when refType filter is applied, `total` is no longer accurate
        // (backend total reflects type only). We surface the visible count
        // instead and let pagination be conservative.
        setTxTotal(refTypeFilter ? filtered.length : resp.total ?? 0);
        setTxOffset(offset);
      } catch (err) {
        setTxError(readError(err, t));
        setTransactions([]);
        setTxTotal(0);
      } finally {
        setTxLoading(false);
      }
    },
    [t]
  );

  const loadOrders = useCallback(
    async (statusFilter: string, offset: number) => {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const resp: PaymentOrderListResponse = await billingApi.listPaymentOrders({
          status: statusFilter || undefined,
          limit: ORDER_PAGE_SIZE,
          offset,
        });
        setOrders(resp.items ?? []);
        setOrderTotal(resp.total ?? 0);
        setOrderOffset(offset);
      } catch (err) {
        setOrdersError(readError(err, t));
        setOrders([]);
        setOrderTotal(0);
      } finally {
        setOrdersLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== "authenticated") return;
    void loadOverview();
    void loadTransactions("", 0);
    void loadOrders("", 0);
  }, [bootstrapping, status, loadOverview, loadTransactions, loadOrders]);

  const handleRechargeSuccess = (newBalanceYuan: number) => {
    setRechargeOpen(false);
    void loadOverview();
    void loadTransactions(txBehavior, 0);
    void loadOrders("", 0);
    if (overview) {
      setOverview({
        ...overview,
        balanceCny: Math.round(newBalanceYuan * 100),
      });
    }
  };

  const balanceYuan = overview ? Number(overview.balanceCny) / 100 : 0;

  // Behavior filter options — derived from BEHAVIOR_META keys.
  const behaviorOptions = useMemo(
    () => [
      { value: "", label: t("accountBills.filterAll") },
      { value: "recharge", label: t("accountBills.behaviorRecharge") },
      { value: "order_payment", label: t("accountBills.behaviorOrderPayment") },
      { value: "order_refund", label: t("accountBills.behaviorOrderRefund") },
      { value: "order_supplement", label: t("accountBills.behaviorOrderSupplement") },
      { value: "timeout_compensation", label: t("accountBills.behaviorTimeoutCompensation") },
      { value: "subscription", label: t("accountBills.behaviorSubscription") },
    ],
    [t]
  );

  if (bootstrapping) {
    return <AccountLoadingState message={t("common.loading")} />;
  }

  if (status !== "authenticated") {
    return (
      <AccountSignInState
        icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        message={t("accountBills.signInRequired")}
        signInLabel={t("userMenu.signIn")}
        signInHref={localePath(locale, `/login?from=${encodeURIComponent("/account/bills")}`)}
      />
    );
  }

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("accountBills.title")}
        subtitle={t("accountBills.subtitle")}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadOverview()}
              disabled={overviewLoading}
            >
              <RefreshCw className={overviewLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              {t("accountBills.refresh")}
            </Button>
            <Button type="button" size="sm" onClick={() => setRechargeOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              {t("accountBills.recharge")}
            </Button>
          </>
        }
      />

      {/* ===== Overview ===== */}
      <AccountCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-accent">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                {t("accountBills.currentBalance")}
              </p>
              {overviewLoading ? (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("accountBills.loading")}
                </div>
              ) : (
                <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                  CNY {balanceYuan.toFixed(2)}
                </p>
              )}
              {overviewError ? (
                <p className="mt-1 text-[11px] text-destructive">{overviewError}</p>
              ) : null}
            </div>
          </div>
        </div>

        {overview ? (
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <AccountStatItem
              label={t("accountBills.totalRecharged")}
              value={centsToYuan(overview.totalRecharged)}
              tone="ok"
              icon={<ArrowUp className="h-3 w-3" />}
            />
            <AccountStatItem
              label={t("accountBills.totalConsumed")}
              value={centsToYuan(overview.totalConsumed)}
              tone="warn"
              icon={<ArrowDown className="h-3 w-3" />}
            />
            <AccountStatItem
              label={t("accountBills.totalRefunded")}
              value={centsToYuan(overview.totalRefunded)}
              tone="muted"
            />
          </dl>
        ) : null}
      </AccountCard>

      {/* ===== Balance ledger ===== */}
      <AccountCard
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AccountSegmentedFilter
              value={txBehavior}
              onChange={(v) => {
                setTxBehavior(v);
                void loadTransactions(v, 0);
              }}
              options={behaviorOptions}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadTransactions(txBehavior, txOffset)}
              disabled={txLoading}
            >
              <RefreshCw className={txLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            </Button>
          </div>
        }
      >
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            {t("accountBills.sectionTransactions")}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("accountBills.transactionsHint")}
          </p>
        </div>

        <div className="mt-4">
          {txLoading ? (
            <AccountRowLoading message={t("common.loading")} />
          ) : txError ? (
            <AccountRowError
              title={t("accountBills.transactionsLoadFailed")}
              message={txError}
            />
          ) : transactions.length === 0 ? (
            <AccountEmptyState message={t("accountBills.transactionsEmpty")} />
          ) : (
            <>
              <AccountLedgerTable
                columns={[
                  {
                    key: "time",
                    header: t("accountCommon.ledgerCols.time"),
                    render: (tx) => (
                      <span className="text-muted-foreground">{fmtDate(locale, tx.createdAt)}</span>
                    ),
                    sortValue: (tx) => tx.createdAt,
                    sortable: true,
                  },
                  {
                    key: "type",
                    header: t("accountCommon.ledgerCols.type"),
                    render: (tx) => (
                      <BehaviorTag behavior={classifyBehavior(tx)} t={t} />
                    ),
                  },
                  {
                    key: "amount",
                    header: t("accountCommon.ledgerCols.amount"),
                    align: "right",
                    render: (tx) => (
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          tx.amountCny >= 0 ? "text-brand-accent" : "text-foreground"
                        )}
                      >
                        {tx.amountCny >= 0 ? "+" : ""}
                        {centsToYuan(tx.amountCny)}
                      </span>
                    ),
                    sortValue: (tx) => tx.amountCny,
                    sortable: true,
                  },
                  {
                    key: "balance",
                    header: t("accountCommon.ledgerCols.balance"),
                    align: "right",
                    render: (tx) => (
                      <span className="tabular-nums text-muted-foreground">
                        {centsToYuan(tx.balanceAfter)}
                      </span>
                    ),
                    sortValue: (tx) => tx.balanceAfter,
                    sortable: true,
                  },
                  {
                    key: "note",
                    header: t("accountCommon.ledgerCols.note"),
                    render: (tx) => {
                      const behavior = classifyBehavior(tx);
                      if (tx.remark) {
                        return (
                          <span className="text-muted-foreground" title={tx.remark}>
                            {tx.remark}
                          </span>
                        );
                      }
                      if (tx.refId) {
                        return (
                          <span className="text-muted-foreground/80">
                            {behaviorRefLabel(behavior, t)}: {tx.refId}
                          </span>
                        );
                      }
                      return <span className="text-muted-foreground/50">—</span>;
                    },
                  },
                ]}
                rows={transactions}
                rowKey={(tx) => String(tx.id)}
                zebra
                minWidth="700px"
              />
              <AccountPagination
                offset={txOffset}
                total={txTotal}
                pageSize={TX_PAGE_SIZE}
                onPage={(offset) => void loadTransactions(txBehavior, offset)}
                t={t}
              />
            </>
          )}
        </div>
      </AccountCard>

      {/* ===== Payment orders ===== */}
      <AccountCard
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AccountSegmentedFilter
              value={orderStatus}
              onChange={(v) => {
                setOrderStatus(v);
                void loadOrders(v, 0);
              }}
              options={[
                { value: "", label: t("accountBills.filterAll") },
                { value: "captured", label: t("accountBills.filterCaptured") },
                { value: "capturing", label: t("accountBills.filterCapturing") },
                { value: "failed", label: t("accountBills.filterFailed") },
              ]}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadOrders(orderStatus, orderOffset)}
              disabled={ordersLoading}
            >
              <RefreshCw className={ordersLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            </Button>
          </div>
        }
      >
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            {t("accountBills.sectionOrders")}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("accountBills.ordersHint")}
          </p>
        </div>

        <div className="mt-4">
          {ordersLoading ? (
            <AccountRowLoading message={t("common.loading")} />
          ) : ordersError ? (
            <AccountRowError
              title={t("accountBills.ordersLoadFailed")}
              message={ordersError}
            />
          ) : orders.length === 0 ? (
            <AccountEmptyState message={t("accountBills.ordersEmpty")} />
          ) : (
            <>
              <AccountLedgerTable
                columns={[
                  {
                    key: "time",
                    header: t("accountCommon.ledgerCols.time"),
                    render: (o) => (
                      <span className="text-muted-foreground">
                        {fmtDate(locale, o.createdAt)}
                      </span>
                    ),
                    sortValue: (o) => o.createdAt,
                    sortable: true,
                  },
                  {
                    key: "purpose",
                    header: t("accountCommon.ledgerCols.purpose"),
                    render: (o) => (
                      <span className="font-medium">{orderPurposeLabel(o.purpose, t)}</span>
                    ),
                  },
                  {
                    key: "status",
                    header: t("accountCommon.ledgerCols.status"),
                    render: (o) => <OrderStatusBadge status={o.status} t={t} />,
                  },
                  {
                    key: "amount",
                    header: t("accountCommon.ledgerCols.amount"),
                    align: "right",
                    render: (o) => (
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">
                          ${(Number(o.amountUsdCents) / 100).toFixed(2)}
                        </p>
                        {o.amountCnyCents != null ? (
                          <p className="text-[10px] tabular-nums text-muted-foreground/80">
                            = CNY {centsToYuan(o.amountCnyCents)}
                          </p>
                        ) : null}
                      </div>
                    ),
                    sortValue: (o) => o.amountUsdCents,
                    sortable: true,
                  },
                  {
                    key: "paymentId",
                    header: t("accountCommon.ledgerCols.paymentId"),
                    render: (o) => (
                      <code
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                        title={o.paypalOrderId}
                      >
                        {o.paypalOrderId}
                        {o.paypalCaptureId ? ` / ${o.paypalCaptureId}` : ""}
                      </code>
                    ),
                  },
                  {
                    key: "refId",
                    header: t("accountCommon.ledgerCols.refId"),
                    render: (o) =>
                      o.refId ? (
                        <span className="text-muted-foreground">{o.refId}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      ),
                  },
                ]}
                rows={orders}
                rowKey={(o) => String(o.id)}
                zebra
                minWidth="780px"
              />
              <AccountPagination
                offset={orderOffset}
                total={orderTotal}
                pageSize={ORDER_PAGE_SIZE}
                onPage={(offset) => void loadOrders(orderStatus, offset)}
                t={t}
              />
            </>
          )}
        </div>
      </AccountCard>

      <p className="text-[11px] leading-5 text-muted-foreground/80">
        {t("accountBills.footnote")}
      </p>

      {/* Recharge modal — reuses the existing PayPal flow. */}
      <RechargeModal
        open={rechargeOpen}
        balanceCny={balanceYuan}
        onClose={() => setRechargeOpen(false)}
        onSuccess={handleRechargeSuccess}
      />
    </section>
  );
}

// ===== Behavior classification =====

type Behavior =
  | "recharge"
  | "order_payment"
  | "order_refund"
  | "order_supplement"
  | "timeout_compensation"
  | "subscription"
  | "adjust"
  | "unknown";

/**
 * Map a transaction row to a business behavior.
 *
 * `type` is the coarse backend enum (recharge/consume/refund/adjust).
 * `refType` is free-form text written by whichever service recorded the
 * transaction. We rely on refType to discriminate the fine-grained behavior.
 *
 * Adding a new behavior only requires extending this map + the i18n keys.
 */
function classifyBehavior(tx: TransactionItem): Behavior {
  const ref = (tx.refType ?? "").toLowerCase();
  if (tx.type === "recharge") return "recharge";
  if (tx.type === "adjust") return "adjust";

  // Consume variants
  if (tx.type === "consume") {
    if (ref.includes("subscription")) return "subscription";
    if (ref.includes("supplement")) return "order_supplement";
    if (ref.includes("order")) return "order_payment";
    return "order_payment"; // default consume = order payment
  }

  // Refund variants
  if (tx.type === "refund") {
    if (ref.includes("compensation") || ref.includes("timeout")) {
      return "timeout_compensation";
    }
    return "order_refund";
  }

  return "unknown";
}

/** Map behavior → backend `type` filter (used to narrow the API call). */
function behaviorToType(behavior: string): string | null {
  if (!behavior) return null;
  if (behavior === "recharge") return "recharge";
  if (behavior === "adjust") return "adjust";
  if (behavior === "order_refund" || behavior === "timeout_compensation") return "refund";
  if (
    behavior === "order_payment" ||
    behavior === "order_supplement" ||
    behavior === "subscription"
  ) {
    return "consume";
  }
  return null;
}

/** Map behavior → expected `refType` substring for client-side secondary filter. */
function behaviorToRefType(behavior: string): string | null {
  if (behavior === "order_supplement") return "supplement";
  if (behavior === "timeout_compensation") return "compensation";
  if (behavior === "subscription") return "subscription";
  return null;
}

function BehaviorTag({
  behavior,
  t,
}: {
  behavior: Behavior;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const styles: Record<Behavior, string> = {
    recharge: "bg-brand-soft text-brand-accent",
    order_payment: "bg-amber-50 text-amber-700",
    order_refund: "bg-emerald-50 text-emerald-700",
    order_supplement: "bg-orange-50 text-orange-700",
    timeout_compensation: "bg-sky-50 text-sky-700",
    subscription: "bg-purple-50 text-purple-700",
    adjust: "bg-muted text-muted-foreground",
    unknown: "bg-muted text-muted-foreground",
  };
  const label = behaviorLabel(behavior, t);
  const icon = behavior === "recharge" || behavior === "order_refund" ||
    behavior === "timeout_compensation" ? (
    <ArrowUp className="h-3 w-3" />
  ) : behavior === "order_payment" || behavior === "order_supplement" ||
    behavior === "subscription" ? (
    <ArrowDown className="h-3 w-3" />
  ) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        styles[behavior]
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function behaviorLabel(b: Behavior, t: (key: string) => string): string {
  if (b === "recharge") return t("accountBills.behaviorRecharge");
  if (b === "order_payment") return t("accountBills.behaviorOrderPayment");
  if (b === "order_refund") return t("accountBills.behaviorOrderRefund");
  if (b === "order_supplement") return t("accountBills.behaviorOrderSupplement");
  if (b === "timeout_compensation") return t("accountBills.behaviorTimeoutCompensation");
  if (b === "subscription") return t("accountBills.behaviorSubscription");
  if (b === "adjust") return t("accountBills.behaviorAdjust");
  return t("accountBills.behaviorUnknown");
}

function behaviorRefLabel(b: Behavior, t: (key: string) => string): string {
  if (b === "order_payment" || b === "order_refund" || b === "order_supplement") {
    return t("accountBills.refOrder");
  }
  if (b === "timeout_compensation") return t("accountBills.refOrder");
  if (b === "subscription") return t("accountBills.refSubscription");
  if (b === "recharge") return t("accountBills.refPayment");
  return t("accountBills.refId");
}

// ===== Payment-order helpers =====

function orderPurposeLabel(purpose: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (purpose === "order_payment") return t("accountBills.purposeOrderPayment");
  if (purpose === "balance_recharge") return t("accountBills.purposeRecharge");
  return purpose;
}

function OrderStatusBadge({
  status,
  t,
}: {
  status: PaymentOrderStatus;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const styles: Record<string, string> = {
    captured: "bg-brand-soft text-brand-accent",
    failed: "bg-red-50 text-red-700",
    capturing: "bg-amber-50 text-amber-700",
    approved: "bg-sky-50 text-sky-700",
    created: "bg-muted text-muted-foreground",
  };
  const cls = styles[status] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        cls
      )}
    >
      {status === "captured" ? <CheckCircle2 className="h-3 w-3" /> : null}
      {orderStatusLabel(status, t)}
    </span>
  );
}

function orderStatusLabel(status: PaymentOrderStatus, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (status === "captured") return t("accountBills.orderStatusCaptured");
  if (status === "capturing") return t("accountBills.orderStatusCapturing");
  if (status === "approved") return t("accountBills.orderStatusApproved");
  if (status === "created") return t("accountBills.orderStatusCreated");
  if (status === "failed") return t("accountBills.orderStatusFailed");
  return status;
}

// ===== Formatters =====

function fmtDate(locale: string, iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const htmlLang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  return d.toLocaleString(htmlLang, { hour12: false });
}

function readError(err: unknown, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return t("auth.errorNetwork");
    if (err.status === 401) return t("accountBills.errorUnauthenticated");
    return t("auth.errorUnknown");
  }
  return t("auth.errorUnknown");
}
