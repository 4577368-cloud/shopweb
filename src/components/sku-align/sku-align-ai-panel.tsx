"use client";

import { Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";

export function SkuAlignAiPanel({
  needsReviewOnPage,
  confirming,
  onConfirmPage,
}: {
  needsReviewOnPage: number;
  confirming: boolean;
  onConfirmPage: () => void;
}) {
  const t = useT();
  return (
    <section className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 text-sm">
      <h3 className="text-xs font-semibold text-ink">{t("skuAlignAi.batchConfirmTitle")}</h3>
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
        {t("skuAlignAi.acceptPagePending", { count: needsReviewOnPage })}
      </Button>
    </section>
  );
}
