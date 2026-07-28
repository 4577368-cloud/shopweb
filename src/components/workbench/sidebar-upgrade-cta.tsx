"use client";

import { ArrowRight } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { LinkInApp } from "@/host/link-in-app";
import { cn } from "@/lib/utils";

/** Opens shared Tangbuy Dropshipping handoff page (same as sync complete). */
export function SidebarUpgradeCta({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();

  return (
    <div className={cn("shrink-0 px-4 pb-3", className)}>
      <LinkInApp
        href={localePath(locale, "/upgrade")}
        className="block w-full"
        aria-label={t("sidebar.upgradeAria")}
      >
        <Button
          size="md"
          className="h-9 w-full bg-brand-accent text-white hover:bg-brand-accent-hover active:bg-brand-accent-hover"
        >
          {t("sidebar.upgradeLabel")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </LinkInApp>
    </div>
  );
}
