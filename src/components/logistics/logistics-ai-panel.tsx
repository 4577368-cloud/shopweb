"use client";

import { useMemo } from "react";
import { Loader2, Sparkles, TrendingDown } from "@/lib/ui/icons";
import { CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import {
  computeActiveHighRiskAlerts,
  computeLogisticsPlanMetrics,
  countAutoVsManual,
  formatActiveHighRiskAlert,
  formatTemplateMeta,
} from "@/lib/logistics/display";
import type {
  AiPanelContent,
  LogisticsAnalysis,
  LogisticsDecisionStatus,
  LogisticsTemplate,
} from "@/lib/types";

export function LogisticsAiPanel({
  analysis,
  activeTemplate,
  decisionStatusCounts,
  skuReadyForNext,
  quoting,
  accepting,
  readyAcceptCount,
  pendingCount,
  onFocusStatus,
  onAcceptAllReady,
  onFetchQuotes,
  onOpenTemplate,
}: {
  analysis: LogisticsAnalysis | null;
  activeTemplate: LogisticsTemplate | null;
  decisionStatusCounts?: Record<LogisticsDecisionStatus, number>;
  skuReadyForNext: boolean;
  quoting: boolean;
  accepting: boolean;
  readyAcceptCount: number;
  pendingCount: number;
  onFocusStatus: (status: LogisticsDecisionStatus) => void;
  onAcceptAllReady: () => void;
  onFetchQuotes: () => void;
  onOpenTemplate: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const metrics = computeLogisticsPlanMetrics(analysis);
  const { auto, manual } = countAutoVsManual(decisionStatusCounts);
  const activeRiskAlerts = useMemo(
    () => computeActiveHighRiskAlerts(analysis),
    [analysis]
  );

  const copilot: AiPanelContent = useMemo(() => {
    const bullets: string[] = [
      t("logisticsAi.analyzedSummary", {
        products: metrics.productCount,
        skus: metrics.variantCount,
      }),
      t("logisticsAi.autoManualSummary", { auto, manual }),
    ];
    if (activeTemplate) {
      bullets.push(formatTemplateMeta(t, activeTemplate, locale));
    }

    const alerts =
      manual > 0
        ? [
            {
              id: "pending-review",
              text: t("logisticsAi.supplementHint", { manual }),
              targetId: "pending-review",
            },
          ]
        : undefined;

    return {
      title: t("logisticsAi.title"),
      summary:
        pendingCount > 0
          ? t("logisticsAi.subtitleAuto", {
              count: metrics.aiAutoCount,
              pending: pendingCount,
            })
          : metrics.aiAutoCount > 0
            ? t("logisticsAi.subtitleAllDone")
            : t("logisticsAi.subtitleWaitingSku"),
      bullets,
      alerts,
      nextAction:
        readyAcceptCount > 0
          ? {
              label: accepting
                ? t("logisticsAi.confirmAccepting")
                : t("logisticsAi.confirmLabel", { count: readyAcceptCount }),
              action: "accept_all",
              disabled: accepting || quoting,
            }
          : pendingCount > 0
            ? {
                label: t("logisticsAi.viewPending"),
                action: "focus_issues",
              }
            : undefined,
    };
  }, [
    activeTemplate,
    auto,
    accepting,
    locale,
    manual,
    metrics.aiAutoCount,
    metrics.productCount,
    metrics.variantCount,
    pendingCount,
    quoting,
    readyAcceptCount,
    t,
  ]);

  const savings = useMemo(() => {
    const tips: string[] = [];
    if (activeTemplate?.speedPreference === "FAST") {
      tips.push(t("logisticsAi.tipFastToBalanced"));
    }
    if (activeTemplate?.packaging === "CARTON") {
      tips.push(t("logisticsAi.tipCartonToMinimal"));
    }
    if (tips.length === 0 && metrics.aiAutoCount > 0) {
      tips.push(t("logisticsAi.tipBatchConfirm"));
    }
    return tips;
  }, [activeTemplate, metrics.aiAutoCount, t]);

  return (
    <div className="flex flex-col gap-2">
      <CopilotCard
        heading={t("logisticsAi.heading")}
        content={copilot}
        onNextAction={(action) => {
          if (action === "accept_all") onAcceptAllReady();
          if (action === "focus_issues") onFocusStatus("needs_review");
        }}
        onAlertClick={() => onFocusStatus("needs_review")}
      />

      {savings.length > 0 ? (
        <InfoCard
          title={t("logisticsAi.savingsTitle")}
          icon={<TrendingDown className="h-3.5 w-3.5 text-brand" />}
          tone="brand"
        >
          <ul className="space-y-1.5">
            {savings.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </InfoCard>
      ) : null}

      <InfoCard title={t("logisticsAi.quickActionsTitle")}>
        <div className="flex flex-col gap-2">
          <Button
            size="sm"
            className="h-8 justify-start text-xs"
            disabled={readyAcceptCount === 0 || accepting || quoting}
            onClick={onAcceptAllReady}
          >
            {accepting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("logisticsAi.confirmAll", { count: readyAcceptCount })}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start text-xs"
            disabled={metrics.aiAutoCount === 0 || quoting}
            onClick={onFetchQuotes}
          >
            {quoting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            {t("logisticsAi.refreshQuotes")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start text-xs"
            onClick={onOpenTemplate}
          >
            {t("logisticsAi.adjustTemplate")}
          </Button>
        </div>
      </InfoCard>

      {(activeRiskAlerts.length > 0 || !skuReadyForNext) ? (
        <InfoCard title={t("logisticsAi.aiSuggestTitle")} tone="warning">
          <ul className="space-y-1.5">
            {!skuReadyForNext ? (
              <li>{t("logisticsAi.skuGapHint")}</li>
            ) : null}
            {activeRiskAlerts.map((alert) => (
              <li key={alert.type}>{formatActiveHighRiskAlert(t, alert)}</li>
            ))}
          </ul>
        </InfoCard>
      ) : null}
    </div>
  );
}
