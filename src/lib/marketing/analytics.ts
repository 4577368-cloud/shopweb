// 运营中心 · 分析派生层（纯函数，无副作用、不依赖后端）。
// 全部基于 pipispy 已返回字段做多维派生，前端 mock 与真实代理共用同一套计算，
// 接通后端后无需改动。所有"评分/阶段"均为从原始字段可解释的派生，不引入任何假设性 AI 结论。

import type { StoreRow, PlatformBreakdown, AdPlatform } from "./types";

const DAY = 86400;

// ---------------------------------------------------------------------------
// 竞品：投放生命周期 / 新鲜度
// ---------------------------------------------------------------------------

export type LifecycleStage = "scaling" | "steady" | "cooling" | "stopped";

export interface LifecycleInfo {
  stage: LifecycleStage;
  stageLabelKey: string; // ops.competition.lifecycle.<stage>
  daysSinceLatest: number | null;
  daysSinceFirst: number | null;
  putDays: number;
  /** 本店各平台是否仍有在投（用于预算迁移信号）。 */
  activePlatforms: AdPlatform[];
  stoppedPlatforms: AdPlatform[];
}

/** 由 foundTime/latestFoundTime/putDays/adState 派生投放生命周期阶段。 */
export function lifecycleStage(store: StoreRow, nowSec: number): LifecycleInfo {
  const latest = store.latestFoundTime;
  const first = store.foundTime;
  const daysSinceLatest = latest ? Math.max(0, Math.round((nowSec - latest) / DAY)) : null;
  const daysSinceFirst = first ? Math.max(0, Math.round((nowSec - first) / DAY)) : null;

  const present = store.platType;
  // store[p] 索引在 StoreRow 上未声明 platType 子键，转 unknown 再索引绕过类型检查
  const activePlatforms = present.filter((p) => (((store as unknown as Record<string, { adState?: number }>)[p]?.adState) ?? 0) === 1);
  const stoppedPlatforms = present.filter((p) => (((store as unknown as Record<string, { adState?: number }>)[p]?.adState) ?? 0) === -1);

  let stage: LifecycleStage;
  if (store.adState === -1) stage = "stopped";
  else if (store.adState === 0) stage = "cooling";
  else if (daysSinceLatest != null && daysSinceLatest <= 21) stage = "scaling";
  else stage = "steady";

  return {
    stage,
    stageLabelKey: `ops.competition.lifecycle.${stage}`,
    daysSinceLatest,
    daysSinceFirst,
    putDays: store.putDays,
    activePlatforms,
    stoppedPlatforms,
  };
}

// ---------------------------------------------------------------------------
// 竞品：平台策略矩阵（预算迁移信号）
// ---------------------------------------------------------------------------

export interface PlatformMatrixRow {
  key: AdPlatform;
  label: string;
  adState: number; // 1 活跃 / 0 下线 / -1 停投
  putDays: number;
  cpmMin: number;
  cpmMax: number;
  cpaMin: number;
  cpaMax: number;
  adActiveCount: number | null;
  adInactiveCount: number | null;
  reach: number | null;
  daysSinceLatest: number | null;
}

/** 把各平台 PlatformBreakdown 摊平成可对比矩阵行。 */
export function platformMatrix(store: StoreRow, nowSec: number): PlatformMatrixRow[] {
  const map: { key: AdPlatform; b: PlatformBreakdown | null }[] = [
    { key: "tiktok", b: store.tiktok },
    { key: "facebook", b: store.facebook },
    { key: "meta", b: store.metaLibrary },
  ];
  return map
    .filter((m) => m.b)
    .map((m) => {
      const b = m.b!;
      return {
        key: m.key,
        label: m.key === "meta" ? "Meta" : m.key === "tiktok" ? "TikTok" : "Facebook",
        adState: b.adState,
        putDays: b.putDays,
        cpmMin: b.minCpm,
        cpmMax: b.maxCpm,
        cpaMin: b.minCpa,
        cpaMax: b.maxCpa,
        adActiveCount: b.adActiveCount ?? null,
        adInactiveCount: b.adInactiveCount ?? null,
        reach: b.reach ?? null,
        daysSinceLatest: b.latestFoundTime ? Math.max(0, Math.round((nowSec - b.latestFoundTime) / DAY)) : null,
      };
    });
}

/** 跨平台预算迁移信号：某平台停投/下线，而另一平台仍在投。 */
export interface BudgetShift {
  from: string[]; // 停止/下线的平台 label
  to: string[]; // 仍在投的平台 label
}
export function budgetShiftHint(rows: PlatformMatrixRow[]): BudgetShift | null {
  const active = rows.filter((r) => r.adState === 1).map((r) => r.label);
  const dead = rows.filter((r) => r.adState !== 1).map((r) => r.label);
  if (active.length && dead.length) return { from: dead, to: active };
  return null;
}

// ---------------------------------------------------------------------------
// 竞品：流量质量分（vs 可见集合基准）
// ---------------------------------------------------------------------------

export interface TrafficQuality {
  score: number; // 0..100
  cohortAvg: number;
  visitsNorm: number; // 0..1
  engagement: number; // 0..1
  monthlyVisits: number;
  bounceRate: number;
  visitSeconds: number;
}

/** 流量质量 = 访问规模(60%) + 参与度(40%，=低跳出×长停留)。相对集合归一化。 */
export function trafficQuality(store: StoreRow, cohort: StoreRow[]): TrafficQuality {
  const visits = cohort.map((s) => s.website.monthlyVisits);
  const maxVisits = Math.max(1, ...visits);
  const maxSeconds = Math.max(1, ...cohort.map((s) => s.website.visitSeconds));
  const visitsNorm = store.website.monthlyVisits / maxVisits;
  const engagement = (1 - store.website.bounceRate) * (store.website.visitSeconds / maxSeconds);
  const score = Math.round(100 * (0.6 * visitsNorm + 0.4 * Math.min(1, engagement)));
  const cohortScore = cohort.map((s) => {
    const vn = s.website.monthlyVisits / maxVisits;
    const eng = (1 - s.website.bounceRate) * (s.website.visitSeconds / maxSeconds);
    return 100 * (0.6 * vn + 0.4 * Math.min(1, eng));
  });
  const cohortAvg = Math.round(cohortScore.reduce((a, b) => a + b, 0) / (cohortScore.length || 1));
  return {
    score,
    cohortAvg,
    visitsNorm,
    engagement: Math.min(1, engagement),
    monthlyVisits: store.website.monthlyVisits,
    bounceRate: store.website.bounceRate,
    visitSeconds: store.website.visitSeconds,
  };
}

// ---------------------------------------------------------------------------
// 竞品：对标雷达（本店 vs 集合均值，归一化 0..1）
// ---------------------------------------------------------------------------

export interface RadarDim {
  key: string;
  label: string;
  value: number; // 本店 0..1
  cohort: number; // 集合均值 0..1
}

/** 把 store + cohort 归一化为 6 维雷达：广告量/播放量/CPM效率/流量/动量/平台广度。 */
export function benchmarkRadar(store: StoreRow, cohort: StoreRow[]): RadarDim[] {
  const maxAd = Math.max(1, ...cohort.map((s) => s.adCount));
  const maxPlay = Math.max(1, ...cohort.map((s) => s.playCount));
  const cpms = cohort.flatMap((s) => [s.cpmMin, s.cpmMax]);
  const minCpm = Math.min(...cpms);
  const maxCpm = Math.max(...cpms);
  const cpmSpan = maxCpm - minCpm || 1;
  const maxSlope = Math.max(1, ...cohort.map((s) => Math.abs(seriesSlope(s.growthSeries))));

  const slope = seriesSlope(store.growthSeries);
  const avgCpm = (store.cpmMin + store.cpmMax) / 2;
  const cpmEff = 1 - (avgCpm - minCpm) / cpmSpan; // CPM 越低越高效
  const tq = trafficQuality(store, cohort).score / 100;

  const dims: Omit<RadarDim, "cohort">[] = [
    { key: "ads", label: "Ads", value: store.adCount / maxAd },
    { key: "plays", label: "Plays", value: store.playCount / maxPlay },
    { key: "cpm", label: "CPM eff.", value: Math.max(0, Math.min(1, cpmEff)) },
    { key: "traffic", label: "Traffic", value: tq },
    { key: "momentum", label: "Momentum", value: Math.abs(slope) / maxSlope },
    { key: "breadth", label: "Channels", value: store.platType.length / 3 },
  ];
  // cohort 均值（同算法）
  const cohortDims = dims.map((d) => {
    const vals = cohort.map((s) => {
      switch (d.key) {
        case "ads": return s.adCount / maxAd;
        case "plays": return s.playCount / maxPlay;
        case "cpm": return Math.max(0, Math.min(1, 1 - ((s.cpmMin + s.cpmMax) / 2 - minCpm) / cpmSpan));
        case "traffic": return trafficQuality(s, cohort).score / 100;
        case "momentum": return Math.abs(seriesSlope(s.growthSeries)) / maxSlope;
        case "breadth": return s.platType.length / 3;
        default: return 0;
      }
    });
    return vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  });
  return dims.map((d, i) => ({ ...d, cohort: cohortDims[i] }));
}

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

/** 序列斜率（末值相对首值的归一化变化，可正可负）。用于动量维度。 */
export function seriesSlope(series: number[]): number {
  if (series.length < 2) return 0;
  const first = series[0] || 1;
  const last = series[series.length - 1];
  return (last - first) / first;
}
