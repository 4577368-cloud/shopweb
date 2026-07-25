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
import { fetchCreditsBalance } from "@/lib/marketing/api";
import type { CreditsBalance } from "@/lib/marketing/types";
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
export default function AccountCreditsPage() {
  const t = useT();
  const locale = useLocale();
  const { status, bootstrapping } = useUser();

  // ===== Overview =====
  const [overview, setOverview] = useState<CreditOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // pipispy 实时 API 额度（剩余数量，与运营中心顶部一致）。按 API key 维度，是最真实的剩余。
  const [apiBalance, setApiBalance] = useState<CreditsBalance | null>(null);
  const [apiBalanceLoading, setApiBalanceLoading] = useState(true);
  const [apiBalanceError, setApiBalanceError] = useState<string | null>(null);

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

  const loadApiBalance = useCallback(async () => {
    setApiBalanceLoading(true);
    setApiBalanceError(null);
    try {
      const b = await fetchCreditsBalance();
      setApiBalance(b);
    } catch (err) {
      setApiBalanceError(readError(err, t));
    } finally {
      setApiBalanceLoading(false);
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

  useEffect(() => {
    if (bootstrapping) return;
    if (status !== "authenticated") return;
    void loadApiBalance();
    void loadOverview();
    void loadTransactions("", 0);
    void loadLots(0);
  }, [bootstrapping, status, loadApiBalance, loadOverview, loadTransactions, loadLots]);

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
              void loadApiBalance();
              void loadOverview();
              void loadTransactions(txType, txOffset);
              void loadLots(lotOffset);
            }}
            disabled={apiBalanceLoading || overviewLoading || txLoading || lotLoading}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (apiBalanceLoading || overviewLoading || txLoading || lotLoading) && "animate-spin"
              )}
            />
            {t("accountCredits.refresh")}
          </Button>
        }
      />

      {/* ===== Overview ===== */}
      <AccountCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-purple-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                {t("accountCredits.currentBalance")}
              </p>
              {apiBalanceLoading ? (
                <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("accountCredits.loading")}
                </div>
              ) : (
                <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
                  {apiBalance?.remainingApiCredits ?? 0}
                </p>
              )}
              {apiBalanceError ? (
                <p className="mt-1 text-[11px] text-destructive">{apiBalanceError}</p>
              ) : apiBalance ? (
                <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground/80">
                  <p>{t("accountCredits.apiSource")}</p>
                  <p className="tabular-nums">
                    {t("accountCredits.monitorRemaining")}:{" "}
                    {apiBalance.remainingMonitorCredits.toLocaleString()}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
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
              <ul className="divide-y divide-surface-border">
                {transactions.map((tx) => (
                  <li key={tx.id} className="py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CreditTxTypeTag type={tx.type} t={t} />
                          {tx.endpoint ? (
                            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                              {tx.endpoint}
                            </code>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground/80">
                            {fmtDate(locale, tx.createdAt)}
                          </span>
                        </div>
                        {tx.remark ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={tx.remark}>
                            {tx.remark}
                          </p>
                        ) : null}
                        {tx.refId ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                            {tx.refType ?? ""} · {tx.refId}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-[13px] font-semibold tabular-nums",
                            tx.amount >= 0 ? "text-brand-accent" : "text-foreground"
                          )}
                        >
                          {tx.amount >= 0 ? "+" : ""}
                          {tx.amount}
                        </p>
                        <p className="text-[10px] tabular-nums text-muted-foreground/80">
                          {t("accountCredits.balanceAfterPlatform")}: {tx.balanceAfter}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
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
              <ul className="divide-y divide-surface-border">
                {lots.map((lot) => (
                  <li key={lot.id} className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <LotSourceTag source={lot.sourceType} t={t} />
                          <span className="text-[10px] text-muted-foreground/80">
                            {fmtDate(locale, lot.createdAt)}
                          </span>
                          {lot.expiresAt ? (
                            <span className="text-[10px] text-muted-foreground/80">
                              · {t("accountCredits.expiresAt")} {fmtDate(locale, lot.expiresAt)}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                          <Detail label={t("accountCredits.lotGranted")} value={lot.amountGranted} />
                          <Detail label={t("accountCredits.lotConsumed")} value={lot.amountConsumed} />
                          <Detail label={t("accountCredits.lotExpired")} value={lot.amountExpired} />
                          <Detail label={t("accountCredits.lotRemaining")} value={lot.remaining} />
                        </div>
                        {/* Consumption progress bar */}
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-brand-accent"
                            style={{
                              width: `${pctConsumed(lot)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
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
        <p>{t("accountCredits.footnoteLedger")}</p>
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
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return t("auth.errorUnknown");
}
