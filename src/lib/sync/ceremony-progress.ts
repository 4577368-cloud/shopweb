import type { ProgressTask } from "@/lib/sync/launch-summary";

export const CEREMONY_PROGRESS_MS = 15_000;
export const CEREMONY_HOLD_MS = 5_000;

export interface CeremonyStats {
  productsTotal: number;
  productsInCeremony: number;
  sourceLinksConfirmed: number;
  sourceLinksTotal: number;
  sourceLinksPending: number;
  skuMapped: number;
  skuTotal: number;
  logisticsQuoted: number;
  logisticsConfirmed: number;
  logisticsTotal: number;
}

export function interpolateStat(target: number, percent: number): number {
  if (target <= 0) return 0;
  return Math.min(target, Math.max(0, Math.round((target * percent) / 100)));
}

export function displayStat(
  target: number,
  percent: number,
  showFull: boolean
): number {
  return showFull ? target : interpolateStat(target, percent);
}

export function buildCeremonyTasks(
  stats: CeremonyStats,
  percent: number,
  showFull: boolean
): ProgressTask[] {
  const p = stats;
  const pct = showFull ? 100 : percent;

  const shownProducts = displayStat(
    p.productsInCeremony || p.productsTotal,
    pct,
    showFull
  );
  const shownSources = displayStat(
    p.sourceLinksConfirmed + p.sourceLinksPending,
    pct,
    showFull
  );
  const shownSku = displayStat(p.skuMapped, pct, showFull);
  const shownQuoted = displayStat(p.logisticsQuoted, pct, showFull);
  const shownConfirmed = displayStat(p.logisticsConfirmed, pct, showFull);

  const logisticsDetail =
    p.logisticsTotal > 0
      ? p.logisticsQuoted > 0
        ? `已报价 ${shownQuoted} · 已确认 ${shownConfirmed} / ${p.logisticsTotal}`
        : `已确认 ${shownConfirmed} / ${p.logisticsTotal}`
      : undefined;

  const logisticsStatus =
    showFull || pct >= 95
      ? "done"
      : pct >= 70
        ? "running"
        : p.logisticsQuoted > 0
          ? "running"
          : "pending";

  return [
    {
      id: "products",
      label: "扫描店铺商品",
      detail: `${shownProducts} / ${p.productsTotal} 件`,
      status: showFull || pct >= 25 ? "done" : pct > 0 ? "running" : "pending",
    },
    {
      id: "source-links",
      label: "汇总货源关联",
      detail: `${shownSources} / ${p.sourceLinksTotal} 商品`,
      status: showFull || pct >= 50 ? "done" : pct >= 20 ? "running" : "pending",
    },
    {
      id: "sku-map",
      label: "核对 SKU 履约映射",
      detail:
        p.skuTotal > 0 ? `${shownSku} / ${p.skuTotal} 变体` : "暂无 SKU 数据",
      status:
        showFull || pct >= 75
          ? "done"
          : pct >= 45
            ? "running"
            : p.skuMapped > 0
              ? "running"
              : "pending",
    },
    {
      id: "logistics",
      label: "归档物流方案",
      detail: logisticsDetail,
      status: logisticsStatus,
    },
    {
      id: "report",
      label: "生成开店准备报告",
      detail: showFull || pct >= 100 ? "完成" : pct >= 90 ? "生成中" : undefined,
      status: showFull || pct >= 100 ? "done" : pct >= 90 ? "running" : "pending",
    },
  ];
}

export const SYNC_CEREMONY_DONE_KEY = "sync-ceremony-done";
/** Set only after user opens the detail summary from the completion screen. */
export const SYNC_CEREMONY_SUMMARY_VIEWED_KEY = "sync-ceremony-summary-viewed";

export function ceremonyProductIndex(percent: number, productCount: number): number {
  if (productCount <= 0) return 0;
  const slot = Math.floor((percent / 100) * productCount);
  return Math.min(productCount - 1, Math.max(0, slot));
}
