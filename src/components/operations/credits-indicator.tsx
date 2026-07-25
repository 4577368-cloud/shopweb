// 运营中心 · 余额指示器（紧凑头部）。
// 日常只显示 API 余额；悬停展开技术明细（预估/实际/缓存/监控余额）。
"use client";

import { useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MarketingContext } from "@/hooks/use-marketing-runner";

interface CreditsIndicatorProps {
  apiRemaining: number;
  monitorRemaining: number;
  context: MarketingContext;
  onOpenUsage?: () => void;
  onFetch?: () => void;
  fetchDisabled?: boolean;
  className?: string;
}

export function CreditsIndicator({
  apiRemaining,
  monitorRemaining,
  context,
  onOpenUsage,
  onFetch,
  fetchDisabled,
  className,
}: CreditsIndicatorProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

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
        className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs shadow-sm transition-colors hover:bg-surface-muted"
      >
        <span className="text-ink-subtle">{t("ops.credits.label")}</span>
        <span className="font-semibold tabular-nums text-brand">
          {apiRemaining.toLocaleString()} {t("ops.usage.points")}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-[var(--radius-card)] border border-hairline bg-surface p-2.5 shadow-card">
          <div className="space-y-1.5 text-xs">
            <Row label={t("ops.credits.apiRemaining")} value={`${apiRemaining.toLocaleString()} ${t("ops.usage.points")}`} />
            <Row label={t("ops.credits.monitorRemaining")} value={`${monitorRemaining.toLocaleString()} ${t("ops.usage.points")}`} />
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
            {onOpenUsage && (
              <>
                <div className="my-1.5 border-t border-hairline" />
                <button
                  type="button"
                  onClick={onOpenUsage}
                  className="w-full rounded-[var(--radius-control)] bg-surface-muted px-2 py-1.5 text-left text-[11px] font-medium text-ink hover:bg-surface-hover"
                >
                  {t("ops.credits.viewUsage")} →
                </button>
              </>
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
