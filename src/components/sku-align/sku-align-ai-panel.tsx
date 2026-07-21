"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SkuAlignAiPanel({
  needsReviewTotal,
  needsReviewOnPage,
  confirmingAll,
  confirmingPage,
  onConfirmAll,
  onConfirmPage,
}: {
  needsReviewTotal: number;
  needsReviewOnPage: number;
  confirmingAll: boolean;
  confirmingPage: boolean;
  onConfirmAll: () => void;
  onConfirmPage: () => void;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-sm">
      <h3 className="text-xs font-semibold text-ink">批量确认</h3>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-subtle">
        待确认项可一次性接受 AI 建议，确认后变为已自动对齐并从问题项列表移除。
      </p>
      <div className="mt-2 flex flex-col gap-2">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 justify-start text-xs"
          disabled={needsReviewTotal === 0 || confirmingAll || confirmingPage}
          onClick={onConfirmAll}
        >
          {confirmingAll ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          接受全部待确认 ({needsReviewTotal})
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 justify-start text-xs"
          disabled={needsReviewOnPage === 0 || confirmingAll || confirmingPage}
          onClick={onConfirmPage}
        >
          {confirmingPage ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : null}
          接受本页全部待确认 ({needsReviewOnPage})
        </Button>
      </div>
    </section>
  );
}
