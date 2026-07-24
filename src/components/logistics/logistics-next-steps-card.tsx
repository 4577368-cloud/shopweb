"use client";

import Link from "next/link";
import { ArrowRight, Loader2, Sparkles } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import type { CompletionGateResult } from "@/lib/logistics/completion-gate";
import { skuAlignHref } from "@/lib/sku-align/deep-link";
import { useT } from "@/i18n/LocaleProvider";

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
  batchAcceptCount?: number;
}) {
  const t = useT();

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
      title: t("logisticsUi.estimatePendingTitle", { count: autoReadyCount }),
      detail: t("logisticsUi.estimatePendingDetail"),
      hintOnly: true,
    });
  }

  if (skuBindingGap.skus > 0 || unidentifiedCount > 0) {
    steps.push({
      key: "sku",
      title: t("logisticsUi.skuGapTitle"),
      detail: t("logisticsUi.skuGapDetail", {
        count: skuBindingGap.skus || unidentifiedCount,
      }),
      actionLabel: t("logisticsUi.goAlign"),
      href: skuAlignHref("partially_linked"),
    });
  }

  if (pendingConfirmCount > 0 && onAcceptAllReady && batchAcceptCount > 0) {
    steps.push({
      key: "batch-accept",
      title: t("logisticsUi.batchAcceptTitle", { count: batchAcceptCount }),
      detail: t("logisticsUi.batchAcceptDetail"),
      actionLabel: t("logisticsUi.acceptAll"),
      primary: true,
      onClick: onAcceptAllReady,
      disabled: pipelineRunning,
    });
  } else if (pendingConfirmCount > 0) {
    steps.push({
      key: "pending-confirm",
      title: t("logisticsUi.pendingConfirmTitle", { count: pendingConfirmCount }),
      detail: t("logisticsUi.pendingConfirmDetail"),
      actionLabel: t("logisticsUi.goHandle"),
      onClick: onViewPendingConfirm,
    });
  }

  if (exceptionCount > 0) {
    steps.push({
      key: "exceptions",
      title: t("logisticsUi.exceptionsTitle", { count: exceptionCount }),
      detail: t("logisticsUi.exceptionsDetail"),
      actionLabel: t("logisticsUi.goHandle"),
      onClick: onViewExceptions,
    });
  }

  if (unidentifiedCount > 0 && skuBindingGap.skus === 0) {
    steps.push({
      key: "unidentified",
      title: t("logisticsUi.unidentifiedTitle"),
      detail: t("logisticsUi.unidentifiedDetail", { count: unidentifiedCount }),
      actionLabel: t("logisticsUi.view"),
      onClick: onViewUnidentified,
    });
  }

  const quoteOnlyBlocked =
    completionGate.tier === "blocked" &&
    completionGate.stats.criticalUnquotedCount > 0 &&
    completionGate.stats.missingMeasureCount === 0;

  if (completionGate.canProceedToSync) {
    steps.push({
      key: "sync",
      title: t("logisticsUi.goSync"),
      detail: completionGate.footerHint,
      actionLabel: t("logisticsUi.goSync"),
      primary: true,
      onClick: onSaveAndSync,
      disabled: saving,
      loading: saving,
    });
  } else if (quoteOnlyBlocked) {
    steps.push({
      key: "quote-blocked",
      title: completionGate.primaryButtonLabel,
      detail: completionGate.footerHint,
      hintOnly: true,
    });
  } else if (completionGate.tier === "blocked") {
    steps.push({
      key: "blocked",
      title: t("logisticsUi.blockedTitle"),
      detail: completionGate.blockers[0] ?? completionGate.footerHint,
      hintOnly: true,
    });
  }

  if (steps.length === 0) return null;

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-brand-strong" />
        <span className="text-xs font-semibold text-ink">{t("logisticsUi.suggestedNext")}</span>
      </div>

      {pipelineRunning ? (
        <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-control)] border border-sky-200 bg-sky-50/80 px-2.5 py-2 text-xs text-sky-900">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          {t("logisticsUi.pipelineRunning")}
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
                  {step.actionLabel ?? t("logisticsUi.goDefault")}
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
                {step.actionLabel ?? t("logisticsUi.execute")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
