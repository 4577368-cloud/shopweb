"use client";

import { useT } from "@/i18n/LocaleProvider";
import type { OrderSummary } from "@/lib/order/types";
import { cn } from "@/lib/utils";

const EXCEPTION_TONE: Record<string, string> = {
  return_in_progress: "bg-warning-soft text-warning",
  exchange_in_progress: "bg-info-soft text-info",
  refused_sign: "bg-danger-soft text-danger",
  exception_handling: "bg-warning-soft text-warning",
  frozen: "bg-muted text-ink-muted",
  canceled: "bg-danger-soft text-danger",
};

function resolvePhaseLabel(order: OrderSummary, t: (key: string) => string): string | undefined {
  const phase = order.merchantFulfillmentPhase?.trim();
  if (phase) {
    const key = `order.merchantPhase.${phase}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return order.procurementLineStatusLabel?.trim() || undefined;
}

export function ProcurementStatusMeta({ order }: { order: OrderSummary }) {
  const t = useT();
  const label = resolvePhaseLabel(order, t);
  const tag = order.procurementExceptionTag?.trim();
  if (!label && !tag) return null;

  const tagKey = tag ? `order.procurement.exception.${tag}` : "";
  const tagLabel = tagKey ? t(tagKey) : "";

  return (
    <div className="mt-1 space-y-0.5">
      {label ? (
        <p className="text-[10px] leading-tight text-ink-subtle" title={t("order.procurement.lineStatus")}>
          {label}
        </p>
      ) : null}
      {tag && tagLabel ? (
        <span
          className={cn(
            "inline-flex max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium",
            EXCEPTION_TONE[tag] ?? "bg-muted text-ink-muted",
          )}
        >
          {tagLabel}
        </span>
      ) : null}
    </div>
  );
}
