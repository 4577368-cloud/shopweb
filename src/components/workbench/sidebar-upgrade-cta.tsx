"use client";

import Link from "next/link";
import { ArrowRight } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { TANGBUY_DROPSHIPPING_URL } from "@/lib/brand";
import { useT } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/** Opens Tangbuy dropshipping portal — sidebar footer, above account row. */
export function SidebarUpgradeCta({ className }: { className?: string }) {
  const t = useT();

  return (
    <div className={cn("shrink-0 px-4 pb-3", className)}>
      <Link
        href={TANGBUY_DROPSHIPPING_URL}
        target="_blank"
        rel="noopener noreferrer"
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
      </Link>
    </div>
  );
}
