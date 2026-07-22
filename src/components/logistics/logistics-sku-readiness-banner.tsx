"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { skuAlignHref } from "@/lib/sku-align/deep-link";

export function LogisticsSkuReadinessBanner({
  issueProductCount,
  issueSkuCount,
}: {
  issueProductCount: number;
  issueSkuCount: number;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/90 px-4 py-3">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            SKU 绑定未完成 · {issueProductCount} 个商品 · {issueSkuCount} 个 SKU
          </p>
          <p className="mt-0.5 text-xs text-amber-900/75">
            未绑定 SKU 不会参与自动报价；已绑定部分仍可在本页完成物流确认。
          </p>
        </div>
        <Link href={skuAlignHref("partially_linked")} className="shrink-0">
          <Button size="sm" variant="secondary" className="h-8 text-xs">
            查看待处理 SKU
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
