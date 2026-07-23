"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { LaunchSummary } from "@/lib/sync/launch-summary";
import { LOGISTICS_LOCAL_CONFIRM_HINT } from "@/lib/sync/fulfillment-copy";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

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
  const t = useT();
  const locale = useLocale();
  const { pricing, logistics } = strategy;

  const shopifyCard = (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{t("sync.cardShopify")}</h3>
        <Link
          href={localePath(locale, shopify.ctaHref)}
          className="text-xs font-medium text-link hover:text-link-hover hover:underline"
        >
          {t("sync.viewProducts")}
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <Metric label={t("sync.mSourceConfirmed")} value={shopify.newListings} />
        <Metric label={t("sync.mSourceLinks")} value={shopify.sourceLinks} />
        <Metric
          label={t("sync.mTitleOpt")}
          value={shopify.showAuditGap ? "—" : shopify.titleOptimizations}
          hint={shopify.showAuditGap ? t("sync.auditPending") : undefined}
        />
        <Metric
          label={t("sync.mPriceAdj")}
          value={shopify.showAuditGap ? "—" : shopify.priceAdjustments}
          hint={shopify.showAuditGap ? t("sync.auditPending") : undefined}
        />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">{t(shopify.footnote)}</p>
    </section>
  );

  const fulfillmentCard = (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{t("sync.cardFulfillment")}</h3>
        <Link
          href={localePath(locale, fulfillment.ctaHref)}
          className="text-xs font-medium text-link hover:text-link-hover hover:underline"
        >
          {t("sync.skuDetails")}
        </Link>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        <Metric label={t("sync.mSkuMap")} value={`${fulfillment.skuMapped}/${fulfillment.skuTotal}`} />
        <Metric
          label={t("sync.mLogisticsConfirm")}
          value={`${fulfillment.logisticsConfirmed}/${fulfillment.logisticsTotal}`}
          hint={fulfillment.showLocalLogisticsGap ? t(LOGISTICS_LOCAL_CONFIRM_HINT) : undefined}
        />
        <Metric label={t("sync.mPendingReview")} value={fulfillment.pendingReview} tone="warning" />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        {t(fulfillment.footnote)}
      </p>
      <div className="mt-3 border-t border-hairline pt-3">
        <p className="text-[10px] font-medium text-ink-muted">{t("sync.currentStrategy")}</p>
        <p className="mt-1 text-xs text-ink">
          {t("sync.pricing")} {pricing.sourceLabel} ×{pricing.exchangeRate} ×{pricing.multiplier} +{pricing.addend} →{" "}
          {pricing.targetCurrency}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {t("nav.logistics")} {logistics.markets} · {logistics.speed} · {logistics.packaging}
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
