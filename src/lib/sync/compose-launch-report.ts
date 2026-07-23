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

/** Narrative launch report from real summary data (≤1000 字). */
export function composeLaunchReport(summary: LaunchSummary): string {
  const { meta, stats, shopifyWrites, fulfillmentPrep, strategy, followUps, products } =
    summary;
  const { pricing, logistics } = strategy;

  const shopLabel = meta.shopName?.trim() || meta.shopDomain?.trim() || "你的店铺";
  const linked = stats.sourceLinksConfirmed + stats.sourceLinksPending;
  const ceremonyCount = stats.productsInCeremony || products.length;

  const paragraphs: string[] = [];

  paragraphs.push(
    `【开店准备报告】${shopLabel} · ${meta.completedAt || "刚刚完成汇总"}`
  );

  paragraphs.push(
    `店铺镜像共 ${stats.productsTotal} 件商品，本次仪式纳入 ${ceremonyCount} 件代表性商品轮播展示。` +
      (stats.productsTotal > ceremonyCount
        ? `其余商品数据已写入准备清单，可在选品页继续处理。`
        : `商品镜像已与 Shopify 侧对齐。`)
  );

  if (stats.sourceLinksTotal > 0) {
    const parts = [
      `货源关联：${linked}/${stats.sourceLinksTotal} 件已建立绑定`,
      `其中已确认 ${stats.sourceLinksConfirmed}`,
    ];
    if (stats.sourceLinksPending > 0) {
      parts.push(`待你确认 ${stats.sourceLinksPending}`);
    }
    if (shopifyWrites.newListings > 0) {
      parts.push(`正式落库 ${shopifyWrites.newListings} 件`);
    }
    paragraphs.push(`${parts.join("，")}。`);
  } else {
    paragraphs.push(`货源关联：店铺商品镜像已就绪，尚未建立采购绑定，建议回到选品页完成关联。`);
  }

  if (stats.skuTotal > 0) {
    const skuPct = Math.round((stats.skuMapped / stats.skuTotal) * 100);
    paragraphs.push(
      `SKU 履约映射：${stats.skuMapped}/${stats.skuTotal} 个变体已完成映射（约 ${skuPct}%）。` +
        (fulfillmentPrep.pendingReview > 0
          ? `仍有 ${fulfillmentPrep.pendingReview} 项待复核，不影响已映射变体履约。`
          : `变体规格已与货源 SKU 对齐，可支撑后续采购与发货。`)
    );
  } else {
    paragraphs.push(`SKU 映射：当前暂无变体数据，待商品同步完成后自动纳入。`);
  }

  if (stats.logisticsTotal > 0) {
    const logParts = [`物流方案：共 ${stats.logisticsTotal} 个变体纳入模板`];
    if (stats.logisticsQuoted > 0) {
      logParts.push(`已拉取报价 ${stats.logisticsQuoted}`);
    }
    if (stats.logisticsConfirmed > 0) {
      logParts.push(`本应用暂存确认 ${stats.logisticsConfirmed}`);
    }
    const remain = stats.logisticsTotal - stats.logisticsConfirmed;
    if (remain > 0) {
      logParts.push(`尚有 ${remain} 个待确认或待报价`);
    }
    paragraphs.push(
      `${logParts.join("，")}。目标市场 ${logistics.markets}，策略为 ${logistics.speed} · ${logistics.packaging}。物流确认记录尚未同步履约系统。`
    );
  } else {
    paragraphs.push(
      `物流方案：模板方向为 ${logistics.markets}（${logistics.speed}），待保存模板后为变体拉取线路报价。`
    );
  }

  if (!pricing.isDefault) {
    paragraphs.push(
      `定价策略：按 ${pricing.sourceLabel} × 汇率 ${pricing.exchangeRate} × 倍率 ${pricing.multiplier} + ${pricing.addend}，结算币种 ${pricing.targetCurrency}。${pricing.rounding}`
    );
  } else {
    paragraphs.push(`定价策略：尚未保存专属模板，上架价格将沿用店铺默认规则。`);
  }

  if (followUps.length > 0) {
    const titles = followUps
      .slice(0, 4)
      .map((item) => item.title)
      .join("；");
    paragraphs.push(
      `待关注事项 ${followUps.length} 项：${titles}。` +
        `这些不影响本次开店仪式完成，建议同步后在对应页面逐项处理。`
    );
  } else {
    paragraphs.push(
      `待关注事项：未发现阻塞开业的异常项。店铺商品与 SKU 映射已具备基础条件；物流确认暂存于本应用，尚未同步履约系统。`
    );
  }

  paragraphs.push(
    `— 报告完 — 数据来自店铺镜像、货源绑定、SKU 对齐与物流分析${meta.dataSource === "mock" ? "（演示数据）" : ""}。`
  );

  return truncateAtBoundary(paragraphs.join("\n\n"), LAUNCH_REPORT_MAX_CHARS);
}
