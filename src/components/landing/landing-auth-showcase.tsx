"use client";

import { Clock, Wand2 } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";
import { LandingHeroPreview } from "@/components/landing/landing-hero-preview";

/**
 * Login/register left column: short copy + full animated workbench preview.
 * Avoids the old stacked "text dump + clipped static mock" look.
 */
export function LandingAuthShowcase() {
  const t = useT();

  return (
    <div className="landing-auth-showcase mx-auto flex w-full max-w-[620px] flex-col gap-4 lg:gap-5">
      <header className="space-y-2">
        <span className="landing-badge">
          <Wand2 className="h-3 w-3" />
          {t("landing.badge")}
        </span>
        <h1 className="text-[1.55rem] font-extrabold leading-[1.2] tracking-tight text-[--landing-text] xl:text-[1.85rem]">
          {t("landing.heroTitle")}
        </h1>
        <p className="max-w-lg text-sm leading-relaxed text-[--landing-text-muted]">
          {t("landing.heroSubtitle")}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="landing-text-gradient text-[1.75rem] font-extrabold tabular-nums leading-none">
            60
          </span>
          <span className="text-sm font-bold text-[--landing-text]">
            {t("landing.heroSecondsUnit")}
            <span className="ml-1.5 font-semibold text-[--landing-text-muted]">
              {t("landing.heroSecondsLabel")}
            </span>
          </span>
        </div>
      </header>

      <div className="landing-auth-showcase-stage min-w-0">
        {/* Full scanning / match loop — same as homepage; instant only skips fade-in. */}
        <LandingHeroPreview instant />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[--landing-text-muted]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-[--landing-accent]" />
          {t("landing.trustMerchants")}
        </span>
        <span className="text-[--landing-border-hover]">·</span>
        <span>{t("landing.trustAccuracy")}</span>
        <span className="text-[--landing-border-hover]">·</span>
        <span>{t("landing.trustSpeed")}</span>
      </div>
    </div>
  );
}
