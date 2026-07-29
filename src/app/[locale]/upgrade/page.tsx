"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { replaceInApp } from "@/host/adapters/navigation";
import { Loader2 } from "@/lib/ui/icons";

/**
 * Legacy /upgrade URL — merged into step 5「经营订单」(`/sync`).
 * Handoff (图2) is the post-ceremony destination on that route.
 */
export default function UpgradeHandoffPage() {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    replaceInApp(localePath(locale, "/sync"), router);
  }, [locale, router]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2">
      <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden />
    </div>
  );
}
