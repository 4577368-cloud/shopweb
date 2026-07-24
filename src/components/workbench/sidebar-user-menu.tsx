"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  ChevronUp,
  Exit,
  Person,
  Settings,
} from "@/lib/ui/icons";
import { useOnboarding } from "@/context/onboarding-context";
import { useT } from "@/i18n/LocaleProvider";
import { useHubMode } from "@/lib/hub/hub-mode";
import { cn } from "@/lib/utils";

const FAKE_ACCOUNT_EMAIL = "admin@tangbuy.net";

type UserMenuAction = "switchAccount" | "profile" | "settings" | "signOut";

const MENU_ITEMS: { id: Exclude<UserMenuAction, "signOut">; icon: typeof ArrowLeftRight }[] = [
  { id: "switchAccount", icon: ArrowLeftRight },
  { id: "profile", icon: Person },
  { id: "settings", icon: Settings },
];

/**
 * Sidebar footer account control — fake signed-in user with upward action menu.
 */
export function SidebarUserMenu({ className }: { className?: string }) {
  const t = useT();
  const { showToast } = useOnboarding();
  const { available, enabled, toggle } = useHubMode();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAction = (action: UserMenuAction) => {
    setOpen(false);
    if (action === "signOut") {
      showToast(t("userMenu.toastSignedOut"));
      return;
    }
    showToast(t("userMenu.comingSoon"));
  };

  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("userMenu.openMenu")}
        title={FAKE_ACCOUNT_EMAIL}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 w-full min-w-0 items-center gap-1 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 text-left shadow-sm transition-colors hover:border-brand/40"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
          {FAKE_ACCOUNT_EMAIL}
        </span>
        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 z-40 mb-1 overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface py-1 shadow-card"
        >
          {available ? (
            <button
              type="button"
              role="menuitem"
              onClick={toggle}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] text-ink transition-colors hover:bg-surface-muted/80"
            >
              <span className="flex items-center gap-2">
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                {t("userMenu.hubMode")}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  enabled ? "bg-brand-accent text-white" : "bg-surface-muted text-ink-muted"
                )}
              >
                {enabled ? t("userMenu.on") : t("userMenu.off")}
              </span>
            </button>
          ) : null}

          {MENU_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              onClick={() => runAction(id)}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-ink transition-colors hover:bg-surface-muted/80"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              {t(`userMenu.${id}`)}
            </button>
          ))}

          <div className="my-1 border-t border-hairline" />

          <button
            type="button"
            role="menuitem"
            onClick={() => runAction("signOut")}
            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-red-600 transition-colors hover:bg-red-50"
          >
            <Exit className="h-3.5 w-3.5 shrink-0" />
            {t("userMenu.signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
