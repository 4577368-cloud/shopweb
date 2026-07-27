// 竞店对比弹窗（v2 新增强大功能）：2–4 个店铺并排对比，指标条形 + 领先高亮 + 平台分布 + 结论。
"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { StoreRow } from "@/lib/marketing/types";
import { PLATFORM_META } from "@/lib/marketing/enums";
import { StackedBar, LineChart, SERIES_COLORS, type StackSegment } from "./charts";
import { fmtCompact } from "@/lib/marketing/format";

interface CompareStoresModalProps {
  open: boolean;
  stores: StoreRow[];
  onClose: () => void;
}

interface MetricDef {
  key: string;
  label: string;
  get: (s: StoreRow) => number;
  lowerBetter?: boolean;
  fmt: (v: number) => string;
}

const METRICS: MetricDef[] = [
  { key: "ads", label: "metricAds", get: (s) => s.adCount, fmt: fmtCompact },
  { key: "plays", label: "metricPlays", get: (s) => s.playCount, fmt: fmtCompact },
  { key: "cpm", label: "metricCpm", get: (s) => (s.cpmMin + s.cpmMax) / 2, lowerBetter: true, fmt: (v) => `$${v.toFixed(1)}` },
  { key: "cpa", label: "metricCpa", get: (s) => (s.cpaMin + s.cpaMax) / 2, lowerBetter: true, fmt: (v) => fmtCompact(v) },
  { key: "days", label: "metricDays", get: (s) => s.putDays, fmt: String },
  { key: "visits", label: "metricVisits", get: (s) => s.monthlyVisits, fmt: fmtCompact },
  { key: "followers", label: "metricFollowers", get: (s) => s.popularPersonCount, fmt: fmtCompact },
];

export function CompareStoresModal({ open, stores, onClose }: CompareStoresModalProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const segmentsFor = (s: StoreRow): StackSegment[] => {
    const segs: StackSegment[] = [];
    if (s.tiktok) segs.push({ label: "TikTok", value: s.tiktok.playCount, color: PLATFORM_META.tiktok.dot });
    if (s.facebook) segs.push({ label: "Facebook", value: s.facebook.playCount, color: PLATFORM_META.facebook.dot });
    if (s.metaLibrary) segs.push({ label: "Meta", value: s.metaLibrary.playCount, color: PLATFORM_META.meta.dot });
    return segs;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{t("ops.compareModal.title")}</h3>
          <button
            onClick={onClose}
            aria-label={t("ops.compareModal.close")}
            className="inline-flex items-center justify-center rounded-[var(--radius-control)] p-1 text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 active:scale-[0.97]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3">
          {/* 店铺表头 */}
          <div
            className="mb-3 grid gap-2"
            style={{ gridTemplateColumns: `140px repeat(${stores.length}, minmax(0, 1fr))` }}
          >
            <div />
            {stores.map((s) => (
              <div key={s.id} className="text-center">
                <p className="truncate text-[12px] font-semibold text-ink">{s.name}</p>
                <p className="truncate text-[10px] text-ink-subtle">{s.rootPath}</p>
              </div>
            ))}
          </div>

          {/* 指标行 */}
          {METRICS.map((m) => {
            const vals = stores.map(m.get);
            const best = m.lowerBetter ? Math.min(...vals) : Math.max(...vals);
            const max = Math.max(...vals) || 1;
            return (
              <div
                key={m.key}
                className="grid items-center gap-2 border-t border-hairline py-2"
                style={{ gridTemplateColumns: `140px repeat(${stores.length}, minmax(0, 1fr))` }}
              >
                <span className="text-[11px] text-ink-muted">{t(`ops.compareModal.${m.label}`)}</span>
                {stores.map((s, i) => {
                  const v = vals[i];
                  const isBest = v === best;
                  return (
                    <div key={s.id} className="min-w-0">
                      <div className="mb-0.5 flex items-center justify-between gap-1">
                        <span className={cn("truncate text-[11px] font-medium tabular-nums", isBest ? "text-brand" : "text-ink")}>
                          {m.fmt(v)}
                        </span>
                        {isBest && <span className="text-[9px] font-medium text-brand">{t("ops.compareModal.leader")}</span>}
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={cn("h-full rounded-full", isBest ? "bg-brand" : "bg-ink-subtle/40")}
                          style={{ width: `${(v / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 平台分布 */}
          <div
            className="grid items-center gap-2 border-t border-hairline py-2"
            style={{ gridTemplateColumns: `140px repeat(${stores.length}, minmax(0, 1fr))` }}
          >
            <span className="text-[11px] text-ink-muted">{t("ops.compareModal.platformMix")}</span>
            {stores.map((s) => (
              <div key={s.id}>
                <StackedBar segments={segmentsFor(s)} height={10} />
              </div>
            ))}
          </div>

          {/* 增长叠图（多店增长动能对比） */}
          <div
            className="grid items-center gap-2 border-t border-hairline py-2"
            style={{ gridTemplateColumns: `140px repeat(${stores.length}, minmax(0, 1fr))` }}
          >
            <span className="text-[11px] text-ink-muted">{t("ops.compareModal.momentum")}</span>
            {stores.map((s, i) => (
              <div key={s.id} title={s.name}>
                <LineChart
                  series={[
                    {
                      label: s.name,
                      color: SERIES_COLORS[i % SERIES_COLORS.length],
                      data: s.growthSeries,
                      area: stores.length <= 2,
                    },
                  ]}
                  width={150}
                  height={44}
                />
              </div>
            ))}
          </div>

          {/* 结论 */}
          <div className="mt-3 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/50 p-3">
            <p className="mb-1 text-[11px] font-medium text-ink-muted">{t("ops.compareModal.verdict")}</p>
            <p className="text-[11px] leading-relaxed text-ink-subtle">{t("ops.compareModal.note")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
