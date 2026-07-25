// 左栏「API 账户余额」卡（设计 §1 / 原型）：账户级剩余 / 总额 + 进度 + 本会话消耗 + 监控额度。
// 重要：余额是 pipispy API 账户（对应你的 key），不是单个商家/用户。
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { CreditsBalance } from "@/lib/marketing/types";

interface UsageCardProps {
  account: CreditsBalance | null;
  sessionUsed: number;
  onOpenDetail: () => void;
}

export function UsageCard({ account, sessionUsed, onOpenDetail }: UsageCardProps) {
  const t = useT();
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
