// 竞店详情抽屉（设计 §5.2 / 原型 v2）：全量指标 + 平台分布 + 网站流量 + 趋势 + 收藏。
"use client";

import { useMemo } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import type { AdPlatform, StoreAdState, StoreRow } from "@/lib/marketing/types";
import { PLATFORM_META, regionLabel, categoryLabel, shopTypeLabel } from "@/lib/marketing/enums";
import { referenceCohort } from "@/lib/marketing/api";
import {
  lifecycleStage,
  platformMatrix,
  budgetShiftHint,
  trafficQuality,
  benchmarkRadar,
} from "@/lib/marketing/analytics";
import { Drawer } from "./drawer";
import { PlatformBadge } from "./platform-badge";
import { MetricTile } from "./metric-tile";
import { Sparkline, StackedBar, RadarChart, RadialGauge, type StackSegment } from "./charts";
import { fmtCompact, fmtPercent } from "@/lib/marketing/format";
import { cn } from "@/lib/utils";

const STATUS_META = {
  1: { label: "active", cls: "bg-success-soft text-success" },
  0: { label: "offline", cls: "bg-muted text-ink-muted" },
  [-1 as StoreAdState]: { label: "stopped", cls: "bg-destructive-soft text-destructive" },
} as Record<StoreAdState, { label: string; cls: string }>;

interface CompetitionDetailDrawerProps {
  store: StoreRow | null;
  onClose: () => void;
  onToggleCollect: (store: StoreRow) => void;
  collected: boolean;
  cohort?: StoreRow[]; // 对标基准集合；缺省用 referenceCohort()
}

export function CompetitionDetailDrawer({ store, onClose, onToggleCollect, collected, cohort: cohortProp }: CompetitionDetailDrawerProps) {
  const t = useT();
  const cohort = useMemo(() => cohortProp && cohortProp.length ? cohortProp : referenceCohort(), [cohortProp]);
  const nowSec = useMemo(() => Math.max(1, ...cohort.map((s) => s.latestFoundTime || 0)), [cohort]);
  const analytics = useMemo(() => {
    if (!store) return null;
    const pm = platformMatrix(store, nowSec);
    return {
      life: lifecycleStage(store, nowSec),
      pmatrix: pm,
      shift: budgetShiftHint(pm),
      tq: trafficQuality(store, cohort),
      radar: benchmarkRadar(store, cohort),
    };
  }, [store, cohort, nowSec]);
  return (
    <Drawer open={!!store} onClose={onClose} title={store?.name ?? ""} widthClass="max-w-2xl">
      {store && (
        <div className="space-y-4">
          {/* 头部 */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_META[store.adState].cls}`}>
              {t(`ops.competition.card.${STATUS_META[store.adState].label}`)}
            </span>
            {store.platType.map((p: AdPlatform) => (
              <PlatformBadge key={p} platform={p} />
            ))}
            {store.isAi && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">AI</span>}
            {store.isDrama && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">Drama</span>}
          </div>
          <p className="text-[11px] text-ink-subtle">{store.rootPath} · {shopTypeLabel(store.shopType)}</p>

          {/* 趋势 */}
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/50 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">{t("ops.competition.detail.trendTitle")}</span>
              <span className="text-[11px] tabular-nums text-ink">{fmtCompact(store.playCount)} {t("ops.competition.card.plays")}</span>
            </div>
            <Sparkline data={store.growthSeries} width={520} height={56} stroke="var(--brand)" fill="var(--brand-soft)" strokeWidth={2} />
          </div>

          {/* 核心指标 */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricTile label={t("ops.competition.card.adCount")} value={fmtCompact(store.adCount)} tone="brand" />
            <MetricTile label={t("ops.competition.card.plays")} value={fmtCompact(store.playCount)} />
            <MetricTile label={t("ops.competition.card.digg")} value={fmtCompact(store.diggCount)} />
            <MetricTile label={t("ops.competition.card.cpm")} value={`$${store.cpmMin}-${store.cpmMax}`} tone="info" />
            <MetricTile label={t("ops.competition.card.orders")} value={`${fmtCompact(store.cpaMin)}-${fmtCompact(store.cpaMax)}`} />
            <MetricTile label={t("ops.competition.card.days")} value={String(store.putDays)} />
            <MetricTile label={t("ops.competition.card.visits")} value={fmtCompact(store.monthlyVisits)} />
            <MetricTile label={t("ops.competition.card.popular")} value={fmtCompact(store.popularPersonCount)} />
            <MetricTile label={t("ops.competition.detail.adAccounts")} value={String(store.pageCount)} />
          </div>

          {/* 平台分布 */}
          <PlatformBreakdown store={store} />

          {/* 网站流量 */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.detail.websiteTitle")}</p>
            <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
              <p className="truncate text-[12px] font-medium text-ink">{store.website.title}</p>
              <p className="truncate text-[10px] text-ink-subtle">{store.website.url}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{store.website.summary}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <Mini label={t("ops.competition.detail.visits")} value={fmtCompact(store.website.monthlyVisits)} />
                <Mini label={t("ops.competition.detail.bounce")} value={fmtPercent(store.website.bounceRate)} />
                <Mini label={t("ops.competition.detail.avgTime")} value={`${store.website.visitSeconds}s`} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {store.website.languages.map((l) => (
                  <span key={l} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* 投放生命周期 / 预算迁移 */}
          {analytics && (
            <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", LIFE_CLS[analytics.life.stage])}>
                  {t(analytics.life.stageLabelKey)}
                </span>
                <span className="text-[11px] text-ink-muted">
                  {analytics.life.daysSinceFirst != null && t("ops.competition.lifecycle.firstSeen", { n: analytics.life.daysSinceFirst })}
                  {analytics.life.daysSinceLatest != null && ` · ${t("ops.competition.lifecycle.lastSeen", { n: analytics.life.daysSinceLatest })}`}
                  {` · ${t("ops.competition.lifecycle.liveDays", { n: analytics.life.putDays })}`}
                </span>
              </div>
              {analytics.shift && (
                <p className="mb-1.5 rounded bg-warning-soft px-2 py-1 text-[10px] text-warning">
                  {t("ops.competition.lifecycle.budgetShift", { from: analytics.shift.from.join(" / "), to: analytics.shift.to.join(" / ") })}
                </p>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                {analytics.life.activePlatforms.length > 0 && (
                  <span className="text-success">
                    ▲ {analytics.life.activePlatforms.map((p) => PLATFORM_META[p].label).join(", ")} · {t("ops.competition.lifecycle.active")}
                  </span>
                )}
                {analytics.life.stoppedPlatforms.length > 0 && (
                  <span className="text-ink-subtle">
                    ■ {analytics.life.stoppedPlatforms.map((p) => PLATFORM_META[p].label).join(", ")} · {t("ops.competition.lifecycle.stopped")}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 平台策略矩阵 */}
          {analytics && analytics.pmatrix.length > 0 && <PlatformStrategyMatrix rows={analytics.pmatrix} t={t} />}

          {/* 对标雷达 + 流量质量分 */}
          {analytics && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.radar.title")}</p>
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
                  <div className="flex justify-center">
                    <RadarChart
                      axes={analytics.radar.map((d) => ({ label: t(`ops.competition.radar.${d.key}`) }))}
                      series={[
                        { label: store.name, color: "#FE2C55", values: analytics.radar.map((d) => d.value) },
                        { label: t("ops.competition.radar.cohort"), color: "#1877F2", values: analytics.radar.map((d) => d.cohort) },
                      ]}
                      size={188}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-ink-muted">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#FE2C55" }} />{store.name}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#1877F2" }} />{t("ops.competition.radar.cohort")}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.traffic.title")}</p>
                <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
                  <div className="flex items-center gap-3">
                    <RadialGauge
                      value={analytics.tq.score}
                      max={100}
                      size={72}
                      stroke={analytics.tq.score >= analytics.tq.cohortAvg ? "#16A34A" : "#F59E0B"}
                      label={String(analytics.tq.score)}
                      sublabel={t("ops.competition.traffic.score")}
                    />
                    <div className="min-w-0 flex-1 text-[11px]">
                      <p className="text-ink-muted">{t("ops.competition.traffic.cohortAvg", { n: analytics.tq.cohortAvg })}</p>
                      <p className="mt-1 text-ink-subtle">
                        {t("ops.competition.traffic.visits", { n: fmtCompact(analytics.tq.monthlyVisits) })} · {fmtPercent(analytics.tq.bounceRate)} bounce · {analytics.tq.visitSeconds}s
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 类目 / 地区 */}
          <div className="flex flex-wrap gap-1">
            {store.categories.map((c) => (
              <span key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{categoryLabel(c)}</span>
            ))}
            {store.regions.map((r) => (
              <span key={r} className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-subtle">{regionLabel(r)}</span>
            ))}
          </div>

          <Button variant={collected ? "secondary" : "primary"} className="w-full" onClick={() => onToggleCollect(store)}>
            <span className="text-base leading-none">★</span>
            {collected ? t("ops.competition.card.collected") : t("ops.competition.card.collect")}
          </Button>
        </div>
      )}
    </Drawer>
  );
}

function PlatformBreakdown({ store }: { store: StoreRow }) {
  const t = useT();
  const rows = [
    { key: "tiktok" as const, b: store.tiktok },
    { key: "facebook" as const, b: store.facebook },
    { key: "meta" as const, b: store.metaLibrary },
  ].filter((r) => r.b);
  if (rows.length === 0) return null;
  const segs: StackSegment[] = rows.map((r) => ({
    label: PLATFORM_META[r.key].label,
    value: r.b!.playCount,
    color: PLATFORM_META[r.key].dot,
  }));
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.card.breakdown")}</p>
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <StackedBar segments={segs} height={8} className="mb-2" />
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLATFORM_META[r.key].dot }} />
                {PLATFORM_META[r.key].label}
              </span>
              <span className="tabular-nums text-ink">
                {fmtCompact(r.b!.playCount)} · {r.b!.dataCount} ads · ${r.b!.minCpm}-${r.b!.maxCpm} CPM
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] text-ink-subtle">{label}</p>
      <p className="truncate font-medium tabular-nums text-ink">{value}</p>
    </div>
  );
}

const LIFE_CLS: Record<string, string> = {
  scaling: "bg-success-soft text-success",
  steady: "bg-info-soft text-info",
  cooling: "bg-warning-soft text-warning",
  stopped: "bg-destructive-soft text-destructive",
};

function PlatformStrategyMatrix({ rows, t }: { rows: import("@/lib/marketing/analytics").PlatformMatrixRow[]; t: ReturnType<typeof useT> }) {
  const adStateCls = (s: number) => (s === 1 ? "text-success" : s === 0 ? "text-ink-muted" : "text-destructive");
  const adStateLabel = (s: number) =>
    s === 1 ? t("ops.competition.matrix.active") : s === 0 ? t("ops.competition.matrix.offline") : t("ops.competition.matrix.stopped");
  const dot = (s: number) => (s === 1 ? "#16A34A" : s === 0 ? "#F59E0B" : "#EF4444");
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.matrix.title")}</p>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] text-ink-subtle">
              <th className="px-2 py-1.5 font-medium">{t("ops.competition.matrix.platform")}</th>
              <th className="px-2 py-1.5 font-medium">{t("ops.competition.matrix.status")}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("ops.competition.matrix.days")}</th>
              <th className="px-2 py-1.5 text-right font-medium">CPM</th>
              <th className="px-2 py-1.5 text-right font-medium">CPA</th>
              <th className="px-2 py-1.5 text-right font-medium">{t("ops.competition.matrix.activeAds")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline/70 last:border-0">
                <td className="px-2 py-1.5 font-medium text-ink">{r.label}</td>
                <td className="px-2 py-1.5">
                  <span className={cn("inline-flex items-center gap-1", adStateCls(r.adState))}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot(r.adState) }} />
                    {adStateLabel(r.adState)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{r.daysSinceLatest != null ? `${r.daysSinceLatest}d` : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">${r.cpmMin}–{r.cpmMax}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{fmtCompact(r.cpaMin)}–{fmtCompact(r.cpaMax)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-ink-muted">{r.adActiveCount ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
