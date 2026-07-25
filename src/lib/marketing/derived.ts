// 运营中心 · 组合派生层（纯函数，无副作用、不依赖后端）。
// 把 pipispy 单次调用返回的多个真实字段，组合成"分析型"派生指标。
// 设计目标：让一次调用的回传被"组合复用"，而不是摊成一张宽表——
// 用户每消耗 1 额度，能看到渗透率 / 分享率 / 动量 / 热度分等多重洞察。
// 所有派生都可从原始字段解释（注释标出来源），不引入任何假设性 AI 结论。

import type { AdCard, RankRow, StoreRow, TtsShopRow } from "./types";

const DAY = 86400;

// --- 竞店威胁分（组合 StoreRow 真实字段）---
export type ThreatLevel = "low" | "mid" | "high" | "critical";
export interface StoreThreat {
  score: number; // 0..100
  level: ThreatLevel;
}
/**
 * 竞店综合威胁分：规模(adCount) × 触达(playCount) × 持久(putDays) × 活跃度(adState) × 达人广度(popularPersonCount)。
 * 全部用真实字段，log 归一化后加权（规模0.25 / 触达0.3 / 持久0.2 / 活跃0.15 / 达人0.1）。
 * 不依赖 mock 的 growthSeries；纯解释性派生，非外部评分机构结论。
 */
export function storeThreat(s: StoreRow): StoreThreat {
  const scale = clamp01(Math.log10(s.adCount + 1) / Math.log10(50000));
  const reach = clamp01(Math.log10(s.playCount + 1) / Math.log10(5e8));
  const persist = clamp01(s.putDays / 365);
  const activeW = s.adState === 1 ? 1 : s.adState === 0 ? 0.4 : 0.1;
  const influencer = clamp01(Math.log10(s.popularPersonCount + 1) / Math.log10(2000));
  const raw = scale * 0.25 + reach * 0.3 + persist * 0.2 + activeW * 0.15 + influencer * 0.1;
  const score = Math.round(raw * 100);
  const level: ThreatLevel =
    score >= 85 ? "critical" : score >= 65 ? "high" : score >= 40 ? "mid" : "low";
  return { score, level };
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
export function safeDiv(a: number, b: number): number {
  return b ? a / b : 0;
}

/** 把 value 在 [min,max] 内线性归一到 0..100（越界夹紧）。 */
export function normalizeTo100(value: number, min: number, max: number): number {
  if (max <= min) return 50;
  return Math.round(clamp01((value - min) / (max - min)) * 100);
}

/** 在有序/无序数组中返回 value 的百分位（0..100，越大越靠前）。 */
export function percentileRank(value: number, arr: number[]): number {
  if (arr.length === 0) return 50;
  const below = arr.filter((v) => v < value).length;
  return Math.round((below / arr.length) * 100);
}

// ---------------------------------------------------------------------------
// TikTok Shop：把 gmv/score/trend/goods/play/share/bestSeller 组合成情报
// ---------------------------------------------------------------------------

export type PriceTier = "low" | "mid" | "high";

export interface TtsSignals {
  /** 广告渗透率 = goods_ad_count / goods_count（0..1）—— 识别激进投放店。来源：goods_ad_count, goods_count */
  adPenetration: number;
  /** 分享率 = share_count / play_count（0..1）—— 病毒系数。来源：share_count, play_count */
  shareRate: number;
  /** GMV/视频 = gmv_usd / video_count（USD）—— 内容转化效率。来源：gmv_usd, video_count */
  gmvPerVideo: number;
  /** 头部 SKU 集中度 = best_selling_goods[0].sales_volume / sales_volume（0..1）—— 对单品依赖度。来源：best_selling_goods, sales_volume */
  topSkuShare: number;
  /** 动量% = sales_trend_data 首末斜率（可负）。来源：sales_trend_data */
  momentumPct: number;
  /** 最近出现距今天数（基于 last_found_time）。来源：last_found_time */
  recencyDays: number | null;
  /** 综合热度分 0..100 = 0.45·GMV(对数) + 0.20·评分 + 0.20·动量 + 0.15·渗透。纯启发式，非 AI。 */
  heatScore: number;
  /** 价格带（基于 avg_price_usd）。来源：avg_price_usd */
  priceTier: PriceTier;
}

export function ttsSignals(row: TtsShopRow, nowSec: number): TtsSignals {
  const adPenetration = clamp01(safeDiv(Number(row.goodsAdCount) || 0, row.goodsCount));
  const shareRate = clamp01(safeDiv(row.shareCount, row.playCount));
  const gmvPerVideo = safeDiv(row.gmvUsd, row.videoCount || 1);
  const topSkuShare = row.bestSellingGoods.length
    ? clamp01(safeDiv(row.bestSellingGoods[0].salesVolume, row.salesVolume))
    : 0;
  const series = row.salesTrendData.map((p) => p.salesVolume);
  const momentumPct =
    series.length >= 2 ? safeDiv(series[series.length - 1] - series[0], series[0] || 1) * 100 : 0;
  const recencyDays = row.lastFoundTime
    ? Math.max(0, Math.round((nowSec - row.lastFoundTime) / DAY))
    : null;

  const gmvNorm = clamp01((Math.log10(Math.max(row.gmvUsd, 1)) - 3) / 5); // 1e3..1e8 → 0..1
  const scoreNorm = clamp01(row.score / 5);
  const momNorm = clamp01((momentumPct + 50) / 100); // -50%..+50% → 0..1
  const heatScore = Math.round(
    100 * (0.45 * gmvNorm + 0.2 * scoreNorm + 0.2 * momNorm + 0.15 * adPenetration)
  );

  const priceTier: PriceTier = row.avgPriceUsd < 5 ? "low" : row.avgPriceUsd < 30 ? "mid" : "high";

  return {
    adPenetration,
    shareRate,
    gmvPerVideo,
    topSkuShare,
    momentumPct,
    recencyDays,
    heatScore,
    priceTier,
  };
}

// ---------------------------------------------------------------------------
// 广告商品：把 ad_platform/images/store/active_days/user_collected 组合成情报
// ---------------------------------------------------------------------------

export type LearnValue = 0 | 1 | 2 | 3;

export interface AdSignals {
  /** 渠道广度 = ad_platform.length。来源：ad_platform[] */
  platformBreadth: number;
  /** 创意数 = images.length。来源：images[] */
  creativeCount: number;
  /** 广告组密度 = adset_count / ad_count。来源：adset_count, ad_count */
  adsetDensity: number;
  /** 店铺投放规模 = store.ad_count（品牌成熟度代理）。来源：store.ad_count */
  storeScale: number;
  /** 投放成熟度天数 = active_days。来源：active_days */
  maturityDays: number;
  /** 收藏热度 = user_collected（社交证明）。来源：user_collected */
  collectibility: number;
  /** 拆解价值等级 0..3（渠道广度 × 创意数 × 店铺规模 的组合判定）。 */
  learnValue: LearnValue;
}

export function adSignals(card: AdCard): AdSignals {
  const platformBreadth = card.adPlatform.length;
  const creativeCount = card.images.length;
  const adsetDensity = safeDiv(card.adsetCount, card.adCount || 1);
  const storeScale = card.store.adCount;
  const maturityDays = card.activeDays;
  const collectibility = card.userCollected;

  let learnValue: LearnValue = 0;
  if (platformBreadth >= 4 && creativeCount >= 4 && storeScale >= 300) learnValue = 3;
  else if (platformBreadth >= 3 && creativeCount >= 3) learnValue = 2;
  else if (platformBreadth >= 2) learnValue = 1;

  return {
    platformBreadth,
    creativeCount,
    adsetDensity,
    storeScale,
    maturityDays,
    collectibility,
    learnValue,
  };
}

// ---------------------------------------------------------------------------
// 排行：growth_rate × count_growth 组合成综合动量（原始值，组件内按页归一化）
// ---------------------------------------------------------------------------

export interface RankSignals {
  /** 综合动量原始值 = growth_rate × (1 + log10(count_growth+1))。来源：growth_rate, count_growth */
  momentumRaw: number;
}

export function rankMomentum(row: RankRow): RankSignals {
  const momentumRaw = row.growthRate * (1 + Math.log10((row.countGrowth || 0) + 1));
  return { momentumRaw };
}
