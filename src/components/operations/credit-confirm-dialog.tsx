// 预留：若将来需要「单次高额操作」二次确认可复用。当前产品策略为直接请求，用后展示真实扣点（用量抽屉 / 余额）。
"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

interface CreditConfirmDialogProps {
  open: boolean;
  estimate: number;
  remaining: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function CreditConfirmDialog({
  open,
  estimate,
  remaining,
  onConfirm,
  onCancel,
}: CreditConfirmDialogProps) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-ink">{t("ops.guard.title")}</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          {t("ops.guard.desc", { n: estimate })}
        </p>
        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-control)] bg-muted px-3 py-2 text-[11px]">
          <span className="text-ink-subtle">{t("ops.guard.remaining")}</span>
          <span className="font-semibold tabular-nums text-info">{remaining}</span>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("ops.guard.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {t("ops.guard.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
