// 通用右侧抽屉（运营中心复用，沿用订单中心抽屉视觉）。
"use client";

import { useEffect, type ReactNode } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X } from "@/lib/ui/icons";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}

export function Drawer({ open, onClose, title, children, footer, widthClass = "max-w-lg" }: DrawerProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <aside className={`relative flex h-full w-full ${widthClass} flex-col border-l border-hairline bg-surface shadow-xl`}>
        <header className="flex shrink-0 items-center justify-between border-b border-hairline px-4 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ops.drawer.close")}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer ? <div className="shrink-0 border-t border-hairline px-4 py-3">{footer}</div> : null}
      </aside>
    </div>
  );
}
