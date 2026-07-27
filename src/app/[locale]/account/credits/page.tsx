"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Coins,
  Loader2,
  RefreshCw,
  Sparkles,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  billingApi,
  type CreditBucketBreakdown,
  type CreditLotItem,
  type CreditLotListResponse,
  type CreditOverview,
  type CreditTransactionItem,
  type CreditTransactionListResponse,
} from "@/lib/billing/api";
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
 * Account → Credits (积分明细).
 *
 * Three sections, all on one page:
 *   1. Overview — current credit balance + totals (granted / consumed / expired).
 *   2. Transactions — paginated credit ledger (grant / consume / expire / adjust).
 *      `endpoint` is surfaced so the user can see WHICH feature caused the
 *      consumption (e.g. ad-products/search vs logistics/estimate).
 *   3. Lots — credit batches (subscription / credit_pack / promo / manual)
 *      with consumption & expiry progress.
 */
// 与后端 WELCOME_CREDITS 保持一致（CreditService.WELCOME_CREDITS = 30）。
const WELCOME_CREDITS = 30;

export default function AccountCreditsPage() {
  const t = useT();
  const locale = useLocale();
  const { status, bootstrapping } = useUser();

  // ===== Overview =====
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // L1 用户钱包（双桶：免费 vs 付费；运营中心真实计费口径）
  const [wallet, setWallet] = useState<CreditBucketBreakdown | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  // 欢迎分领取状态（服务端水合，G5e）
  const [welcomeClaimed, setWelcomeClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // 近 7 天每日消耗（绝对值），由流水聚合得出
  const [trend, setTrend] = useState<number[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);

  // ===== Transactions =====
  const [txType, setTxType] = useState<string>("");
  const [transactions, setTransactions] = useState<CreditTransactionItem[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txOffset, setTxOffset] = useState(0);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);
  const TX_PAGE_SIZE = 20;

  // ===== Lots =====
  const [lots, setLots] = useState<CreditLotItem[]>([]);
  const [lotTotal, setLotTotal] = useState(0);
  const [lotOffset, setLotOffset] = useState(0);
  const [lotLoading, setLotLoading] = useState(true);
  const [lotError, setLotError] = useState<string | null>(null);
  const LOT_PAGE_SIZE = 10;

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const o = await billingApi.creditsOverview();
      setOverview(o);
    } catch (err) {
      setOverview(null);
      setOverviewError(readError(err, t));
    } finally {
      setOverviewLoading(false);
    }
  }, [t]);

  const loadWelcomeStatus = useCallback(async () => {
    try {
      const s = await billingApi.welcomeStatus();
      setWelcomeClaimed(Boolean(s.claimed));
    } catch {
      // 水合失败不阻断；领取按钮仍可走 claim 幂等
    }
  }, []);

  const loadWallet = useCallback(async () => {
    setWalletLoading(true);
    setWalletError(null);
    try {
      const w = await billingApi.creditBuckets();
      setWallet(w);
    } catch (err) {
      setWalletError(readError(err, t));
    } finally {
      setWalletLoading(false);
    }
  }, [t]);

  const loadTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const resp: CreditTransactionListResponse = await billingApi.listCreditTransactions({
        limit: 200,
        offset: 0,
      });
      setTrend(aggregate7d(resp.items ?? []));
    } catch {
      setTrend([]);
    } finally {
      setTrendLoading(false);
    }
  }, [t]);

  const loadTransactions = useCallback(
    async (type: string, offset: number) => {
      setTxLoading(true);
      setTxError(null);
      try {
        const resp: CreditTransactionListResponse = await billingApi.listCreditTransactions({
          type: type || undefined,
          limit: TX_PAGE_SIZE,
          offset,
        });
        setTransactions(resp.items ?? []);
        setTxTotal(resp.total ?? 0);
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

  const loadLots = useCallback(
    async (offset: number) => {
      setLotLoading(true);
      setLotError(null);
      try {
        const resp: CreditLotListResponse = await billingApi.listCreditLots({
          limit: LOT_PAGE_SIZE,
          offset,
        });
        setLots(resp.items ?? []);
        setLotTotal(resp.total ?? 0);
        setLotOffset(offset);
      } catch (err) {
        setLotError(readError(err, t));
        setLots([]);
        setLotTotal(0);
      } finally {
        setLotLoading(false);
      }
    },
    [t]
  );

  // 领取欢迎分（F8：账户页入口；幂等，与运营中心一致）。
  const handleClaimWelcome = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      const res = await billingApi.claimWelcome();
      if (res.claimed || res.alreadyClaimed) {
        setWelcomeClaimed(true);
        void loadOverview();
        void loadWallet();
        void loadLots(lotOffset);
      }
    } catch {
      // 静默：失败不影响既有余额展示
    } finally {
      setClaiming(false);
    }
  }, [claiming, loadOverview, loadWallet, loadLots, lotOffset]);

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== "authenticated") return;
    void loadWelcomeStatus();
    void loadOverview();
    void loadWallet();
    void loadTrend();
    void loadTransactions("", 0);
    void loadLots(0);
  }, [bootstrapping, status, loadWelcomeStatus, loadOverview, loadWallet, loadTrend, loadTransactions, loadLots]);

  if (bootstrapping) {
    return <AccountLoadingState message={t("common.loading")} />;
  }

  if (status !== "authenticated") {
    return (
      <AccountSignInState
        icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
        message={t("accountCredits.signInRequired")}
        signInLabel={t("userMenu.signIn")}
        signInHref={localePath(locale, `/login?from=${encodeURIComponent("/account/credits")}`)}
      />
    );
  }

  return (
    <section className="space-y-6">
      <AccountPageHeader
        title={t("accountCredits.title")}
        subtitle={t("accountCredits.subtitle")}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void loadWelcomeStatus();
              void loadOverview();
              void loadWallet();
              void loadTrend();
              void loadTransactions(txType, txOffset);
              void loadLots(lotOffset);
            }}
            disabled={
              overviewLoading ||
              walletLoading ||
              txLoading ||
              lotLoading
            }
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (overviewLoading || walletLoading || txLoading || lotLoading) && "animate-spin"
              )}
            />
            {t("accountCredits.refresh")}
          </Button>
        }
      />

      {/* ===== Overview ===== */}
      <AccountCard>
        {/* ===== 欢迎分领取入口（F8：账户页此前缺入口） ===== */}
        {!welcomeClaimed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-brand-soft bg-brand-soft/40 px-4 py-3">
            <div>
              <p className="text-[12px] font-semibold text-ink">{t("accountCredits.welcomeClaimTitle")}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {t("accountCredits.welcomeClaimDesc", { n: WELCOME_CREDITS })}
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleClaimWelcome}
              disabled={claiming}
            >
              {claiming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("accountCredits.welcomeClaimCta", { n: WELCOME_CREDITS })
              )}
            </Button>
          </div>
        )}

        {/* ===== 用户钱包（L1）— 主余额（运营中心真实计费口径） ===== */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              {t("accountCredits.currentBalance")}
            </p>
            {walletLoading ? (
              <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("accountCredits.loading")}
              </div>
            ) : walletError ? (
              <p className="mt-1 text-[11px] text-destructive">{walletError}</p>
            ) : (
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                {wallet?.balanceCredits ?? 0}{" "}
                <span className="text-[12px] font-normal text-muted-foreground">
                  {t("ops.usage.points")}
                </span>
              </p>
            )}
            {wallet && !walletError && (
              <div className="mt-2">
                {/* 双桶：免费(welcome) vs 付费(subscription+pack+promo) */}
                <div className="flex h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-emerald-500" style={{ width: `${dualPct(wallet).free}%` }} />
                  <div className="h-full bg-brand-accent" style={{ width: `${dualPct(wallet).paid}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    <b className="text-foreground">{wallet.freeCredits.toLocaleString()}</b>{" "}
                    {t("ops.wallet.free")}
                  </span>
                  <span>
                    <b className="text-foreground">{wallet.subscriptionCredits.toLocaleString()}</b>{" "}
                    {t("ops.wallet.subscription")}
                  </span>
                  <span>
                    <b className="text-foreground">{wallet.packCredits.toLocaleString()}</b>{" "}
                    {t("ops.wallet.pack")}
                  </span>
                  <span>
                    <b className="text-foreground">{wallet.promoCredits.toLocaleString()}</b>{" "}
                    {t("ops.wallet.promo")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== 近 7 天消耗趋势（由流水聚合） ===== */}
        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {t("accountCredits.trendTitle")}
          </p>
          {trendLoading ? (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("accountCredits.loading")}
            </div>
          ) : (
            <SevenDayTrend data={trend} locale={locale} />
          )}
        </div>

        <div className="mt-4 border-t border-surface-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
            {t("accountCredits.platformLedger")}
          </p>
          {overviewLoading ? (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("accountCredits.loading")}
            </div>
          ) : overviewError ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {overviewError}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadOverview()}>
                {t("accountCredits.retry")}
              </Button>
            </div>
          ) : overview ? (
            <dl className="mt-2 grid grid-cols-3 gap-3">
              <AccountStatItem
                label={t("accountCredits.totalGranted")}
                value={overview.totalGranted}
                tone="ok"
                icon={<ArrowUp className="h-3 w-3" />}
              />
              <AccountStatItem
                label={t("accountCredits.totalConsumed")}
                value={overview.totalConsumed}
                tone="warn"
                icon={<ArrowDown className="h-3 w-3" />}
              />
              <AccountStatItem
                label={t("accountCredits.totalExpired")}
                value={overview.totalExpired}
                tone="muted"
              />
            </dl>
          ) : null}
        </div>
      </AccountCard>

      {/* ===== Transactions ===== */}
      <AccountCard
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AccountSegmentedFilter
              value={txType}
              onChange={(v) => {
                setTxType(v);
                void loadTransactions(v, 0);
              }}
              options={[
                { value: "", label: t("accountCredits.filterAll") },
                { value: "grant", label: t("accountCredits.filterGrant") },
                { value: "consume", label: t("accountCredits.filterConsume") },
                { value: "expire", label: t("accountCredits.filterExpire") },
              ]}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadTransactions(txType, txOffset)}
              disabled={txLoading}
            >
              <RefreshCw className={txLoading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            </Button>
          </div>
        }
      >
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            {t("accountCredits.sectionTransactions")}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("accountCredits.transactionsHint")}
          </p>
        </div>

        <div className="mt-4">
          {txLoading ? (
            <AccountRowLoading message={t("common.loading")} />
          ) : txError ? (
            <AccountRowError
              title={t("accountCredits.transactionsLoadFailed")}
              message={txError}
            />
          ) : transactions.length === 0 ? (
            <AccountEmptyState message={t("accountCredits.transactionsEmpty")} />
          ) : (
            <>
              <AccountLedgerTable
                columns={[
                  {
                    key: "time",
                    header: t("accountCommon.ledgerCols.time"),
                    render: (tx) => (
                      <span className="text-muted-foreground">
                        {fmtDate(locale, tx.createdAt)}
                      </span>
                    ),
                    sortValue: (tx) => tx.createdAt,
                    sortable: true,
                  },
                  {
                    key: "type",
                    header: t("accountCommon.ledgerCols.type"),
                    render: (tx) => <CreditTxTypeTag type={tx.type} t={t} />,
                  },
                  {
                    key: "endpoint",
                    header: t("accountCommon.ledgerCols.endpoint"),
                    render: (tx) =>
                      tx.endpoint ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {tx.endpoint}
                        </code>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      ),
                  },
                  {
                    key: "bucket",
                    header: t("accountCommon.ledgerCols.bucket"),
                    render: (tx) =>
                      tx.bucket ? <LotSourceTag source={tx.bucket} t={t} /> : (
                        <span className="text-muted-foreground/50">—</span>
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
                          tx.amount >= 0 ? "text-brand-accent" : "text-foreground"
                        )}
                      >
                        {tx.amount >= 0 ? "+" : ""}
                        {tx.amount}
                      </span>
                    ),
                    sortValue: (tx) => tx.amount,
                    sortable: true,
                  },
                  {
                    key: "balance",
                    header: t("accountCommon.ledgerCols.balance"),
                    align: "right",
                    render: (tx) => (
                      <span className="tabular-nums text-muted-foreground">
                        {tx.balanceAfter}
                      </span>
                    ),
                    sortValue: (tx) => tx.balanceAfter,
                    sortable: true,
                  },
                  {
                    key: "note",
                    header: t("accountCommon.ledgerCols.note"),
                    render: (tx) => {
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
                            {tx.refType ? `${tx.refType} · ` : ""}
                            {tx.refId}
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
                minWidth="900px"
              />
              <AccountPagination
                offset={txOffset}
                total={txTotal}
                pageSize={TX_PAGE_SIZE}
                onPage={(offset) => void loadTransactions(txType, offset)}
                t={t}
              />
            </>
          )}
        </div>
      </AccountCard>

      {/* ===== Lots ===== */}
      <AccountCard>
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">
            {t("accountCredits.sectionLots")}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t("accountCredits.lotsHint")}
          </p>
          {!lotLoading && !lotError && lots.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-muted-foreground/70">{t("accountCredits.lotBySource")}:</span>
              {(["subscription", "credit_pack", "promo", "manual", "welcome"] as string[]).map((s) => {
                const total = lots
                  .filter((l) => l.sourceType === s)
                  .reduce((a, l) => a + l.remaining, 0);
                if (total <= 0) return null;
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]"
                  >
                    <LotSourceTag source={s} t={t} />
                    <b className="tabular-nums text-foreground">{total}</b>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          {lotLoading ? (
            <AccountRowLoading message={t("common.loading")} />
          ) : lotError ? (
            <AccountRowError
              title={t("accountCredits.lotsLoadFailed")}
              message={lotError}
            />
          ) : lots.length === 0 ? (
            <AccountEmptyState message={t("accountCredits.lotsEmpty")} />
          ) : (
            <>
              <AccountLedgerTable
                columns={[
                  {
                    key: "source",
                    header: t("accountCommon.ledgerCols.source"),
                    render: (lot) => <LotSourceTag source={lot.sourceType} t={t} />,
                  },
                  {
                    key: "granted",
                    header: t("accountCommon.ledgerCols.granted"),
                    align: "right",
                    render: (lot) => (
                      <span className="tabular-nums text-muted-foreground">
                        {lot.amountGranted}
                      </span>
                    ),
                    sortValue: (lot) => lot.amountGranted,
                    sortable: true,
                  },
                  {
                    key: "consumed",
                    header: t("accountCommon.ledgerCols.consumed"),
                    align: "right",
                    render: (lot) => (
                      <span className="tabular-nums text-muted-foreground">
                        {lot.amountConsumed}
                      </span>
                    ),
                    sortValue: (lot) => lot.amountConsumed,
                    sortable: true,
                  },
                  {
                    key: "expired",
                    header: t("accountCommon.ledgerCols.expired"),
                    align: "right",
                    render: (lot) => (
                      <span className="tabular-nums text-muted-foreground">
                        {lot.amountExpired}
                      </span>
                    ),
                    sortValue: (lot) => lot.amountExpired,
                    sortable: true,
                  },
                  {
                    key: "remaining",
                    header: t("accountCommon.ledgerCols.remaining"),
                    align: "right",
                    render: (lot) => (
                      <span className="font-semibold tabular-nums">
                        {lot.remaining}
                      </span>
                    ),
                    sortValue: (lot) => lot.remaining,
                    sortable: true,
                  },
                  {
                    key: "progress",
                    header: t("accountCommon.ledgerCols.progress"),
                    render: (lot) => (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-brand-accent"
                            style={{ width: `${pctConsumed(lot)}%` }}
                          />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {pctConsumed(lot)}%
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "expiresAt",
                    header: t("accountCommon.ledgerCols.expiresAt"),
                    render: (lot) =>
                      lot.expiresAt ? (
                        <span className="text-muted-foreground">
                          {fmtDate(locale, lot.expiresAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      ),
                    sortValue: (lot) => lot.expiresAt ?? "",
                    sortable: true,
                  },
                ]}
                rows={lots}
                rowKey={(lot) => String(lot.id)}
                zebra
                minWidth="780px"
              />
              <AccountPagination
                offset={lotOffset}
                total={lotTotal}
                pageSize={LOT_PAGE_SIZE}
                onPage={(offset) => void loadLots(offset)}
                t={t}
              />
            </>
          )}
        </div>
      </AccountCard>

      <div className="space-y-1 text-[11px] leading-5 text-muted-foreground/80">
        <p>{t("accountCredits.footnote")}</p>
        <p>
          <a href={localePath(locale, "/account/refund-policy")} className="text-link hover:underline">
            {t("accountCredits.refundPolicyLink")}
          </a>
        </p>
      </div>
    </section>
  );
}

// ===== Local helpers =====

function Detail({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/80">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function pctConsumed(lot: CreditLotItem): number {
  if (lot.amountGranted <= 0) return 0;
  const used = lot.amountConsumed + lot.amountExpired;
  if (used <= 0) return 0;
  if (used >= lot.amountGranted) return 100;
  return Math.round((used / lot.amountGranted) * 100);
}

function CreditTxTypeTag({
  type,
  t,
}: {
  type: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const styles: Record<string, string> = {
    grant: "bg-brand-soft text-brand-accent",
    consume: "bg-amber-50 text-amber-700",
    expire: "bg-muted text-muted-foreground",
    adjust: "bg-sky-50 text-sky-700",
  };
  const icons: Record<string, React.ReactNode> = {
    grant: <ArrowUp className="h-3 w-3" />,
    consume: <ArrowDown className="h-3 w-3" />,
    expire: <Coins className="h-3 w-3" />,
    adjust: <AlertTriangle className="h-3 w-3" />,
  };
  const cls = styles[type] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        cls
      )}
    >
      {icons[type]}
      {creditTxTypeLabel(type, t)}
    </span>
  );
}

function creditTxTypeLabel(type: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (type === "grant") return t("accountCredits.txTypeGrant");
  if (type === "consume") return t("accountCredits.txTypeConsume");
  if (type === "expire") return t("accountCredits.txTypeExpire");
  if (type === "adjust") return t("accountCredits.txTypeAdjust");
  return type;
}

function LotSourceTag({
  source,
  t,
}: {
  source: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const styles: Record<string, string> = {
    subscription: "bg-purple-50 text-purple-700",
    credit_pack: "bg-brand-soft text-brand-accent",
    promo: "bg-emerald-50 text-emerald-700",
    welcome: "bg-emerald-100 text-emerald-800",
    manual: "bg-muted text-muted-foreground",
  };
  const cls = styles[source] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        cls
      )}
    >
      {lotSourceLabel(source, t)}
    </span>
  );
}

function lotSourceLabel(source: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (source === "subscription") return t("accountCredits.lotSourceSubscription");
  if (source === "credit_pack") return t("accountCredits.lotSourceCreditPack");
  if (source === "promo") return t("accountCredits.lotSourcePromo");
  if (source === "welcome") return t("accountCredits.lotSourceWelcome");
  if (source === "manual") return t("accountCredits.lotSourceManual");
  return source;
}

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
    if (err.status === 401) return t("accountCredits.errorUnauthenticated");
    return t("auth.errorUnknown");
  }
  return t("auth.errorUnknown");
}

// ===== D9 helpers =====

/** 双桶占比：免费(welcome) vs 付费(subscription+pack+promo)。 */
function dualPct(w: CreditBucketBreakdown): { free: number; paid: number } {
  const total = w.freeCredits + w.paidCredits;
  if (total <= 0) return { free: 0, paid: 0 };
  return {
    free: Math.round((w.freeCredits / total) * 100),
    paid: Math.round((w.paidCredits / total) * 100),
  };
}

/** 由流水聚合近 7 天每日消耗（绝对值）。 */
function aggregate7d(items: CreditTransactionItem[]): number[] {
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const tx of items) {
    if (tx.type !== "consume") continue;
    const d = new Date(tx.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.floor(
      (today.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000
    );
    if (diff < 0 || diff > 6) continue;
    days[6 - diff] += Math.max(0, -tx.amount);
  }
  return days;
}

function SevenDayTrend({ data, locale }: { data: number[]; locale: string }) {
  const max = Math.max(1, ...data);
  const lang = localeHtmlLang[locale as keyof typeof localeHtmlLang] ?? locale;
  const labels = data.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (data.length - 1 - i));
    return d.toLocaleDateString(lang, { weekday: "short" });
  });
  return (
    <div className="mt-2 flex items-end gap-1.5" style={{ height: 72 }}>
      {data.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[9px] tabular-nums text-muted-foreground">{v > 0 ? v : ""}</span>
          <div
            className="w-full rounded-t bg-brand-accent/70"
            style={{ height: `${Math.max(2, Math.round((v / max) * 44))}px` }}
          />
          <span className="text-[9px] text-muted-foreground/70">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
