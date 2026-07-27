// 运营中心 · 余额指示器（紧凑头部）。
// 真实模式：显示「用户钱包」积分（billing/credits/buckets），双桶拆分于悬停卡；
// mock 模式：显示 pipispy API 账户余额（沿用旧模型）。
"use client";

import { useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreditBucketBreakdown } from "@/lib/billing/api";
import type { MarketingContext, ConsumeSyncError } from "@/hooks/use-marketing-runner";

interface CreditsIndicatorProps {
  /** mock 模式：pipispy API 账户剩余。 */
  apiRemaining?: number;
  monitorRemaining?: number;
  /** 真实模式：用户钱包（双桶）。非空即优先显示。 */
  wallet?: CreditBucketBreakdown | null;
  context: MarketingContext;
  consumeError?: ConsumeSyncError | null;
  onOpenUsage?: () => void;
  onOpenBilling?: () => void;
  onFetch?: () => void;
  fetchDisabled?: boolean;
  className?: string;
}

export function CreditsIndicator({
  apiRemaining,
  monitorRemaining,
  wallet,
  context,
  consumeError,
  onOpenUsage,
  onOpenBilling,
  onFetch,
  fetchDisabled,
  className,
}: CreditsIndicatorProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const usingWallet = !!wallet;
  const balance = usingWallet ? wallet!.balanceCredits : (apiRemaining ?? 0);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="relative"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1.5 text-xs shadow-sm transition-colors hover:bg-surface-muted",
            consumeError ? "border-warning" : "border-hairline"
          )}
          onClick={usingWallet ? onOpenBilling : onOpenUsage}
          title={usingWallet ? t("ops.wallet.label") : t("ops.credits.label")}
        >
          <span className="text-ink-subtle">{usingWallet ? t("ops.wallet.label") : t("ops.credits.label")}</span>
          <span className={cn("font-semibold tabular-nums", consumeError ? "text-warning" : "text-brand")}>
            {balance.toLocaleString()} {t("ops.usage.points")}
          </span>
          {consumeError && <span className="text-warning" title={t("ops.credits.syncErrorTooltip")}>!</span>}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-20 mt-1.5 w-60 rounded-[var(--radius-card)] border border-hairline bg-surface p-2.5 shadow-card">
            <div className="space-y-1.5 text-xs">
              {usingWallet ? (
                <>
                  <Row label={t("ops.wallet.free")} value={`${wallet!.freeCredits.toLocaleString()} ${t("ops.usage.points")}`} />
                  <Row label={t("ops.wallet.paid")} value={`${wallet!.paidCredits.toLocaleString()} ${t("ops.usage.points")}`} />
                  <div className="my-1.5 border-t border-hairline" />
                  <Row label={t("ops.wallet.subscription")} value={`${wallet!.subscriptionCredits.toLocaleString()} ${t("ops.usage.points")}`} />
                  <Row label={t("ops.wallet.pack")} value={`${wallet!.packCredits.toLocaleString()} ${t("ops.usage.points")}`} />
                  <Row label={t("ops.wallet.promo")} value={`${wallet!.promoCredits.toLocaleString()} ${t("ops.usage.points")}`} />
                </>
              ) : (
                <>
                  <Row label={t("ops.credits.apiRemaining")} value={`${(apiRemaining ?? 0).toLocaleString()} ${t("ops.usage.points")}`} />
                  <Row label={t("ops.credits.monitorRemaining")} value={`${(monitorRemaining ?? 0).toLocaleString()} ${t("ops.usage.points")}`} />
                </>
              )}
              <div className="my-1.5 border-t border-hairline" />
              <Row
                label={t("ops.contextBar.estimate")}
                value={context.estimate == null ? "—" : `~${context.estimate} ${t("ops.usage.points")}`}
              />
              <Row
                label={t("ops.contextBar.lastActual")}
                value={context.lastActual == null ? "—" : `${context.lastActual} ${t("ops.usage.points")}`}
              />
              <Row
                label={t("ops.contextBar.cache")}
                value={
                  context.cacheHit == null
                    ? "—"
                    : context.cacheHit
                      ? t("ops.contextBar.cacheHit")
                      : t("ops.contextBar.miss")
                }
              />
              {consumeError && (
                <>
                  <div className="my-1.5 border-t border-hairline" />
                  <div className="rounded bg-warning-soft px-2 py-1 text-[11px] text-warning">
                    {t("ops.credits.syncError", { endpoint: consumeError.endpoint, amount: consumeError.amount })}
                  </div>
                </>
              )}
              <div className="my-1.5 border-t border-hairline" />
              {usingWallet ? (
                <button
                  type="button"
                  onClick={onOpenBilling}
                  className="w-full rounded-[var(--radius-control)] bg-brand-soft px-2 py-1.5 text-left text-[11px] font-medium text-brand-strong hover:bg-brand-soft/70"
                >
                  {t("ops.billing.open")} →
                </button>
              ) : (
                onOpenUsage && (
                  <button
                    type="button"
                    onClick={onOpenUsage}
                    className="w-full rounded-[var(--radius-control)] bg-surface-muted px-2 py-1.5 text-left text-[11px] font-medium text-ink hover:bg-surface-hover"
                  >
                    {t("ops.credits.viewUsage")} →
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
      {onFetch && (
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={fetchDisabled}
          onClick={onFetch}
          title={t("ops.fetch.get")}
          aria-label={t("ops.fetch.get")}
        >
          {t("ops.fetch.get")}
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-subtle">{label}</span>
      <span className="tabular-nums text-ink">{value}</span>
    </div>
  );
}
