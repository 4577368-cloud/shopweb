"use client";

import Link from "next/link";
import { ArrowRight } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

/** Primary CTA — same chrome as list card «查看映射». */
export function SkuLogisticsEntryGate({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();
  const label = t("sku.logisticsEntry");
  const title = t("sku.logisticsEntryTitle");
  return (
    <Link
      href={localePath(locale, "/logistics")}
      className={className ?? "shrink-0"}
    >
      <Button size="sm" title={title} aria-label={title} className="shrink-0 whitespace-nowrap">
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}
