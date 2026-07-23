import type { TranslateFn } from "@/i18n/server";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

export const LAUNCH_REPORT_MAX_CHARS = 1000;

function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastBreak = Math.max(
    slice.lastIndexOf("\n"),
    slice.lastIndexOf("。"),
    slice.lastIndexOf("；")
  );
  if (lastBreak > max * 0.7) {
    return slice.slice(0, lastBreak + 1).trimEnd();
  }
  return `${slice.trimEnd()}…`;
}

/** Narrative launch report from real summary data (≤1000 chars). */
export function composeLaunchReport(summary: LaunchSummary, t: TranslateFn): string {
  const { meta, stats, shopifyWrites, fulfillmentPrep, strategy, followUps, products } =
    summary;
  const { pricing, logistics } = strategy;

  const shopLabel =
    meta.shopName?.trim() ||
    meta.shopDomain?.trim() ||
    t("launchReport.defaultShopLabel");
  const linked = stats.sourceLinksConfirmed + stats.sourceLinksPending;
  const ceremonyCount = stats.productsInCeremony || products.length;

  const paragraphs: string[] = [];

  paragraphs.push(
    t("launchReport.title", {
      shopLabel,
      completedAt: meta.completedAt || t("launchReport.justCompleted"),
    })
  );

  paragraphs.push(
    t("launchReport.introMirror", {
      productsTotal: stats.productsTotal,
      ceremonyCount,
    }) +
      (stats.productsTotal > ceremonyCount
        ? t("launchReport.introRest")
        : t("launchReport.introRestAligned"))
  );

  if (stats.sourceLinksTotal > 0) {
    const parts = [
      t("launchReport.sourceLinked", {
        linked,
        total: stats.sourceLinksTotal,
      }),
      t("launchReport.sourceConfirmed", { count: stats.sourceLinksConfirmed }),
    ];
    if (stats.sourceLinksPending > 0) {
      parts.push(t("launchReport.sourcePending", { count: stats.sourceLinksPending }));
    }
    if (shopifyWrites.newListings > 0) {
      parts.push(t("launchReport.sourceListed", { count: shopifyWrites.newListings }));
    }
    paragraphs.push(`${parts.join("，")}。`);
  } else {
    paragraphs.push(t("launchReport.sourceNone"));
  }

  if (stats.skuTotal > 0) {
    const skuPct = Math.round((stats.skuMapped / stats.skuTotal) * 100);
    paragraphs.push(
      t("launchReport.skuMapped", {
        mapped: stats.skuMapped,
        total: stats.skuTotal,
        percent: skuPct,
      }) +
        (fulfillmentPrep.pendingReview > 0
          ? t("launchReport.skuPendingReview", { count: fulfillmentPrep.pendingReview })
          : "")
    );
  } else {
    paragraphs.push(t("launchReport.skuNone"));
  }

  if (stats.logisticsTotal > 0) {
    const logParts = [t("launchReport.logisticsIntro", { total: stats.logisticsTotal })];
    if (stats.logisticsQuoted > 0) {
      logParts.push(t("launchReport.logisticsQuoted", { count: stats.logisticsQuoted }));
    }
    if (stats.logisticsConfirmed > 0) {
      logParts.push(
        t("launchReport.logisticsConfirmed", { count: stats.logisticsConfirmed })
      );
    }
    const remain = stats.logisticsTotal - stats.logisticsConfirmed;
    if (remain > 0) {
      logParts.push(t("launchReport.logisticsRemain", { count: remain }));
    }
    paragraphs.push(
      `${logParts.join("，")}。` +
        t("launchReport.logisticsTemplate", {
          markets: logistics.markets,
          speed: logistics.speed,
          packaging: logistics.packaging,
        })
    );
  } else {
    paragraphs.push(
      t("launchReport.logisticsNoData", {
        markets: logistics.markets,
        speed: logistics.speed,
      })
    );
  }

  if (!pricing.isDefault) {
    paragraphs.push(
      t("launchReport.pricingSaved", {
        sourceLabel: pricing.sourceLabel,
        exchangeRate: pricing.exchangeRate,
        multiplier: pricing.multiplier,
        addend: pricing.addend,
        targetCurrency: pricing.targetCurrency,
        rounding: pricing.rounding,
      })
    );
  } else {
    paragraphs.push(t("launchReport.pricingNone"));
  }

  if (followUps.length > 0) {
    const titles = followUps
      .slice(0, 4)
      .map((item) => item.title)
      .join("；");
    paragraphs.push(
      t("launchReport.followUpList", {
        count: followUps.length,
        titles,
      })
    );
  } else {
    paragraphs.push(t("launchReport.followUpNone"));
  }

  paragraphs.push(
    t("launchReport.footer", {
      demoNote: meta.dataSource === "mock" ? t("launchReport.demoNote") : "",
    })
  );

  return truncateAtBoundary(paragraphs.join("\n\n"), LAUNCH_REPORT_MAX_CHARS);
}
