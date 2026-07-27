// 用量明细抽屉（设计 §5.3 / 原型）：最近分录列表 + 汇总。
"use client";

import { useT } from "@/i18n/LocaleProvider";
import type { CreditsBalance, UsageEntry } from "@/lib/marketing/types";
import type { CreditBucketBreakdown } from "@/lib/billing/api";
import { Drawer } from "./drawer";
import { MiniBar } from "./intel";

interface UsageDrawerProps {
  open: boolean;
  entries: UsageEntry[];
  sessionUsed: number;
  account?: CreditsBalance | null;
  wallet?: CreditBucketBreakdown | null;
  onClose: () => void;
}

export function UsageDrawer({ open, entries, sessionUsed, account, wallet, onClose }: UsageDrawerProps) {
  const t = useT();
  // 缓存命中省下的调用次数（每次命中相当于避免一次消耗）。
  const savedCalls = entries.filter((e) => e.cacheHit).length;
  const total = account?.totalApiCredits ?? 0;
  const remaining = account?.remainingApiCredits ?? 0;
  const usedTotal = total > 0 ? total - remaining : 0;
  const pct = total > 0 ? usedTotal / total : 0;
  const mTotal = account?.totalMonitorCredits ?? 0;
  const mRemaining = account?.remainingMonitorCredits ?? 0;
  const mUsed = mTotal > 0 ? mTotal - mRemaining : 0;
  const mPct = mTotal > 0 ? mUsed / mTotal : 0;
  return (
    <Drawer open={open} onClose={onClose} title={t("ops.usageDrawer.title")} widthClass="max-w-xl">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <p className="text-[10px] text-ink-subtle">{t("ops.usageDrawer.totalUsed")}</p>
          <p className="text-sm font-semibold text-ink">{sessionUsed} {t("ops.usage.points")}</p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <p className="text-[10px] text-ink-subtle">{t("ops.usageDrawer.totalSaved")}</p>
          <p className="text-sm font-semibold text-success">{savedCalls} {t("ops.usage.points")}</p>
        </div>
      </div>

      {wallet && (
        <div className="mb-3 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink-subtle">{t("ops.wallet.label")}</span>
            <span className="tabular-nums text-ink">{wallet.balanceCredits.toLocaleString()} {t("ops.usage.points")}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-muted">
            <span>{t("ops.wallet.free")} <b className="text-ink">{wallet.freeCredits}</b></span>
            <span>{t("ops.wallet.subscription")} <b className="text-ink">{wallet.subscriptionCredits}</b></span>
            <span>{t("ops.wallet.pack")} <b className="text-ink">{wallet.packCredits}</b></span>
            {wallet.promoCredits > 0 && (
              <span>{t("ops.wallet.promo")} <b className="text-ink">{wallet.promoCredits}</b></span>
            )}
          </div>
        </div>
      )}

      {total > 0 && (
        <div className="mb-3 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink-subtle">{t("ops.credits.label")}</span>
            <span className="tabular-nums text-ink">{remaining.toLocaleString()} / {total.toLocaleString()}</span>
          </div>
          <MiniBar pct={pct} color={pct >= 0.9 ? "#EF4444" : pct >= 0.7 ? "#F59E0B" : "var(--brand)"} />
          <p className="mt-1 text-[10px] text-ink-subtle">
            {t("ops.usageDrawer.accountUsed")} {usedTotal.toLocaleString()} {t("ops.usage.points")} ({(pct * 100).toFixed(1)}%)
          </p>
        </div>
      )}

      {mTotal > 0 && (
        <div className="mb-3 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-ink-subtle">{t("ops.usageDrawer.monitorTitle")}</span>
            <span className="tabular-nums text-ink">{mRemaining.toLocaleString()} / {mTotal.toLocaleString()}</span>
          </div>
          <MiniBar pct={mPct} color={mPct >= 0.9 ? "#EF4444" : mPct >= 0.7 ? "#F59E0B" : "var(--brand)"} />
          <p className="mt-1 text-[10px] text-ink-subtle">
            {t("ops.usageDrawer.monitorUsed")} {mUsed.toLocaleString()} {t("ops.usage.points")} ({(mPct * 100).toFixed(1)}%)
          </p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-subtle">{t("ops.usageDrawer.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-subtle">
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colTime")}</th>
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colEndpoint")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("ops.usageDrawer.colConsumed")}</th>
                <th className="px-2 py-1.5 font-medium">{t("ops.usageDrawer.colCache")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("ops.usageDrawer.colRemaining")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-hairline/70">
                  <td className="px-2 py-1.5 text-ink-muted">{e.time}</td>
                  <td className="px-2 py-1.5 text-ink">{e.endpoint}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-ink">{e.consumed}</td>
                  <td className="px-2 py-1.5">
                    {e.cacheHit ? (
                      <span className="rounded-full bg-success-soft px-1.5 text-[10px] text-success">{t("ops.usageDrawer.cacheHit")}</span>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-info">{e.remainingAfter}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Drawer>
  );
}
