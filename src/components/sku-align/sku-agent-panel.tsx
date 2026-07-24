"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Loader2 } from "@/lib/ui/icons";
import type { AgentSuggestedAction } from "@/lib/agents/types";
import type { SkuPageContext } from "@/lib/agents/sku-align/plan-command";
import {
  type SkuCommandClassifyContext,
} from "@/lib/agents/sku-align/classify-command";
import { classifySkuCommandInput } from "@/lib/agents/sku-align/command-client";
import { getSkuCommandUIConfig } from "@/lib/agents/sku-align/command-ui-config";
import {
  planSkuCommand,
  planSkuCommandSequence,
  commandOperationLabel,
  commandRequiresConfirmation,
  resolveSkuCommandExecution,
} from "@/lib/agents/sku-align/plan-command";
import {
  buildSkuDraftFromIntent,
  type SkuCommandClarify,
  type SkuCommandExecution,
  type SkuCommandId,
  type SkuCommandPlan,
} from "@/lib/agents/sku-align/command-schema";
import type { SkillExecutionFeedback } from "@/lib/agents/sku-align/skills";
import { buildSkuSkillFeedback, skuCommandBelongsToSkill } from "@/lib/agents/sku-align/skills";
import { readableError } from "@/lib/api";
import { CommandAgentExecution } from "@/components/workbench/command-agent-execution";
import { SkillFeedbackCard } from "@/components/workbench/skill-feedback-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import type { ConfirmPreviewResult } from "@/components/select/command-confirm-card";
import type { ExecutionStep, BatchProgress } from "@/components/select/execution-pipeline";

export type SkuPreviewGenerator = (
  plan: SkuCommandPlan,
  shopName: string
) => Promise<ConfirmPreviewResult>;

export type SkuCommandExecutor = (payload: Record<string, unknown>) => Promise<void>;

export interface SkuAgentPanelProps {
  context: SkuPageContext;
  shopName: string;
  onApplySuggestedAction?: (action: AgentSuggestedAction) => void;
  onFocusProduct?: (productId: string) => void;
  onSetFilter?: (filter: "all" | "fully_linked" | "partially_linked") => void;
  previewGenerators?: Record<string, SkuPreviewGenerator>;
  commandExecutors?: Record<string, SkuCommandExecutor>;
}

export function SkuAgentPanel({
  context,
  shopName,
  onApplySuggestedAction,
  onFocusProduct,
  onSetFilter,
  previewGenerators = {},
  commandExecutors = {},
}: SkuAgentPanelProps) {
  const t = useT();
  const locale = useLocale();
  const [commandPlan, setCommandPlan] = useState<SkuCommandPlan | null>(null);
  const [commandSequence, setCommandSequence] = useState<SkuCommandPlan[] | null>(null);
  const [seqCurrent, setSeqCurrent] = useState(0);
  const [seqDone, setSeqDone] = useState(false);
  const [commandExecuting, setCommandExecuting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");
  const [clarify, setClarify] = useState<string | SkuCommandClarify | null>(null);
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
      commandPlan ? getSkuCommandUIConfig(commandPlan.draft.intent) : null,
    [commandPlan]
  );

  const exampleCommands = useMemo(() => {
    const examples: string[] = [];
    const partiallyLinked = context.productCatalog.filter((p) => {
      const active = p.variants.filter((v) => v.bound?.bindStatus === "ACTIVE").length;
      const pending = p.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
      return pending > 0 || (active > 0 && active < p.variants.length);
    }).length;
    if (partiallyLinked > 0) examples.push(t("skuAgent.exampleBatchConfirm"));
    examples.push(
      t("skuAgent.examplePartialOnly"),
      t("skuAgent.exampleRealign"),
      t("skuAgent.exampleExplain")
    );
    return examples;
  }, [context.productCatalog, t]);

  const classifyContext = useMemo<SkuCommandClassifyContext>(() => ({
    focusProductTitle: context.focusProduct?.title ?? null,
    focusProductId: context.focusProductId ?? null,
    currentFilter: context.currentFilter ?? null,
    needsReviewCount: context.productCatalog.filter((p) => {
      const active = p.variants.filter((v) => v.bound?.bindStatus === "ACTIVE").length;
      const pending = p.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
      return pending > 0 || (active > 0 && active < p.variants.length);
    }).length,
    fullyLinkedCount: context.productCatalog.filter((p) => {
      return p.variants.length > 0 && p.variants.every((v) => v.bound?.bindStatus === "ACTIVE");
    }).length,
    partiallyLinkedCount: context.productCatalog.filter((p) => {
      const active = p.variants.filter((v) => v.bound?.bindStatus === "ACTIVE").length;
      const pending = p.variants.filter((v) => v.bound?.bindStatus === "PENDING").length;
      return pending > 0 || (active > 0 && active < p.variants.length);
    }).length,
  }), [context]);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    setLoading(true);
    setClarify(null);
    setCommandPlan(null);
    setPreview(null);
    setSkillFeedback(null);
    setExecStep(null);

    const seq = ++requestSeq.current;

    try {
      const classifyResult = await classifySkuCommandInput(text, classifyContext, locale);
      if (requestSeq.current !== seq) return;

      if (
        classifyResult.confidence === "high" &&
        classifyResult.steps &&
        classifyResult.steps.length > 0
      ) {
        const plans = planSkuCommandSequence(t, classifyResult.steps, context);
        setCommandSequence(plans);
        setCommandPlan(null);
        setClarify(null);
        setSeqCurrent(0);
        setSeqDone(false);
        return;
      }

      if (classifyResult.confidence === "high" && classifyResult.draft) {
        const plan = planSkuCommand(t, classifyResult.draft, context);
        setCommandPlan(plan);
        setCommandSequence(null);
        return;
      }

      setClarify(classifyResult.clarify ?? t("skuAgent.errCannotUnderstand"));
      setCommandSequence(null);
    } catch (err) {
      if (requestSeq.current !== seq) return;
      setClarify(readableError(err) || t("skuAgent.errCommandFailed"));
    } finally {
      if (requestSeq.current === seq) {
        setLoading(false);
        setInput("");
      }
    }
  }, [input, context, classifyContext, t, locale]);

  const executeCommand = useCallback(async (plan: SkuCommandPlan) => {
    const execution = resolveSkuCommandExecution(plan);
    if (!execution) {
      setClarify(plan.clarify ?? t("skuAgent.errCannotExecute"));
      return;
    }
    setCommandExecuting(true);
    setCommandPlan(null);
    setPreview(null);
    setClarify(null);
    setSkillFeedback(null);
    try {
      await applyCommandExecution(plan, execution);
      if (skuCommandBelongsToSkill(plan.draft.intent)) {
        const feedback = buildSkuSkillFeedback(plan, context);
        if (feedback) setSkillFeedback(feedback);
      }
    } catch (err) {
      setClarify(readableError(err) || t("skuAgent.errCommandFailed"));
    } finally {
      setCommandExecuting(false);
    }
  }, [context, t]);

  const applyCommandExecution = async (
    plan: SkuCommandPlan,
    execution: SkuCommandExecution
  ) => {
    const productId = plan.draft.productId ?? plan.draft.params.productId;

    if (execution.type === "set_filter") {
      onSetFilter?.(execution.filterMode);
      return;
    }
    if (execution.type === "focus_product") {
      onFocusProduct?.(execution.productId);
      return;
    }
    if (execution.type === "rerun_auto_align") {
      if (productId) {
        onFocusProduct?.(productId);
      }
      return;
    }
  };

  const handleClarifyCandidate = useCallback(
    (intent: SkuCommandId) => {
      const d = buildSkuDraftFromIntent(intent);
      const plan = planSkuCommand(t, d, context);
      setClarify(null);
      setCommandPlan(plan);
      setCommandSequence(null);
    },
    [context, t]
  );

  const executeSequence = useCallback(
    async (plans: SkuCommandPlan[]) => {
      setCommandExecuting(true);
      setClarify(null);
      setSkillFeedback(null);
      setSeqDone(false);
      try {
        for (let i = 0; i < plans.length; i++) {
          setSeqCurrent(i + 1);
          const plan = plans[i];
          const execution = resolveSkuCommandExecution(plan);
          if (execution) {
            await applyCommandExecution(plan, execution);
            continue;
          }
          const executor = commandExecutors[plan.draft.intent];
          if (!executor) throw new Error(t("skuAgent.errNoExecutor"));
          const ui = getSkuCommandUIConfig(plan.draft.intent);
          if (ui?.requiresPreview || commandRequiresConfirmation(plan)) {
            const gen = previewGenerators[plan.draft.intent];
            if (!gen) throw new Error(t("skuAgent.errNoPreviewGenerator"));
            const preview = await gen(plan, shopName);
            await executor(preview.payload);
          } else {
            await executor({});
          }
        }
        setSeqDone(true);
        setExecStep("done");
      } catch (err) {
        setClarify(readableError(err) || t("skuAgent.errCommandFailed"));
        setExecStep("error");
      } finally {
        setCommandExecuting(false);
      }
    },
    [t, commandExecutors, previewGenerators, shopName, context]
  );

  const generatePreview = useCallback(async () => {
    if (!commandPlan) return;
    const generator = previewGenerators[commandPlan.draft.intent];
    if (!generator) {
      setPreviewError(t("skuAgent.errNoPreviewGenerator"));
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
      const result = await generator(commandPlan, shopName);
      if (previewSeq.current !== seq) return;
      setPreview(result);
      setExecStep("preview_ready");
    } catch (err) {
      if (previewSeq.current !== seq) return;
      setPreviewError(readableError(err) || t("skuAgent.errPreviewFailed"));
      setExecStep("error");
    } finally {
      if (previewSeq.current === seq) setPreviewLoading(false);
    }
  }, [commandPlan, previewGenerators, shopName, t]);

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
      setClarify(t("skuAgent.errNoExecutor"));
      setExecStep("error");
      return;
    }

    const isBatch = commandPlan.draft.intent === "batch_confirm_pending";
    const belongsToSkill = skuCommandBelongsToSkill(commandPlan.draft.intent);

    setCommandExecuting(true);
    setClarify(null);
    setBatchProgress(null);
    setSkillFeedback(null);

    if (isBatch) {
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
        const feedback = buildSkuSkillFeedback(commandPlan, context, {
          successCount: isBatch ? batchProgress?.success : undefined,
          failedCount: isBatch ? batchProgress?.failed : undefined,
          totalCount: isBatch ? batchProgress?.total : undefined,
        });
        if (feedback) setSkillFeedback(feedback);
      }
    } catch (err) {
      setClarify(readableError(err) || t("skuAgent.errExecuteFailed"));
      setExecStep("error");
    } finally {
      setCommandExecuting(false);
    }
  }, [commandPlan, commandExecutors, context, batchProgress, t]);

  const handleQuickCommand = useCallback((cmd: string) => {
    setInput(cmd);
    void handleSubmit();
  }, [handleSubmit]);

  const handleNextStep = useCallback(
    (step: { label: string; kind?: string; filterMode?: string }) => {
      if (step.kind === "set_shop_filter" && step.filterMode) {
        onSetFilter?.(step.filterMode as "all" | "fully_linked" | "partially_linked");
      }
    },
    [onSetFilter]
  );

  return (
    <section className="space-y-3">
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
            placeholder={t("skuAgent.inputPlaceholder")}
            disabled={loading}
            className="flex-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-soft disabled:opacity-50"
          />
          <Button
            size="sm"
            className="h-7 w-7 px-2"
            onClick={handleSubmit}
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

      {clarify && typeof clarify === "string" ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {clarify}
        </div>
      ) : null}

      {clarify && typeof clarify !== "string" ? (
        <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div>{clarify.message}</div>
          {clarify.candidates && clarify.candidates.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {clarify.candidates.map((c) => (
                <button
                  key={c.intent}
                  type="button"
                  onClick={() => handleClarifyCandidate(c.intent)}
                  className="rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:border-amber-400 hover:bg-amber-100 transition-colors"
                >
                  {commandOperationLabel(t, c.intent)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {commandSequence ? (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs">
          <div className="font-semibold text-ink mb-2">
            {t("skuAgent.seqTitle")}
            {commandExecuting && seqCurrent > 0 ? (
              <span className="ml-1 font-normal text-ink-muted">
                （{seqCurrent}/{commandSequence.length}）
              </span>
            ) : null}
          </div>
          <ol className="space-y-1.5">
            {commandSequence.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                <span className="text-ink-muted">
                  <span className="font-medium text-ink">
                    {t("skuAgent.seqStep", { n: i + 1 })}
                  </span>{" "}
                  {p.operation} · {p.targetLabel}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => executeSequence(commandSequence)}
              disabled={commandExecuting}
            >
              {commandExecuting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("skuAgent.seqExecute")
              )}
            </Button>
            <button
              type="button"
              disabled={commandExecuting}
              onClick={() => {
                setCommandSequence(null);
                setSeqDone(false);
                setSeqCurrent(0);
              }}
              className="rounded-[var(--radius-control)] border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
            >
              {t("commandUi.cancel")}
            </button>
          </div>
          {seqDone ? (
            <div className="mt-2 text-[11px] text-emerald-700">{t("skuAgent.seqDone")}</div>
          ) : null}
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
          setCommandPlan(null);
          setPreview(null);
          setExecStep(null);
          setBatchProgress(null);
          setSkillFeedback(null);
          setCommandSequence(null);
          setSeqDone(false);
          setSeqCurrent(0);
        }}
        onAutoApply={handleConfirmWithPreview}
        onDirectExecute={() => {
          if (commandPlan) void executeCommand(commandPlan);
        }}
      />

      {execStep === "done" && !skillFeedback && !commandSequence ? (
        <div className="rounded-[var(--radius-card)] border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {t("skuAgent.execDone")}
        </div>
      ) : null}

      {skillFeedback ? (
        <SkillFeedbackCard feedback={skillFeedback} onNextStep={handleNextStep} />
      ) : null}

      {!commandPlan && !skillFeedback && !clarify ? (
        <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-xs">
          <div className="font-semibold text-ink mb-2">{t("skuAgent.matchRulesTitle")}</div>
          <ul className="space-y-1.5">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
              <span className="text-ink-muted">{t("sku.matchRuleTitle")}</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
              <span className="text-ink-muted">{t("sku.matchRuleSpec")}</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
              <span className="text-ink-muted">{t("sku.matchRuleImage")}</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
              <span className="text-ink-muted">{t("sku.matchRuleCategory")}</span>
            </li>
          </ul>
        </div>
      ) : null}
    </section>
  );
}