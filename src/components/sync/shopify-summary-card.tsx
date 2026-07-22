"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { LaunchSummary } from "@/lib/sync/launch-summary";

export function ShopifySummaryCard({
  data,
}: {
  data: LaunchSummary["shopifyWrites"];
}) {
  const metrics = [
    { label: "货源已确认", value: data.newListings },
    { label: "货源关联", value: data.sourceLinks },
    ...(data.showAuditGap
      ? [
          { label: "标题优化", value: "—", muted: true },
          { label: "价格调整", value: "—", muted: true },
        ]
      : [
          { label: "标题优化", value: data.titleOptimizations },
          { label: "价格调整", value: data.priceAdjustments },
        ]),
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <Card className="h-full rounded-2xl shadow-card">
        <CardHeader className="border-b-0 pb-0">
          <CardTitle className="text-base">已上店 Shopify</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pt-2">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-xl border border-hairline bg-surface-muted/40 px-3 py-2.5"
            >
              <p className="text-[11px] text-ink-muted">{metric.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
                {metric.value}
              </p>
            </div>
          ))}
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
