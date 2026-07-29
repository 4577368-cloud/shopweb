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
    <div className="landing-auth-showcase mx-auto flex w-full max-w-[560px] flex-col gap-7">
      <header className="space-y-3">
        <span className="landing-badge">
          <Wand2 className="h-3 w-3" />
          {t("landing.badge")}
        </span>
        <h1 className="text-[1.75rem] font-extrabold leading-snug tracking-tight text-[--landing-text] xl:text-[2rem]">
          {t("landing.heroTitle")}
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-[--landing-text-muted]">
          {t("landing.heroSubtitle")}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-0.5">
          <span className="landing-text-gradient text-3xl font-extrabold tabular-nums leading-none">
            60
          </span>
          <span className="text-base font-bold text-[--landing-text]">
            {t("landing.heroSecondsUnit")}
            <span className="ml-1.5 font-semibold text-[--landing-text-muted]">
              {t("landing.heroSecondsLabel")}
            </span>
          </span>
        </div>
      </header>

      <div className="landing-auth-showcase-stage">
        {/* Full scanning / match loop — same as homepage; instant only skips fade-in. */}
        <LandingHeroPreview instant />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[--landing-text-muted]">
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
