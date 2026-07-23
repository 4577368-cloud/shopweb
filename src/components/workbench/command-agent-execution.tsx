"use client";

import { Loader2 } from "@/lib/ui/icons";
import type { BaseCommandPlan } from "@/lib/agents/shared/command-plan";
import type { CommandUIConfig } from "@/lib/agents/shared/command-ui-config";
import type { ConfirmPreviewResult } from "@/components/select/command-confirm-card";
import {
  ExecutionPipeline,
  type BatchProgress,
  type ExecutionStep,
} from "@/components/select/execution-pipeline";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

export interface CommandAgentExecutionProps {
  commandPlan: BaseCommandPlan | null;
  uiConfig: CommandUIConfig | null;
  requiresConfirmation: boolean;
  execStep: ExecutionStep | null;
  preview: ConfirmPreviewResult | null;
  previewError: string | null;
  previewLoading: boolean;
  batchProgress: BatchProgress | null;
  commandExecuting: boolean;
  onCancel: () => void;
  onAutoApply: (payload: Record<string, unknown>) => void;
  onDirectExecute: () => void;
}

/**
 * Unified command execution UI for logistics / sku / other command-only rails.
 * Products keeps custom cards for pricing; everything else uses this + ExecutionPipeline.
 */
export function CommandAgentExecution({
  commandPlan,
  uiConfig,
  requiresConfirmation,
  execStep,
  preview,
  previewError,
  previewLoading,
  batchProgress,
  commandExecuting,
  onCancel,
  onAutoApply,
  onDirectExecute,
}: CommandAgentExecutionProps) {
  const t = useT();
  if (!commandPlan) return null;

  const usePipeline =
    requiresConfirmation ||
    uiConfig?.requiresPreview ||
    execStep != null ||
    previewLoading ||
    preview != null;

  if (usePipeline) {
    const step: ExecutionStep =
      execStep ??
      (previewLoading ? "executing" : preview ? "preview_ready" : "executing");

    return (
      <ExecutionPipeline
        plan={commandPlan}
        theme={uiConfig?.theme ?? "violet"}
        step={step}
        preview={preview}
        error={previewError}
        sensitivity={uiConfig?.sensitivity ?? "low"}
        batchProgress={batchProgress}
        onAutoApply={onAutoApply}
        onCancel={onCancel}
      />
    );
  }

  if (commandExecuting) {
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("commandUi.executing")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 text-xs font-semibold text-ink">{commandPlan.operation}</div>
      <div className="mb-2 text-[11px] text-ink-muted">{commandPlan.targetLabel}</div>
      {commandPlan.detailLines.map((line, i) => (
        <div key={i} className="text-[11px] text-ink-subtle">
          {line}
        </div>
      ))}
      {commandPlan.clarify ? (
        <div className="mt-2 text-[11px] text-amber-700">{commandPlan.clarify}</div>
      ) : null}
      {commandPlan.executable ? (
        <Button size="sm" className="mt-3 w-full" onClick={onDirectExecute}>
          {t("commandUi.execute")}
        </Button>
      ) : null}
    </div>
  );
}
