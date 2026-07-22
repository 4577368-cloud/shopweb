"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

export function LaunchMetricsGrid({
  shopify,
  fulfillment,
  strategy,
  column = "both",
}: {
  shopify: LaunchSummary["shopifyWrites"];
  fulfillment: LaunchSummary["fulfillmentPrep"];
  strategy: LaunchSummary["strategy"];
  /** Render one column inside the sync page 2-col layout, or both in a row. */
  column?: "both" | "shopify" | "fulfillment";
}) {
  const { pricing, logistics } = strategy;

  const shopifyCard = (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">已上店 · Shopify</h3>
        <Link
          href={shopify.ctaHref}
          className="text-xs font-medium text-brand-strong hover:underline"
        >
          查看商品
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Metric label="货源已确认" value={shopify.newListings} />
        <Metric label="货源关联" value={shopify.sourceLinks} />
        <Metric
          label="标题优化"
          value={shopify.showAuditGap ? "—" : shopify.titleOptimizations}
          hint={shopify.showAuditGap ? "待接入审计" : undefined}
        />
        <Metric
          label="价格调整"
          value={shopify.showAuditGap ? "—" : shopify.priceAdjustments}
          hint={shopify.showAuditGap ? "待接入审计" : undefined}
        />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">{shopify.footnote}</p>
    </section>
  );

  const fulfillmentCard = (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">已备履约 · Tangbuy</h3>
        <Link
          href={fulfillment.ctaHref}
          className="text-xs font-medium text-brand-strong hover:underline"
        >
          SKU 详情
        </Link>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <Metric
          label="SKU 映射"
          value={`${fulfillment.skuMapped}/${fulfillment.skuTotal}`}
        />
        <Metric
          label="物流确认"
          value={`${fulfillment.logisticsConfirmed}/${fulfillment.logisticsTotal}`}
        />
        <Metric label="待复核" value={fulfillment.pendingReview} tone="warning" />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        {fulfillment.footnote}
      </p>
      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-[10px] font-medium text-ink-muted">当前策略</p>
        <p className="mt-1 text-xs text-ink">
          定价 CNY ×{pricing.exchangeRate} ×{pricing.multiplier} +{pricing.addend} →{" "}
          {pricing.targetCurrency}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          物流 {logistics.markets} · {logistics.speed} · {logistics.packaging}
        </p>
      </div>
    </section>
  );

  if (column === "shopify") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {shopifyCard}
      </motion.div>
    );
  }

  if (column === "fulfillment") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {fulfillmentCard}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
    >
      {shopifyCard}
      {fulfillmentCard}
    </motion.div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div>
      <dt className="text-[10px] text-ink-muted">{label}</dt>
      <dd
        className={
          tone === "warning"
            ? "mt-0.5 text-lg font-semibold tabular-nums text-amber-800"
            : "mt-0.5 text-lg font-semibold tabular-nums text-ink"
        }
      >
        {value}
      </dd>
      {hint ? <p className="text-[10px] text-ink-subtle">{hint}</p> : null}
    </div>
  );
}
