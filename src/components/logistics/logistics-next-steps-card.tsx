"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompletionGateResult } from "@/lib/logistics/completion-gate";
import { skuAlignHref } from "@/lib/sku-align/deep-link";

export function LogisticsNextStepsCard({
  pipelineRunning,
  saving,
  autoReadyCount,
  unidentifiedCount,
  reviewCount,
  skuBindingGap,
  completionGate,
  onStartEstimate,
  onSaveAndSync,
  onViewUnidentified,
  onViewIssues,
}: {
  pipelineRunning: boolean;
  saving: boolean;
  autoReadyCount: number;
  unidentifiedCount: number;
  reviewCount: number;
  skuBindingGap: { products: number; skus: number };
  completionGate: CompletionGateResult;
  onStartEstimate: () => void;
  onSaveAndSync: () => void;
  onViewUnidentified: () => void;
  onViewIssues: () => void;
}) {
  if (pipelineRunning) {
    return (
      <div className="rounded-[var(--radius-card)] border border-sky-200 bg-sky-50/80 p-3">
        <div className="flex items-center gap-2 text-xs text-sky-900">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          运费预估进行中，完成后会更新列表状态。
        </div>
      </div>
    );
  }

  type Step = {
    key: string;
    title: string;
    detail: string;
    primary?: boolean;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  };

  const steps: Step[] = [];

  if (autoReadyCount > 0) {
    steps.push({
      key: "estimate",
      title: `一键预估 (${autoReadyCount})`,
      detail: "批量拉取「自动完成」Tab 中待报价 SKU 的线路",
      primary: true,
      onClick: onStartEstimate,
    });
  }

  if (skuBindingGap.skus > 0 || unidentifiedCount > 0) {
    steps.push({
      key: "sku",
      title: "处理未绑定 SKU",
      detail: `${skuBindingGap.skus || unidentifiedCount} 个 SKU 需先完成 SKU 对齐`,
      href: skuAlignHref("partially_linked"),
    });
  }

  if (reviewCount > 0) {
    steps.push({
      key: "issues",
      title: "查看需确认项",
      detail: `${reviewCount} 个邮限/品类异常待人工确认`,
      onClick: onViewIssues,
    });
  }

  if (unidentifiedCount > 0 && skuBindingGap.skus === 0) {
    steps.push({
      key: "unidentified",
      title: "查看无法识别",
      detail: `${unidentifiedCount} 个 SKU 在本页标记为无法识别`,
      onClick: onViewUnidentified,
    });
  }

  const quoteOnlyBlocked =
    completionGate.tier === "blocked" &&
    completionGate.stats.criticalUnquotedCount > 0 &&
    completionGate.stats.missingMeasureCount === 0;

  if (completionGate.tier === "proceed" || completionGate.tier === "confirm") {
    steps.push({
      key: "sync",
      title: completionGate.primaryButtonLabel,
      detail: completionGate.footerHint,
      primary: completionGate.tier === "proceed",
      onClick: onSaveAndSync,
      disabled: saving,
      loading: saving,
    });
  } else if (completionGate.tier === "blocked" && !quoteOnlyBlocked) {
    steps.push({
      key: "blocked",
      title: "先处理阻塞项",
      detail: completionGate.blockers[0] ?? completionGate.footerHint,
      disabled: true,
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-brand-strong" />
        <span className="text-xs font-semibold text-ink">建议下一步</span>
      </div>
      <ul className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.key}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-hairline/80 bg-surface-muted/20 px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-ink">{step.title}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-ink-subtle">
                {step.detail}
              </p>
            </div>
            {step.href ? (
              <Link href={step.href} className="shrink-0">
                <Button size="sm" variant="secondary" className="h-7 text-[11px]">
                  {step.title}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                variant={step.primary ? "primary" : "secondary"}
                className="h-7 shrink-0 text-[11px]"
                onClick={step.onClick}
                disabled={step.disabled}
              >
                {step.loading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                {step.title}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
