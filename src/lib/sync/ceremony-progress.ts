import type { ProgressTask } from "@/lib/sync/launch-summary";

export const CEREMONY_PROGRESS_MS = 15_000;
export const CEREMONY_HOLD_MS = 5_000;

export type CeremonyTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string;

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
  t: CeremonyTranslate,
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
        ? t("syncCeremony.taskLogisticsQuoted", {
            quoted: shownQuoted,
            confirmed: shownConfirmed,
            total: p.logisticsTotal,
          })
        : t("syncCeremony.taskLogisticsConfirmed", {
            confirmed: shownConfirmed,
            total: p.logisticsTotal,
          })
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
      label: t("syncCeremony.taskScanProducts"),
      detail: t("syncCeremony.taskProductsDetail", {
        shown: shownProducts,
        total: p.productsTotal,
      }),
      status: showFull || pct >= 25 ? "done" : pct > 0 ? "running" : "pending",
    },
    {
      id: "source-links",
      label: t("syncCeremony.taskSourceLinks"),
      detail: t("syncCeremony.taskSourceDetail", {
        shown: shownSources,
        total: p.sourceLinksTotal,
      }),
      status: showFull || pct >= 50 ? "done" : pct >= 20 ? "running" : "pending",
    },
    {
      id: "sku-map",
      label: t("syncCeremony.taskSkuMap"),
      detail:
        p.skuTotal > 0
          ? t("syncCeremony.taskSkuDetail", {
              shown: shownSku,
              total: p.skuTotal,
            })
          : t("syncCeremony.taskSkuEmpty"),
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
      label: t("syncCeremony.taskLogistics"),
      detail: logisticsDetail,
      status: logisticsStatus,
    },
    {
      id: "report",
      label: t("syncCeremony.taskReport"),
      detail:
        showFull || pct >= 100
          ? t("syncCeremony.taskReportDone")
          : pct >= 90
            ? t("syncCeremony.taskReportGenerating")
            : undefined,
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
