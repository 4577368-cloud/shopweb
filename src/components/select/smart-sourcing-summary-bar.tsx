"use client";

import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export interface SmartSourcingSummaryBarProps {
  pendingNewAnalysis?: number;
  className?: string;
}

/** New-arrivals info banner — actions live on the product list toolbar. */
export function SmartSourcingSummaryBar({
  pendingNewAnalysis = 0,
  className,
}: SmartSourcingSummaryBarProps) {
  const t = useT();

  if (pendingNewAnalysis <= 0) return null;

  return (
    <section className={cn("mb-3", className)}>
      <div
        className="rounded-md border px-2.5 py-2"
        style={{ backgroundColor: "#EEF2FF", borderColor: "#F1F0FF" }}
      >
        <p
          className="text-sm font-bold leading-snug"
          style={{ color: "#333333" }}
        >
          {t("sourcing.newArrivalsBanner", { count: pendingNewAnalysis })}
        </p>
      </div>
    </section>
  );
}
