"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2, TrendingDown } from "@/lib/ui/icons";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import {
  type LogisticsCommandClassifyContext,
} from "@/lib/agents/logistics/classify-command";
import { classifyLogisticsCommandInput } from "@/lib/agents/logistics/command-client";
import { getLogisticsCommandUIConfig } from "@/lib/agents/logistics/command-ui-config";
import {
  planLogisticsCommand,
  commandRequiresConfirmation,
  resolveLogisticsCommandExecution,
} from "@/lib/agents/logistics/plan-command";
import type { LogisticsCommandExecution, LogisticsCommandPlan, LogisticsDecisionStatus } from "@/lib/agents/logistics/command-schema";
import type { SkillExecutionFeedback } from "@/lib/agents/logistics/skills";
import { buildLogisticsSkillFeedback, logisticsCommandBelongsToSkill } from "@/lib/agents/logistics/skills";
import { readableError } from "@/lib/api";
import { LogisticsPipelineTaskCard } from "@/components/logistics/logistics-pipeline-task-card";
import { CommandAgentExecution } from "@/components/workbench/command-agent-execution";
import { SkillFeedbackCard } from "@/components/workbench/skill-feedback-card";
import type { LogisticsPipelineProgress } from "@/lib/logistics/incremental-pipeline";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import type { ConfirmPreviewResult } from "@/components/select/command-confirm-card";
import type { ExecutionStep, BatchProgress } from "@/components/select/execution-pipeline";
import type { LogisticsAnalysis, LogisticsTemplate } from "@/lib/types";
import type { LogisticsPlanMetrics } from "@/lib/logistics/display";
import {
  computeActiveHighRiskAlerts,
  formatActiveHighRiskAlert,
} from "@/lib/logistics/display";
import type { CompletionGateResult } from "@/lib/logistics/completion-gate";
import { LogisticsNextStepsCard } from "@/components/logistics/logistics-next-steps-card";

export type LogisticsPreviewGenerator = (
  plan: LogisticsCommandPlan,
  shopName: string
) => Promise<ConfirmPreviewResult>;

export type LogisticsCommandExecutor = (payload: Record<string, unknown>) => Promise<void>;

export interface LogisticsAgentPanelProps {
  analysis: LogisticsAnalysis | null;
  activeTemplate: LogisticsTemplate | null;
  decisionStatusCounts?: Record<LogisticsDecisionStatus, number>;
  skuReadyForNext: boolean;
  quoting: boolean;
  accepting: boolean;
  onFocusStatus: (status: LogisticsDecisionStatus) => void;
  onAcceptAllReady: () => void;
  onFetchQuotes: () => void;
  onOpenTemplate: () => void;
  pipelineProgress?: LogisticsPipelineProgress;
  pipelineActive?: boolean;
  pendingReviewCount?: number;
  onRetryPipeline?: () => void;
  onCancelPipeline?: () => void;
  previewGenerators?: Record<string, LogisticsPreviewGenerator>;
  commandExecutors?: Record<string, LogisticsCommandExecutor>;
  planMetrics?: LogisticsPlanMetrics;
  completionGate?: CompletionGateResult;
  pipelineRunning?: boolean;
  saving?: boolean;
  skuBindingGap?: { products: number; skus: number };
  onStartEstimate?: () => void;
  onSaveAndSync?: () => void;
  onViewUnidentified?: () => void;
  onViewPendingConfirm?: () => void;
  onViewExceptions?: () => void;
  /** @deprecated use onViewPendingConfirm */
  onViewIssues?: () => void;
  /** Apply list tab filter (agent / skill next-steps). */
  onSetFilter?: (filterMode: string) => void;
  /** Signal in-flight batch accept to stop between chunks. */
  onCancelBatchAccept?: () => void;
  catalogIngestingCount?: number;
}

export function LogisticsAgentPanel({
  analysis,
  activeTemplate,
  decisionStatusCounts,
  skuReadyForNext,
  quoting,
  accepting,
  onFocusStatus,
  onAcceptAllReady,
  onFetchQuotes,
  onOpenTemplate,
  pipelineProgress,
  pipelineActive = false,
  pendingReviewCount,
  onRetryPipeline,
  onCancelPipeline,
  previewGenerators = {},
  commandExecutors = {},
  planMetrics,
  completionGate,
  pipelineRunning = false,
  saving = false,
  skuBindingGap = { products: 0, skus: 0 },
  onStartEstimate,
  onSaveAndSync,
  onViewUnidentified,
  onViewPendingConfirm,
  onViewExceptions,
  onViewIssues,
  onSetFilter,
  onCancelBatchAccept,
  catalogIngestingCount = 0,
}: LogisticsAgentPanelProps) {
  const t = useT();
  const locale = useLocale();
  const [commandPlan, setCommandPlan] = useState<LogisticsCommandPlan | null>(null);
  const [commandExecuting, setCommandExecuting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [clarify, setClarify] = useState<string | null>(null);
  const [preview, setPreview] = useState<ConfirmPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [execStep, setExecStep] = useState<ExecutionStep | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [skillFeedback, setSkillFeedback] = useState<SkillExecutionFeedback | null>(null);
  const requestSeq = useRef(0);
  const previewSeq = useRef(0);

  const uiConfig = useMemo(
    () =>
      commandPlan
        ? getLogisticsCommandUIConfig(commandPlan.draft.intent)
        : null,
    [commandPlan]
  );

  const productCount = analysis?.productProfiles?.length ?? 0;
  const variantCount = analysis?.totalVariants ?? 0;

  const activeRiskAlerts = useMemo(
    () => computeActiveHighRiskAlerts(analysis),
    [analysis]
  );

  const batchAcceptCount = planMetrics?.pendingConfirmCount ?? 0;
  const pendingQuoteCount = planMetrics?.pendingQuoteCount ?? 0;
  const exceptionCount = planMetrics?.exceptionCount ?? 0;
  const confirmedCount = planMetrics?.confirmedCount ?? 0;

  const exampleCommands = useMemo(() => {
    const examples: string[] = [];
    if (!pipelineActive && batchAcceptCount > 0) {
      examples.push(t("logisticsAgent.exampleBatchAccept"));
    }
    examples.push(
      t("logisticsAgent.exampleFullEstimate"),
      t("logisticsAgent.exampleAdjustTemplate"),
      t("logisticsAgent.exampleViewIssues")
    );
    return examples;
  }, [batchAcceptCount, pipelineActive, t]);

  const classifyContext = useMemo<LogisticsCommandClassifyContext>(() => ({
    focusProductTitle: null,
    focusProductId: null,
    currentFilter: null,
    readyAcceptCount: batchAcceptCount,
    pendingCount: pendingQuoteCount + batchAcceptCount + exceptionCount,
    confirmedCount,
    highRiskTypes: activeRiskAlerts.map((a) => a.type),
  }), [batchAcceptCount, pendingQuoteCount, exceptionCount, confirmedCount, activeRiskAlerts]);

  const pageContext = useMemo(() => ({
    focusProductTitle: null,
    focusProductId: null,
    currentFilter: null,
    readyAcceptCount: batchAcceptCount,
    pendingCount: pendingQuoteCount + batchAcceptCount + exceptionCount,
    confirmedCount,
    highRiskTypes: activeRiskAlerts.map((a) => a.type),
    readyVariantIds: [],
  }), [batchAcceptCount, pendingQuoteCount, exceptionCount, confirmedCount, activeRiskAlerts]);

  const savings = useMemo(() => {
    const tips: string[] = [];
    if (activeTemplate?.speedPreference === "FAST") {
      tips.push(t("logisticsAgent.tipFastToBalanced"));
    }
    if (activeTemplate?.packaging === "CARTON") {
      tips.push(t("logisticsAgent.tipCartonToMinimal"));
    }
    if (tips.length === 0 && productCount > 0 && batchAcceptCount > 0) {
      tips.push(t("logisticsAgent.tipBatchAccept"));
    }
    return tips;
  }, [activeTemplate, productCount, batchAcceptCount, t]);

  const applyCommandExecution = useCallback(
    async (plan: LogisticsCommandPlan, execution: LogisticsCommandExecution) => {
      switch (execution.type) {
        case "accept_all_ready": {
          onAcceptAllReady();
          break;
        }
        case "fetch_quotes": {
          // 明确为「全量刷新报价」，避免与顶部按钮的增量管线混淆（Agent 语义透明）
          onFetchQuotes();
          break;
        }
        case "open_template": {
          onOpenTemplate();
          break;
        }
        case "focus_status": {
          onFocusStatus(execution.status);
          break;
        }
        case "set_filter": {
          onSetFilter?.(execution.filterMode);
          break;
        }
        case "apply_template": {
          onOpenTemplate();
          break;
        }
      }
    },
    [onAcceptAllReady, onFetchQuotes, onOpenTemplate, onFocusStatus, onRetryPipeline, onSetFilter]
  );

  const executeCommand = useCallback(
    async (plan: LogisticsCommandPlan) => {
      const execution = resolveLogisticsCommandExecution(plan, pageContext);
      if (!execution) {
        setClarify(plan.clarify ?? t("logisticsAgent.errCannotExecute"));
        return;
      }
      setCommandExecuting(true);
      setCommandPlan(null);
      setPreview(null);
      setClarify(null);
      setSkillFeedback(null);
      try {
        await applyCommandExecution(plan, execution);
        if (logisticsCommandBelongsToSkill(plan.draft.intent)) {
          const feedback = buildLogisticsSkillFeedback(plan, pageContext);
          if (feedback) setSkillFeedback(feedback);
        }
      } catch (err) {
        setClarify(readableError(err) || t("logisticsAgent.errCommandFailed"));
      } finally {
        setCommandExecuting(false);
      }
    },
    [applyCommandExecution, pageContext, t]
  );

  const handleSubmit = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    setLoading(true);
    setClarify(null);
    setCommandPlan(null);
    setPreview(null);
    setSkillFeedback(null);
    setExecStep(null);

    const seq = ++requestSeq.current;

    try {
      const classifyResult = await classifyLogisticsCommandInput(text, classifyContext, locale);
      if (requestSeq.current !== seq) return;

      if (classifyResult.confidence === "high" && classifyResult.draft) {
        const plan = planLogisticsCommand(t, classifyResult.draft, pageContext);
        if (!plan.executable) {
          setClarify(plan.clarify ?? t("logisticsAgent.errCannotExecute"));
          return;
        }
        // 仅当命令需要确认且提供了预览生成器时才走预览流程
        if (
          commandRequiresConfirmation(plan) &&
          !previewGenerators[plan.draft.intent]
        ) {
          // 没有预览生成器：直接执行
          await executeCommand(plan);
          return;
        }
        setCommandPlan(plan);
        return;
      }

      setClarify(classifyResult.clarify ?? t("logisticsAgent.errCannotUnderstand"));
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setClarify(readableError(err) || t("logisticsAgent.errCommandFailed"));
    } finally {
      if (requestSeq.current === seq) {
        setLoading(false);
        setInput("");
      }
    }
  }, [input, pageContext, classifyContext, previewGenerators, executeCommand, t, locale]);

  const generatePreview = useCallback(async () => {
    if (!commandPlan) return;
    const generator = previewGenerators[commandPlan.draft.intent];
    if (!generator) {
      setPreviewError(t("logisticsAgent.errNoPreviewGenerator"));
      setPreviewLoading(false);
      setExecStep("error");
      return;
    }
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setExecStep("executing");
    try {
      const result = await generator(commandPlan, "");
      if (previewSeq.current !== seq) return;
      setPreview(result);
      setExecStep("preview_ready");
    } catch (err) {
      if (previewSeq.current !== seq) return;
      setPreviewError(readableError(err) || t("logisticsAgent.errPreviewFailed"));
      setExecStep("error");
    } finally {
      if (previewSeq.current === seq) setPreviewLoading(false);
    }
  }, [commandPlan, previewGenerators, t]);

  useEffect(() => {
    if (!commandPlan) return;
    if (uiConfig?.requiresPreview || commandRequiresConfirmation(commandPlan)) {
      void generatePreview();
    }
  }, [commandPlan, uiConfig, generatePreview]);

  const handleConfirmWithPreview = useCallback(async (payload: Record<string, unknown>) => {
    if (!commandPlan) return;
    const executor = commandExecutors[commandPlan.draft.intent];
    if (!executor) {
      setClarify(t("logisticsAgent.errNoExecutor"));
      setExecStep("error");
      return;
    }

    const isBatch = commandPlan.draft.intent === "accept_all_ready";
    const belongsToSkill = logisticsCommandBelongsToSkill(commandPlan.draft.intent);

    setCommandExecuting(true);
    setClarify(null);
    setBatchProgress(null);
    setSkillFeedback(null);

    if (isBatch) {
      const total =
        (preview?.payload?.totalCount as number | undefined) ??
        batchAcceptCount;
      setBatchProgress({ current: 0, total, success: 0, failed: 0 });
      setExecStep("batch_running");
    } else {
      setExecStep("applying");
    }

    try {
      const payloadWithProgress = isBatch
        ? {
            ...payload,
            onProgress: (current: number, total: number, success: number, failed: number) => {
              setBatchProgress({ current, total, success, failed });
            },
          }
        : payload;

      await executor(payloadWithProgress);
      setExecStep("done");

      if (belongsToSkill) {
        const feedback = buildLogisticsSkillFeedback(commandPlan, pageContext, {
          successCount: isBatch ? batchProgress?.success : undefined,
          failedCount: isBatch ? batchProgress?.failed : undefined,
          totalCount: isBatch ? batchProgress?.total : undefined,
        });
        if (feedback) setSkillFeedback(feedback);
      }
    } catch (err) {
      setClarify(readableError(err) || t("logisticsAgent.errExecuteFailed"));
      setExecStep("error");
    } finally {
      setCommandExecuting(false);
    }
  }, [commandPlan, commandExecutors, pageContext, preview, batchAcceptCount, batchProgress, t]);

  const handleQuickCommand = useCallback((cmd: string) => {
    setInput(cmd);
    void handleSubmit(cmd);
  }, [handleSubmit]);

  const handleNextStep = useCallback(
    (step: { label: string; kind?: string; filterMode?: string }) => {
      if (step.kind === "set_shop_filter" && step.filterMode) {
        onSetFilter?.(step.filterMode);
      }
    },
    [onSetFilter]
  );

  return (
    <div className="flex flex-col gap-2">
      {catalogIngestingCount > 0 ? (
        <div className="rounded-md border border-sky-100 bg-sky-50/60 px-2.5 py-2">
          <p className="text-[11px] leading-relaxed text-sky-800">
            {t("logisticsAgent.catalogIngesting", { count: catalogIngestingCount })}
            {t("logisticsAgent.catalogIngestingHint")}
          </p>
        </div>
      ) : null}

      {pipelineProgress && pipelineProgress.phase !== "idle" ? (
        <LogisticsPipelineTaskCard
          progress={pipelineProgress}
          pendingReviewCount={pendingReviewCount}
          onRetry={onRetryPipeline}
          onCancel={onCancelPipeline}
        />
      ) : null}

      {!skillFeedback &&
      !clarify &&
      planMetrics &&
      completionGate &&
      onStartEstimate &&
      onSaveAndSync &&
      onViewUnidentified &&
      (onViewPendingConfirm || onViewIssues) ? (
        <LogisticsNextStepsCard
          pipelineRunning={pipelineRunning}
          saving={saving}
          autoReadyCount={planMetrics.autoReadyCount}
          pendingConfirmCount={planMetrics.pendingConfirmCount}
          exceptionCount={planMetrics.exceptionCount}
          unidentifiedCount={planMetrics.unidentifiedCount}
          skuBindingGap={skuBindingGap}
          completionGate={completionGate}
          onStartEstimate={onStartEstimate}
          onSaveAndSync={onSaveAndSync}
          onViewUnidentified={onViewUnidentified}
          onViewPendingConfirm={onViewPendingConfirm ?? onViewIssues!}
          onViewExceptions={onViewExceptions ?? onViewIssues!}
          onAcceptAllReady={onAcceptAllReady}
          batchAcceptCount={planMetrics.pendingConfirmCount}
        />
      ) : null}

      {!commandPlan && !skillFeedback && !clarify && (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs">
          <div className="flex flex-wrap gap-1.5">
            {exampleCommands.map((cmd) => (
              <button
                key={cmd}
                type="button"
                onClick={() => handleQuickCommand(cmd)}
                className="rounded-lg border border-hairline px-2 py-1 text-[11px] font-medium text-ink-muted hover:border-brand-soft hover:text-brand transition-colors"
              >
                {cmd}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={t("logisticsAgent.inputPlaceholder")}
              disabled={loading}
              className="flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft disabled:opacity-50"
            />
            <Button
              size="sm"
              className="h-7 w-7 px-2"
              onClick={() => handleSubmit()}
              disabled={loading || !input.trim()}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {clarify ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {clarify}
        </div>
      ) : null}

      <CommandAgentExecution
        commandPlan={commandPlan}
        uiConfig={uiConfig}
        requiresConfirmation={
          commandPlan ? commandRequiresConfirmation(commandPlan) : false
        }
        execStep={execStep}
        preview={preview}
        previewError={previewError}
        previewLoading={previewLoading}
        batchProgress={batchProgress}
        commandExecuting={commandExecuting}
        onCancel={() => {
          if (execStep === "batch_running") {
            onCancelBatchAccept?.();
          }
          setCommandPlan(null);
          setPreview(null);
          setExecStep(null);
          setBatchProgress(null);
          setSkillFeedback(null);
        }}
        onAutoApply={handleConfirmWithPreview}
        onDirectExecute={() => {
          if (commandPlan) void executeCommand(commandPlan);
        }}
      />

      {execStep === "done" && !skillFeedback ? (
        <div className="rounded-[var(--radius-card)] border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {t("logisticsAgent.execDone")}
        </div>
      ) : null}

      {skillFeedback ? (
        <SkillFeedbackCard feedback={skillFeedback} onNextStep={handleNextStep} />
      ) : null}

      {savings.length > 0 && (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown className="h-3.5 w-3.5 text-brand" />
            <span className="text-xs font-semibold text-ink">{t("logisticsAgent.savingsTitle")}</span>
          </div>
          <ul className="space-y-1.5">
            {savings.map((tip) => (
              <li key={tip} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                <span className="text-[11px] text-ink-muted">{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeRiskAlerts.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/80 p-3">
          <div className="text-xs font-semibold text-amber-900 mb-2">{t("logisticsAgent.aiSuggestTitle")}</div>
          <ul className="space-y-1.5">
            {activeRiskAlerts.map((alert) => (
              <li key={alert.type} className="text-[11px] text-amber-800">
                {formatActiveHighRiskAlert(t, alert)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs">
        <div className="text-xs font-semibold text-ink mb-2">{t("logisticsAgent.summaryTitle")}</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("logisticsAgent.analyzedProducts")}</span>
              <span className="text-ink">{t("logisticsAgent.countUnit", { count: productCount })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("logisticsAgent.analyzedSkus")}</span>
              <span className="text-ink">{t("logisticsAgent.countUnit", { count: variantCount })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("logisticsAgent.aiAuto")}</span>
              <span className="text-ink">{t("logisticsAgent.countUnit", { count: confirmedCount })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("logisticsAgent.pendingQuote")}</span>
              <span className="text-ink">{t("logisticsAgent.countUnit", { count: pendingQuoteCount })}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-muted">{t("logisticsAgent.pendingConfirm")}</span>
              <span className="text-amber-700">{t("logisticsAgent.countUnit", { count: batchAcceptCount })}</span>
            </div>
            {exceptionCount > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-ink-muted">{t("logisticsAgent.exceptions")}</span>
                <span className="text-amber-700">{t("logisticsAgent.countUnit", { count: exceptionCount })}</span>
              </div>
            ) : null}
          </div>
        </div>
    </div>
  );
}