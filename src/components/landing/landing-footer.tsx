"use client";

import { APP_FULL_NAME } from "@/lib/brand";
import { useT } from "@/i18n/LocaleProvider";

/**
 * Footer：版权信息 + 品牌名。
 */
export function LandingFooter() {
  const t = useT();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[--landing-border] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-[--landing-text-subtle] sm:flex-row">
        <p>{APP_FULL_NAME}</p>
        <p>© {year} {t("landing.footerCopyright")}</p>
      </div>
    </footer>
  );
}
