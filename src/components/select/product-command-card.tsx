"use client";

import { Loader2 } from "@/lib/ui/icons";
import type { ProductCommandPlan } from "@/lib/agents/products/command-schema";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

export function ProductCommandCard({
  plan,
  executing,
  onConfirm,
  onCancel,
}: {
  plan: ProductCommandPlan;
  executing?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const confirmLabel =
    plan.draft.intent === "update_listing_price" ||
    plan.draft.intent === "update_product_copy"
      ? t("commandUi.confirmModify")
      : t("commandUi.confirmExecute");

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800/80">
        {t("commandUi.confirmHeader")}
      </p>
      <h3 className="mt-0.5 text-xs font-semibold text-amber-950">
        {plan.operation}
      </h3>
      <dl className="mt-2 space-y-1 text-[11px] text-amber-950">
        <div className="flex gap-2">
          <dt className="shrink-0 text-amber-800/80">{t("commandUi.targetLabel")}</dt>
          <dd className="min-w-0 font-medium">{plan.targetLabel}</dd>
        </div>
        {plan.detailLines.map((line) => (
          <div key={line} className="flex gap-2">
            <dt className="shrink-0 text-amber-800/80">{t("commandUi.detail")}</dt>
            <dd className="min-w-0">{line}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={executing}
          onClick={onConfirm}
        >
          {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {executing ? t("commandUi.executing") : confirmLabel}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 px-2 text-[11px]"
          disabled={executing}
          onClick={onCancel}
        >
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
