"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

export function FulfillmentSummaryCard({
  data,
}: {
  data: LaunchSummary["fulfillmentPrep"];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.42 }}
    >
      <Card className="h-full rounded-2xl shadow-card">
        <CardHeader className="border-b-0 pb-0">
          <CardTitle className="text-base">已备履约 Tangbuy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="rounded-xl border border-hairline bg-surface-muted/40 px-3 py-2.5">
            <p className="text-[11px] text-ink-muted">SKU 映射</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
              {data.skuMapped}
              <span className="text-sm font-normal text-ink-subtle">
                {" "}
                / {data.skuTotal}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-hairline bg-surface-muted/40 px-3 py-2.5">
            <p className="text-[11px] text-ink-muted">物流确认</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
              {data.logisticsConfirmed}
              <span className="text-sm font-normal text-ink-subtle">
                {" "}
                / {data.logisticsTotal}
              </span>
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2.5">
            <p className="text-[11px] text-amber-800/80">待复核</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-amber-900">
              {data.pendingReview}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex-col items-start gap-3">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {data.footnote}
          </p>
          <Link href={data.ctaHref}>
            <Button size="sm" variant="secondary">
              {data.ctaLabel}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
