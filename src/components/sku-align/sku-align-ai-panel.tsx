"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SkuAlignAiPanel({
  needsReviewOnPage,
  confirming,
  onConfirmPage,
}: {
  needsReviewOnPage: number;
  confirming: boolean;
  onConfirmPage: () => void;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-sm">
      <h3 className="text-xs font-semibold text-ink">批量确认</h3>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2 h-8 w-full justify-start text-xs"
        disabled={needsReviewOnPage === 0 || confirming}
        onClick={onConfirmPage}
      >
        {confirming ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : null}
        接受本页全部待确认 ({needsReviewOnPage})
      </Button>
    </section>
  );
}
