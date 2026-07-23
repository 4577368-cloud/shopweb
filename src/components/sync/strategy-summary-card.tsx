"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/LocaleProvider";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

export function StrategySummaryCard({
  data,
}: {
  data: LaunchSummary["strategy"];
}) {
  const t = useT();
  const { pricing, logistics } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.48 }}
    >
      <Card className="h-full rounded-2xl shadow-card">
        <CardHeader className="border-b-0 pb-0">
          <CardTitle className="text-base">{t("syncUi.strategyTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">{t("syncUi.pricingStrategy")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
              <span className="rounded-md bg-surface-muted px-2 py-1 text-xs">
                {pricing.sourceLabel}
              </span>
              <span className="text-ink-subtle">×</span>
              <span className="tabular-nums">{pricing.exchangeRate}</span>
              <span className="text-ink-subtle">×</span>
              <span className="tabular-nums">{pricing.multiplier}</span>
              <span className="text-ink-subtle">+</span>
              <span className="tabular-nums">{pricing.addend}</span>
              <span className="text-ink-subtle">→</span>
              <span className="rounded-md bg-brand-soft px-2 py-1 text-xs text-brand-strong">
                {pricing.targetCurrency}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-subtle">{pricing.rounding}</p>
          </div>

          <div className="border-t border-hairline pt-3">
            <p className="text-[11px] font-medium text-ink-muted">{t("syncUi.logisticsStrategy")}</p>
            <ul className="mt-2 space-y-1.5 text-xs text-ink">
              <li>{logistics.markets}</li>
              <li>{logistics.speed}</li>
              <li>{logistics.packaging}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
