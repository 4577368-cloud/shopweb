"use client";

import { useMemo } from "react";
import { Loader2, Sparkles, TrendingDown } from "lucide-react";
import { CopilotCard } from "@/components/workbench/assistant-rail";
import { InfoCard } from "@/components/workbench/info-card";
import { Button } from "@/components/ui/button";
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
  const metrics = computeLogisticsPlanMetrics(analysis);
  const { auto, manual } = countAutoVsManual(decisionStatusCounts);
  const activeRiskAlerts = useMemo(
    () => computeActiveHighRiskAlerts(analysis),
    [analysis]
  );

  const copilot: AiPanelContent = useMemo(() => {
    const bullets: string[] = [
      `已分析 ${metrics.productCount} 个商品 · ${metrics.variantCount} 个 SKU`,
      `AI 自动规划 ${auto} 项 · 待你确认 ${manual} 项`,
    ];
    if (activeTemplate) {
      bullets.push(formatTemplateMeta(activeTemplate));
    }

    const alerts =
      manual > 0
        ? [
            {
              id: "pending-review",
              text: `${manual} 个 SKU 需补充信息或确认邮限，其余已由 AI 完成规划。`,
              targetId: "pending-review",
            },
          ]
        : undefined;

    return {
      title: "AI 物流助手",
      summary:
        pendingCount > 0
          ? `AI 已为 ${metrics.aiAutoCount} 个 SKU 匹配重量、体积与推荐线路。你只需处理 ${pendingCount} 个 AI 无法确定的异常。`
          : metrics.aiAutoCount > 0
            ? "全部 SKU 已完成 AI 物流规划。确认方案后即可保存并进入同步。"
            : "等待 SKU 绑定完成后，AI 将自动读取商品规格并生成履约方案。",
      bullets,
      alerts,
      nextAction:
        readyAcceptCount > 0
          ? {
              label: accepting ? "确认中…" : `一键确认 ${readyAcceptCount} 个方案`,
              action: "accept_all",
              disabled: accepting || quoting,
            }
          : pendingCount > 0
            ? {
                label: "查看待确认项",
                action: "focus_issues",
              }
            : undefined,
    };
  }, [
    activeTemplate,
    auto,
    accepting,
    manual,
    metrics.aiAutoCount,
    metrics.productCount,
    metrics.variantCount,
    pendingCount,
    quoting,
    readyAcceptCount,
  ]);

  const savings = useMemo(() => {
    const tips: string[] = [];
    if (activeTemplate?.speedPreference === "FAST") {
      tips.push("当前偏好「快速」时效，可切换「均衡」模板以降低部分 SKU 运费。");
    }
    if (activeTemplate?.packaging === "CARTON") {
      tips.push("纸箱包装会增加体积重，服装类可尝试「极简包装」。");
    }
    if (tips.length === 0 && metrics.aiAutoCount > 0) {
      tips.push("批量确认 AI 方案可一次完成履约配置，无需逐条处理。");
    }
    return tips;
  }, [activeTemplate, metrics.aiAutoCount]);

  return (
    <div className="flex flex-col gap-2">
      <CopilotCard
        heading="AI 物流助手"
        content={copilot}
        onNextAction={(action) => {
          if (action === "accept_all") onAcceptAllReady();
          if (action === "focus_issues") onFocusStatus("needs_review");
        }}
        onAlertClick={() => onFocusStatus("needs_review")}
      />

      {savings.length > 0 ? (
        <InfoCard
          title="节省成本机会"
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

      <InfoCard title="快捷操作">
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
            确认全部 AI 方案 ({readyAcceptCount})
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
            刷新线路报价
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 justify-start text-xs"
            onClick={onOpenTemplate}
          >
            调整物流模板
          </Button>
        </div>
      </InfoCard>

      {(activeRiskAlerts.length > 0 || !skuReadyForNext) ? (
        <InfoCard title="AI 建议" tone="warning">
          <ul className="space-y-1.5">
            {!skuReadyForNext ? (
              <li>部分商品 SKU 未齐，请先完成 SKU 绑定。</li>
            ) : null}
            {activeRiskAlerts.map((alert) => (
              <li key={alert.type}>{formatActiveHighRiskAlert(alert)}</li>
            ))}
          </ul>
        </InfoCard>
      ) : null}
    </div>
  );
}
