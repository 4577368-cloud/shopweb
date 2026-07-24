"use client";

import { ChevronRight } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";

type FeedbackStep = { label: string };

export function SkillFeedbackCard({
  feedback,
  onNextStep,
}: {
  feedback: {
    summary: string;
    detailLines: string[];
    progress?: number | null;
    nextSteps: ReadonlyArray<FeedbackStep>;
  };
  onNextStep?: (step: FeedbackStep) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3">
      <div className="mb-2 text-xs font-semibold text-ink">{feedback.summary}</div>
      {feedback.detailLines.map((line, i) => (
        <div key={i} className="text-[11px] text-ink-muted">
          {line}
        </div>
      ))}
      {feedback.progress != null ? (
        <div className="mt-2">
          <div className="mb-1 text-[10px] text-ink-subtle">
            {t("workbenchScan.progressLabel", { percent: feedback.progress })}
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-[#90AAFF] transition-all"
              style={{ width: `${feedback.progress}%` }}
            />
          </div>
        </div>
      ) : null}
      {feedback.nextSteps.length > 0 ? (
        <div className="mt-3 space-y-1">
          {feedback.nextSteps.map((step, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onNextStep?.(step)}
              className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-[11px] text-brand transition-colors hover:bg-brand/5"
            >
              <ChevronRight className="h-3 w-3" />
              {step.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
