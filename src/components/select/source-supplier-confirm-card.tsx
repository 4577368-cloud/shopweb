"use client";

import { Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { ThumbImage } from "@/components/ui/thumb-image";
import {
  confidenceTierLabel,
  formatConfidenceScores,
} from "@/lib/batch-link/confidence-display";
import type { CandidateConfidence } from "@/lib/batch-link/candidate-confidence";
import type { ImageSearchProduct } from "@/lib/types";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function SourceSupplierConfirmCard({
  candidate,
  confidence,
  confirming = false,
  onCancel,
  onConfirm,
  className,
}: {
  candidate: ImageSearchProduct;
  confidence: CandidateConfidence;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  className?: string;
}) {
  const t = useT();
  const tierLabel = confidenceTierLabel(confidence.tier, t);
  const scoreLine = formatConfidenceScores(t, {
    titleScore: confidence.titleScore,
    imageScore: confidence.imageScore,
    tier: confidence.tier,
  });

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-3",
        className
      )}
    >
      <p className="text-[11px] font-semibold text-amber-950">
        {t("supplierConfirm.title")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-900/85">
        {t("supplierConfirm.body", { tier: tierLabel })}
      </p>

      <div className="mt-2.5 flex gap-2.5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-amber-200/80 bg-white">
          {candidate.imageUrl ? (
            <ThumbImage
              src={candidate.imageUrl}
              alt={candidate.title ?? t("supplierConfirm.sourceTitle")}
              fill
              sizes="56px"
              pixelWidth={112}
              className="object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
              {t("supplierConfirm.noImage")}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-amber-950">
            {candidate.title?.trim() || t("supplierConfirm.sourceTitle")}
          </p>
          {candidate.price?.trim() ? (
            <p className="mt-0.5 text-xs font-semibold text-amber-900">
              ¥{candidate.price.trim()}
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-amber-800/80">{scoreLine}</p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          onClick={onCancel}
          disabled={confirming}
        >
          {t("supplierConfirm.cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8"
          onClick={onConfirm}
          disabled={confirming}
        >
          {confirming ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("supplierConfirm.confirming")}
            </>
          ) : (
            t("supplierConfirm.confirm")
          )}
        </Button>
      </div>
    </div>
  );
}
