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
  pendingConfirmCount,
  exceptionCount,
  unidentifiedCount,
  skuBindingGap,
  completionGate,
  onSaveAndSync,
  onViewUnidentified,
  onViewPendingConfirm,
  onViewExceptions,
  onAcceptAllReady,
  batchAcceptCount = 0,
}: {
  pipelineRunning: boolean;
  saving: boolean;
  autoReadyCount: number;
  pendingConfirmCount: number;
  exceptionCount: number;
  unidentifiedCount: number;
  skuBindingGap: { products: number; skus: number };
  completionGate: CompletionGateResult;
  onStartEstimate: () => void;
  onSaveAndSync: () => void;
  onViewUnidentified: () => void;
  onViewPendingConfirm: () => void;
  onViewExceptions: () => void;
  onAcceptAllReady?: () => void;
  /** 与 pendingConfirmCount 相同，显式传入便于组件内禁用逻辑 */
  batchAcceptCount?: number;
}) {
  type Step = {
    key: string;
    title: string;
    detail: string;
    actionLabel?: string;
    primary?: boolean;
    href?: string;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    hintOnly?: boolean;
  };

  const steps: Step[] = [];

  if (autoReadyCount > 0) {
    steps.push({
      key: "estimate",
      title: `${autoReadyCount} 个 SKU 待运费预估`,
      detail: "点页面上方「运费预估」批量获取线路报价",
      hintOnly: true,
    });
  }

  if (skuBindingGap.skus > 0 || unidentifiedCount > 0) {
    steps.push({
      key: "sku",
      title: "处理未绑定 SKU",
      detail: `${skuBindingGap.skus || unidentifiedCount} 个 SKU 需先完成 SKU 对齐`,
      actionLabel: "去对齐",
      href: skuAlignHref("partially_linked"),
    });
  }

  if (pendingConfirmCount > 0) {
    steps.push({
      key: "pending-confirm",
      title: `待确认方案（${pendingConfirmCount}）`,
      detail: "已有线路报价，展开商品后点「确认」接受推荐线路",
      actionLabel: "去确认",
      onClick: onViewPendingConfirm,
    });
    if (onAcceptAllReady && batchAcceptCount > 0) {
      steps.push({
        key: "batch-accept",
        title: `批量接受（${batchAcceptCount}）`,
        detail: "一次接受全部已有报价的方案",
        actionLabel: "批量接受",
        primary: true,
        onClick: onAcceptAllReady,
        disabled: pipelineRunning,
      });
    }
  }

  if (exceptionCount > 0) {
    steps.push({
      key: "exceptions",
      title: `邮限/品类异常（${exceptionCount}）`,
      detail: "需核对邮限分类或补充尺寸后再确认",
      actionLabel: "去处理",
      onClick: onViewExceptions,
    });
  }

  if (unidentifiedCount > 0 && skuBindingGap.skus === 0) {
    steps.push({
      key: "unidentified",
      title: "查看无法识别",
      detail: `${unidentifiedCount} 个 SKU 在本页标记为无法识别`,
      actionLabel: "查看",
      onClick: onViewUnidentified,
    });
  }

  const quoteOnlyBlocked =
    completionGate.tier === "blocked" &&
    completionGate.stats.criticalUnquotedCount > 0 &&
    completionGate.stats.missingMeasureCount === 0;

  if (quoteOnlyBlocked && autoReadyCount === 0) {
    steps.push({
      key: "quote-blocked",
      title: completionGate.primaryButtonLabel,
      detail: completionGate.footerHint,
      hintOnly: true,
    });
  } else if (completionGate.tier === "proceed" || completionGate.tier === "confirm") {
    steps.push({
      key: "sync",
      title: completionGate.primaryButtonLabel,
      detail: completionGate.footerHint,
      actionLabel: "进入同步",
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
      hintOnly: true,
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-brand-strong" />
        <span className="text-xs font-semibold text-ink">建议下一步</span>
      </div>

      {pipelineRunning ? (
        <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-sky-200 bg-sky-50/80 px-2.5 py-2 text-xs text-sky-900">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          运费预估进行中，左侧列表会同步更新。
        </div>
      ) : null}

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
            {step.hintOnly ? null : step.href ? (
              <Link href={step.href} className="shrink-0">
                <Button size="sm" variant="secondary">
                  {step.actionLabel ?? "前往"}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            ) : step.onClick ? (
              <Button
                size="sm"
                variant={step.primary ? "primary" : "secondary"}
                className="shrink-0"
                onClick={step.onClick}
                disabled={step.disabled || pipelineRunning}
              >
                {step.loading ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                {step.actionLabel ?? "执行"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
