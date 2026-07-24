"use client";

import { ExternalLink, Sparkles } from "@/lib/ui/icons";
import { TANGBUY_DROPSHIPPING_URL } from "@/lib/brand";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Sidebar plan upgrade — opens Tangbuy dropshipping portal in a new tab.
 * Placed below promos / above account footer (see StepSidebar, HubSidebar).
 */
export function SidebarUpgradeCta({ className }: { className?: string }) {
  const t = useT();

  return (
    <div className={cn("shrink-0 px-4 pb-3", className)}>
      <a
        href={TANGBUY_DROPSHIPPING_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group flex w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-[#325BE6]/20",
          "bg-gradient-to-r from-[#EEF2FF] via-[#F5F7FF] to-[#FFFBF5] px-3 py-2.5 shadow-sm",
          "transition-[border-color,box-shadow,transform] duration-150",
          "hover:border-[#325BE6]/35 hover:shadow-md active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#325BE6]/30"
        )}
        aria-label={t("sidebar.upgradeAria")}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#325BE6] text-white shadow-sm ring-1 ring-[#325BE6]/25"
          aria-hidden
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-semibold leading-tight tracking-tight text-ink">
            {t("sidebar.upgradeLabel")}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-medium text-ink-muted">
            {t("sidebar.upgradeHint")}
          </span>
        </span>
        <ExternalLink
          className="h-3.5 w-3.5 shrink-0 text-[#325BE6]/70 transition-colors group-hover:text-[#325BE6]"
          aria-hidden
        />
      </a>
    </div>
  );
}
