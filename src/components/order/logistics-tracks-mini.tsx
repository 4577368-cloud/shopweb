"use client";

// 物流双轨迷你进度条（国内段 + 国际段）。
// 当前由订单的 track 字段驱动（mock 阶段为占位数据）；Phase 5 接真实轨迹后直接替换数据源。
import { useT } from "@/i18n/LocaleProvider";
import type { DomesticTrackStep, IntlTrackStep, LogisticsTrack } from "@/lib/order/types";
import { cn } from "@/lib/utils";

const DOMESTIC_STEPS: DomesticTrackStep[] = [
  "pendingPickup",
  "pickedUp",
  "domesticTransit",
  "domesticArrived",
];
const INTL_STEPS: IntlTrackStep[] = [
  "departed",
  "lineHaul",
  "customs",
  "lastMile",
  "intlDelivered",
];

export interface LogisticsTracksMiniProps {
  track?: LogisticsTrack;
}

export function LogisticsTracksMini({ track }: LogisticsTracksMiniProps) {
  const t = useT();
  if (!track) {
    return (
      <p className="text-[11px] text-ink-subtle">{t("order.drawer.noLogistics")}</p>
    );
  }

  const renderBar = (
    titleKey: string,
    steps: string[],
    current: string,
    abnormal?: boolean
  ) => {
    const idx = steps.indexOf(current);
    const pct =
      steps.length > 1 ? Math.round((Math.max(idx, 0) / (steps.length - 1)) * 100) : 0;
    return (
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink-muted">{t(titleKey)}</span>
          <span
            className={cn(
              "text-[10px]",
              abnormal ? "text-destructive" : "text-ink-subtle"
            )}
          >
            {t(`order.track.${current}`)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              abnormal ? "bg-destructive" : "bg-brand-accent"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderBar(
        "order.track.domesticTitle",
        DOMESTIC_STEPS,
        track.domestic.step,
        track.domestic.abnormal
      )}
      {renderBar(
        "order.track.intlTitle",
        INTL_STEPS,
        track.intl.step,
        track.intl.abnormal
      )}
    </div>
  );
}
