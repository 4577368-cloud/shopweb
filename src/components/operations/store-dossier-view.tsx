// 单店富 dossier 视图（/operations-center/store/[id] 路由页主体）。
// 复用 competition-detail-drawer 的展示区块（PlatformBreakdown / *Block 等），
// 数据来自一次 dossier 扇出（StoreDossier），头部 StoreRow 由注册表注入。
"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import type { AdPlatform, StoreAdState, StoreDossier } from "@/lib/marketing/types";
import { PLATFORM_META, regionLabel, categoryLabel, shopTypeLabel } from "@/lib/marketing/enums";
import { referenceCohort } from "@/lib/marketing/api";
import {
  lifecycleStage,
  platformMatrix,
  budgetShiftHint,
  trafficQuality,
  benchmarkRadar,
} from "@/lib/marketing/analytics";
import { PlatformBadge } from "./platform-badge";
import { CostBadge } from "./cost-badge";
import { CoverThumb } from "./cover-thumb";
import { MetricTile } from "./metric-tile";
import { Sparkline, RadarChart, RadialGauge } from "./charts";
import { fmtCompact, fmtInt, fmtPercent } from "@/lib/marketing/format";
import { cn } from "@/lib/utils";
import {
  PlatformBreakdown,
  PlatformStrategyMatrix,
  DataAnalysisBlock,
  AdTrendBlock,
  LongestAdsBlock,
  MostUsedAdsBlock,
  FbPagesBlock,
  RegionAnalysisBlock,
  DeliveryBlock,
  LIFE_CLS,
  Mini,
} from "./competition-detail-drawer";

const STATUS_META = {
  1: { label: "active", cls: "bg-success-soft text-success" },
  0: { label: "offline", cls: "bg-muted text-ink-muted" },
  [-1 as StoreAdState]: { label: "stopped", cls: "bg-destructive-soft text-destructive" },
} as Record<StoreAdState, { label: string; cls: string }>;

function dash(v: number | string | undefined | null): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "number") return v > 0 ? fmtInt(v) : "—";
  return v ? v : "—";
}

const SECTIONS = [
  "overview",
  "analytics",
  "adTrend",
  "creatives",
  "region",
  "delivery",
  "fbPages",
  "products",
] as const;

export function StoreDossierView({ dossier }: { dossier: StoreDossier }) {
  const t = useT();
  const store = dossier.store;
  const [active, setActive] = useState<string>("overview");

  const cohort = useMemo(() => referenceCohort(), []);
  const nowSec = useMemo(
    () => (store ? Math.max(1, ...cohort.map((s) => s.latestFoundTime || 0)) : 1),
    [store, cohort]
  );
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

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(`store-sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-4">
      {/* 分区导航 */}
      <div className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-hairline bg-surface/95 px-4 py-2 backdrop-blur">
        {SECTIONS.map((s) => (
          <button
            key={s}
            onClick={() => scrollTo(s)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              active === s ? "bg-[var(--brand)] text-white" : "bg-surface-muted text-ink-muted hover:text-ink"
            )}
          >
            {t(`ops.storePage.${s}`)}
          </button>
        ))}
      </div>

      {/* 头部概览 */}
      <section id="store-sec-overview" className="scroll-mt-14 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {store ? (
            <>
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_META[store.adState].cls)}>
                {t(`ops.competition.card.${STATUS_META[store.adState].label}`)}
              </span>
              {store.platType.map((p: AdPlatform) => (
                <PlatformBadge key={p} platform={p} />
              ))}
              {store.isAi && <span className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">AI</span>}
              {store.isDrama && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning">Drama</span>}
            </>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-muted">—</span>
          )}
        </div>

        <h1 className="text-xl font-semibold text-ink">{store?.name ?? dossier.store?.id ?? "—"}</h1>
        {store && (
          <p className="text-[11px] text-ink-subtle">
            {store.rootPath || "—"} · {store.shopType ? shopTypeLabel(store.shopType) : "—"}
          </p>
        )}

        {store && (
          <div className="rounded-[var(--radius-card)] border border-hairline bg-surface-muted/50 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-ink-muted">{t("ops.competition.detail.trendTitle")}</span>
              <span className="text-[11px] tabular-nums text-ink">
                {fmtCompact(store.playCount)} {t("ops.competition.card.plays")}
              </span>
            </div>
            <Sparkline data={store.growthSeries} width={880} height={64} stroke="var(--brand)" fill="var(--brand-soft)" strokeWidth={2} />
          </div>
        )}

        {store && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
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
        )}

        {store && <PlatformBreakdown store={store} />}

        {store && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.detail.websiteTitle")}</p>
            <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
              <p className="truncate text-[12px] font-medium text-ink">{store.website.title}</p>
              <p className="truncate text-[10px] text-ink-subtle">{store.website.url}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{store.website.summary}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                <Mini label={t("ops.competition.detail.visits")} value={dash(store.website.monthlyVisits)} />
                <Mini label={t("ops.competition.detail.bounce")} value={store.website.bounceRate ? fmtPercent(store.website.bounceRate) : "—"} />
                <Mini label={t("ops.competition.detail.avgTime")} value={store.website.visitSeconds ? `${store.website.visitSeconds}s` : "—"} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {store.website.languages.map((l) => (
                  <span key={l} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{l}</span>
                ))}
              </div>
            </div>
          </div>
        )}

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

        {analytics && analytics.pmatrix.length > 0 && <PlatformStrategyMatrix rows={analytics.pmatrix} t={t} />}

        {analytics && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-ink-muted">{t("ops.competition.radar.title")}</p>
              <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
                <div className="flex justify-center">
                  <RadarChart
                    axes={analytics.radar.map((d) => ({ label: t(`ops.competition.radar.${d.key}`) }))}
                    series={[
                      { label: store?.name ?? "", color: "#FE2C55", values: analytics.radar.map((d) => d.value) },
                      { label: t("ops.competition.radar.cohort"), color: "#1877F2", values: analytics.radar.map((d) => d.cohort) },
                    ]}
                    size={188}
                  />
                </div>
                <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-ink-muted">
                  <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#FE2C55" }} />{store?.name}</span>
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

        {store && (
          <div className="flex flex-wrap gap-1">
            {store.categories.map((c) => (
              <span key={c} className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] text-ink-muted">{categoryLabel(c)}</span>
            ))}
            {store.regions.map((r) => (
              <span key={r} className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-subtle">{regionLabel(r)}</span>
            ))}
          </div>
        )}
      </section>

      {/* 数据分析 */}
      <section id="store-sec-analytics" className="scroll-mt-14">
        <DataAnalysisBlock data={dossier.dataAnalysis} t={t} />
      </section>

      {/* 广告趋势 */}
      <section id="store-sec-adTrend" className="scroll-mt-14">
        <AdTrendBlock points={dossier.adTrend ?? []} t={t} />
      </section>

      {/* 常青 / 高频素材 */}
      <section id="store-sec-creatives" className="scroll-mt-14 space-y-3">
        <LongestAdsBlock ads={dossier.longest ?? []} t={t} />
        <MostUsedAdsBlock ads={dossier.mostUsed ?? []} t={t} />
      </section>

      {/* 地区分布 */}
      <section id="store-sec-region" className="scroll-mt-14">
        <RegionAnalysisBlock rows={dossier.regionAnalysis ?? []} t={t} />
      </section>

      {/* 交付分析 */}
      <section id="store-sec-delivery" className="scroll-mt-14">
        <DeliveryBlock delivery={dossier.deliveryAnalysis} t={t} />
      </section>

      {/* Facebook 主页 */}
      <section id="store-sec-fbPages" className="scroll-mt-14">
        <FbPagesBlock pages={dossier.fbPages ?? []} t={t} />
      </section>

      {/* 在投商品（免费端点） */}
      <section id="store-sec-products" className="scroll-mt-14">
        {dossier.products && (
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[11px] font-medium text-ink-muted">{t("ops.competition.detail.freeProducts")}</span>
              <CostBadge free />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {dossier.products.length === 0 ? (
                <p className="col-span-full text-[11px] text-ink-subtle">—</p>
              ) : (
                dossier.products.map((p) => {
                  const card = (
                    <div className="overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface">
                      <div className="h-20 w-full overflow-hidden">
                        <CoverThumb src={p.icon} label={p.title} />
                      </div>
                      <p className="truncate px-1.5 py-1 text-[10px] text-ink" title={p.title}>{p.title}</p>
                    </div>
                  );
                  return p.link ? (
                    <a key={p.id} href={p.link} target="_blank" rel="noreferrer" className="block hover:ring-1 hover:ring-[var(--brand)]/40">
                      {card}
                    </a>
                  ) : (
                    <div key={p.id}>{card}</div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
