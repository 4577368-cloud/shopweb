"use client";

import { APP_FULL_NAME, PARENT_BRAND } from "@/lib/brand";
import { useT } from "@/i18n/LocaleProvider";

/**
 * Footer：版权信息 + 品牌名（含隶属 Tangbuy，单行）。
 */
export function LandingFooter() {
  const t = useT();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[--landing-border] py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 text-xs text-[--landing-text-subtle] sm:flex-row">
        <p>
          {APP_FULL_NAME}
          {" · "}
          {t("brand.affiliationInlay", { parent: PARENT_BRAND })}
        </p>
        <p>© {year} {t("landing.footerCopyright")}</p>
      </div>
    </footer>
  );
}
