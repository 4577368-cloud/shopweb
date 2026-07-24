"use client";

// 物流双轨组件（Phase 2）：境内段 + 国际段双迷你进度条。
// 消费 LogisticsTrack 类型；异常态用 danger 色。真实轨迹在 Phase 5 接入。
import { useT } from "@/i18n/LocaleProvider";
import type {
  DomesticTrackStep,
  IntlTrackStep,
  LogisticsTrack,
} from "@/lib/order/types";
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

type TFn = (key: string, params?: Record<string, string | number>) => string;

function TrackBar({
  title,
  steps,
  currentStep,
  abnormal,
  t,
}: {
  title: string;
  steps: string[];
  currentStep: string | null;
  abnormal?: boolean;
  t: TFn;
}) {
  const currentIdx = currentStep ? steps.indexOf(currentStep) : -1;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-medium text-ink-subtle">{title}</p>
        {abnormal && (
          <span className="rounded-full bg-destructive-soft px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            {t("order.track.abnormal")}
          </span>
        )}
      </div>
      <div className="flex items-center">
        {steps.map((step, i) => {
          const done = currentIdx >= 0 && i < currentIdx;
          const active = i === currentIdx;
          const isAbnormal = active && abnormal;
          return (
            <div key={step} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border",
                    isAbnormal
                      ? "border-destructive bg-destructive"
                      : done || active
                      ? "border-brand-accent bg-brand-accent"
                      : "border-hairline bg-surface"
                  )}
                />
                <span
                  className={cn(
                    "mt-1 whitespace-nowrap text-[10px]",
                    isAbnormal
                      ? "font-medium text-destructive"
                      : active
                      ? "font-medium text-ink"
                      : done
                      ? "text-ink-muted"
                      : "text-ink-subtle"
                  )}
                >
                  {t(`order.track.${step}`)}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "mx-1 h-px flex-1",
                    i < currentIdx ? "bg-brand-accent" : "bg-hairline"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LogisticsTracks({ track }: { track?: LogisticsTrack }) {
  const t = useT();
  if (!track) {
    return (
      <p className="mt-3 text-[11px] text-ink-subtle">
        {t("order.track.notStarted")}
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-control)] border border-hairline bg-surface p-3">
      <TrackBar
        title={t("order.track.domesticTitle")}
        steps={DOMESTIC_STEPS}
        currentStep={track.domestic.step}
        abnormal={track.domestic.abnormal}
        t={t}
      />
      <TrackBar
        title={t("order.track.intlTitle")}
        steps={INTL_STEPS}
        currentStep={track.intl.step}
        abnormal={track.intl.abnormal}
        t={t}
      />
    </div>
  );
}
