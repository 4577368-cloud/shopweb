"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThumbImage } from "@/components/ui/thumb-image";
import {
  CONFIDENCE_TIER_LABELS,
  formatConfidenceScores,
} from "@/lib/batch-link/confidence-display";
import type { CandidateConfidence } from "@/lib/batch-link/candidate-confidence";
import type { ImageSearchProduct } from "@/lib/types";
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
  const tierLabel = CONFIDENCE_TIER_LABELS[confidence.tier];
  const scoreLine = formatConfidenceScores({
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
      <p className="text-[11px] font-semibold text-amber-950">确认货源真实性</p>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-900/85">
        {tierLabel}候选需人工核对供货信息。确认后将登记 Tangbuy 商品库并建立关联；误匹配可能导致采购风险。
      </p>

      <div className="mt-2.5 flex gap-2.5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-amber-200/80 bg-white">
          {candidate.imageUrl ? (
            <ThumbImage
              src={candidate.imageUrl}
              alt={candidate.title ?? "货源"}
              fill
              sizes="56px"
              pixelWidth={112}
              className="object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
              无图
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-amber-950">
            {candidate.title?.trim() || "货源标题"}
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
          取消
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
              确认中…
            </>
          ) : (
            "确认货源并关联"
          )}
        </Button>
      </div>
    </div>
  );
}
