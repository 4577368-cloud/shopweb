"use client";

import { Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  pendingNewAnalysis?: number;
  onViewNewArrivals?: () => void;
  /** Manual batch link for new arrivals only (no auto-run). */
  onBatchLinkNewArrivals?: () => void;
  batchLinkBusy?: boolean;
  className?: string;
}

/** New-arrivals banner only — catalog filters live on the product list toolbar. */
export function SmartSourcingSummaryBar({
  pendingNewAnalysis = 0,
  onViewNewArrivals,
  onBatchLinkNewArrivals,
  batchLinkBusy = false,
  className,
}: SmartSourcingSummaryBarProps) {
  const t = useT();

  if (pendingNewAnalysis <= 0 || batchLinkBusy) return null;

  return (
    <section className={cn("mb-3", className)}>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2"
        style={{ backgroundColor: "#EEF2FF", borderColor: "#F1F0FF" }}
      >
        <p
          className="min-w-0 flex-1 text-sm font-bold leading-snug"
          style={{ color: "#333333" }}
        >
          {t("sourcing.newArrivalsBanner", { count: pendingNewAnalysis })}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {onBatchLinkNewArrivals ? (
            <Button
              type="button"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={onBatchLinkNewArrivals}
              disabled={batchLinkBusy}
              title={t("productsPage.batchLinkNewArrivalsTitle", {
                count: pendingNewAnalysis,
              })}
            >
              {batchLinkBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
              {t("productsPage.batchLink")}
            </Button>
          ) : null}
          {onViewNewArrivals ? (
            <button
              type="button"
              onClick={onViewNewArrivals}
              className="rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-hover"
              style={{ borderColor: "#333333", color: "#333333" }}
            >
              {t("sourcing.viewNewArrivals")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
