"use client";

import Link from "next/link";
import { ArrowRight } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";

/** Primary CTA — always navigates to logistics (no blocking modal). */
export function SkuLogisticsEntryGate() {
  const t = useT();
  const locale = useLocale();
  return (
    <Link href={localePath(locale, "/logistics")}>
      <Button size="sm">
        {t("sku.logisticsEntry")}
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </Link>
  );
}
