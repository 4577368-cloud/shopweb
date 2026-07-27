// 余额不足弹窗（D7；参考 EasyBrandKit credit-insufficient-modal）。
// 触发：服务端 402（INSUFFICIENT_CREDITS）。提供两条出路：领取欢迎分（若未领）/ 去充值订阅。
"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";

interface CreditInsufficientModalProps {
  open: boolean;
  /** 是否已领取过欢迎分（用于隐藏"领 30"按钮）。 */
  welcomed?: boolean;
  onClaim: () => void;
  onOpenBilling: () => void;
  onClose: () => void;
}

export function CreditInsufficientModal({
  open,
  welcomed,
  onClaim,
  onOpenBilling,
  onClose,
}: CreditInsufficientModalProps) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-xl">
        <h3 className="text-sm font-semibold text-ink">{t("ops.insufficient.title")}</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">{t("ops.insufficient.desc")}</p>
        <div className="mt-4 flex flex-col gap-2">
          {!welcomed && (
            <Button variant="secondary" size="sm" onClick={onClaim}>
              {t("ops.insufficient.claim")}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={onOpenBilling}>
            {t("ops.insufficient.recharge")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("ops.insufficient.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
