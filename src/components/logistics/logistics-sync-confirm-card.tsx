"use client";

import { AlertTriangle } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/LocaleProvider";
import type { CompletionGateResult } from "@/lib/logistics/completion-gate";

export function LogisticsSyncConfirmCard({
  gate,
  saving,
  onConfirm,
  onCancel,
}: {
  gate: CompletionGateResult;
  saving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();

  return (
    <div className="rounded-[var(--radius-card)] border border-amber-200 bg-amber-50/90 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            {t("logisticsSync.title")}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-950">
            {gate.warnings.map((line) => (
              <li key={line} className="flex gap-1.5">
                <span className="text-amber-700">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={saving}
              onClick={onConfirm}
            >
              {saving ? t("logisticsSync.saving") : t("logisticsSync.confirm")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              disabled={saving}
              onClick={onCancel}
            >
              {t("logisticsSync.cancel")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
