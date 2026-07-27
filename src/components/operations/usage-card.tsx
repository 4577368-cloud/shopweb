// 左栏「用户钱包」卡（§4.5）：双桶条（免费分 / 付费分）+ 订阅/加购剩余 + 本会话消耗。
// 真实模式用 billing/credits/buckets（用户钱包）；mock 模式回退 pipispy 账户余额。
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { CreditsBalance } from "@/lib/marketing/types";
import type { CreditBucketBreakdown } from "@/lib/billing/api";

interface UsageCardProps {
  account?: CreditsBalance | null;
  wallet?: CreditBucketBreakdown | null;
  sessionUsed: number;
  onOpenDetail: () => void;
  onOpenBilling?: () => void;
}

export function UsageCard({ account, wallet, sessionUsed, onOpenDetail, onOpenBilling }: UsageCardProps) {
  const t = useT();

  // 真实模式：用户钱包优先。
  if (wallet) {
    const total = wallet.balanceCredits || 1;
    const freePct = Math.round((wallet.freeCredits / total) * 100);
    const subPct = Math.round((wallet.subscriptionCredits / total) * 100);
    const packPct = Math.round((wallet.packCredits / total) * 100);
    const promoPct = Math.round((wallet.promoCredits / total) * 100);
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] font-medium text-ink">{t("ops.wallet.label")}</span>
          <Button size="sm" variant="link" onClick={onOpenBilling ?? onOpenDetail} className="h-auto px-0 text-[11px]">
            {t("ops.billing.open")}
          </Button>
        </div>
        <div className="mb-1 flex items-baseline gap-1">
          <span className="text-lg font-semibold tabular-nums text-brand">{wallet.balanceCredits.toLocaleString()}</span>
          <span className="text-[11px] text-ink-subtle">{t("ops.usage.points")}</span>
        </div>
        <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          {freePct > 0 && <div className="h-full bg-success" style={{ width: `${freePct}%` }} />}
          {subPct > 0 && <div className="h-full bg-brand" style={{ width: `${subPct}%` }} />}
          {packPct > 0 && <div className="h-full bg-info" style={{ width: `${packPct}%` }} />}
          {promoPct > 0 && <div className="h-full bg-warning" style={{ width: `${promoPct}%` }} />}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-muted">
          <span>{t("ops.wallet.free")} <b className="text-ink">{wallet.freeCredits}</b></span>
          <span>{t("ops.wallet.subscription")} <b className="text-ink">{wallet.subscriptionCredits}</b></span>
          <span>{t("ops.wallet.pack")} <b className="text-ink">{wallet.packCredits}</b></span>
          {wallet.promoCredits > 0 && (
            <span>{t("ops.wallet.promo")} <b className="text-ink">{wallet.promoCredits}</b></span>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-ink-subtle">
          {t("ops.usage.sessionUsed")} <span className="font-semibold text-ink">+{sessionUsed}</span>
        </p>
      </div>
    );
  }

  const total = account?.totalApiCredits ?? 0;
  const remaining = account?.remainingApiCredits ?? 0;
  const used = account ? total - remaining : 0;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const monitor = account?.remainingMonitorCredits ?? 0;
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-ink">{t("ops.usage.title")}</span>
        <Button size="sm" variant="link" onClick={onOpenDetail} className="h-auto px-0 text-[11px]">
          {t("ops.usage.detail")}
        </Button>
      </div>
      <div className="mb-1 flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums text-brand">{remaining.toLocaleString()}</span>
        <span className="text-[11px] text-ink-subtle">/ {total.toLocaleString()} {t("ops.usage.points")}</span>
      </div>
      <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-warning"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ink-muted">
          {t("ops.usage.sessionUsed")} <span className="font-semibold text-ink">+{sessionUsed}</span>
        </span>
        <span className="text-ink-subtle">
          {t("ops.usage.monitor")}: <span className="font-medium text-info">{monitor.toLocaleString()}</span>
        </span>
      </div>
    </div>
  );
}
