"use client";

import { Package } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { InfoCard } from "@/components/workbench/info-card";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import {
  countryFlagEmoji,
  localizedCountryMarketLabel,
} from "@/lib/logistics/markets";
import { listTemplateCountryCodes } from "@/lib/logistics/template-params";
import type { LogisticsTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";

function packagingPriorityLabel(
  t: ReturnType<typeof useT>,
  packaging: LogisticsTemplate["packaging"] | string | undefined
): string {
  switch (packaging) {
    case "CARTON":
      return t("logisticsTemplate.packCartonLabel");
    case "MINIMAL":
    default:
      return t("logisticsTemplate.packMinimalLabel");
  }
}

export interface LogisticsStrategyRailCardProps {
  /** Saved templates only — empty means merchant has not saved yet. */
  hasSavedTemplate: boolean;
  activeTemplate: LogisticsTemplate | null;
  analysisReady?: boolean;
  onConfigure: () => void;
  className?: string;
}

/**
 * Right-rail logistics strategy card (pricing-rail pattern):
 * setup CTA when unset; compact summary + edit when saved.
 */
export function LogisticsStrategyRailCard({
  hasSavedTemplate,
  activeTemplate,
  analysisReady = false,
  onConfigure,
  className,
}: LogisticsStrategyRailCardProps) {
  const t = useT();
  const locale = useLocale();
  const unset = !hasSavedTemplate;
  const guiding = unset && analysisReady;

  if (unset) {
    return (
      <section
        className={selectableCardClassName({
          interactive: true,
          className: cn(
            "px-3.5 py-3",
            guiding
              ? "border-brand/35 bg-brand-soft/80"
              : "border-brand-accent/20 bg-brand-soft/50",
            className
          ),
        })}
      >
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-strong">
          <Package className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t("logisticsStrategyRail.setupTitle")}
          </span>
          {guiding ? (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="text-xs leading-5 text-ink-muted">
          {t("logisticsStrategyRail.setupDesc")}
        </p>
        <Button size="sm" className="mt-2.5 w-full" onClick={onConfigure}>
          {t("logisticsStrategyRail.configureNow")}
        </Button>
      </section>
    );
  }

  const marketCode = listTemplateCountryCodes(activeTemplate)[0] ?? "US";

  return (
    <InfoCard
      title={t("logisticsStrategyRail.title")}
      icon={<Package className="h-3.5 w-3.5 text-brand" />}
      action={
        <button
          type="button"
          onClick={onConfigure}
          className="font-medium text-link hover:text-link-hover hover:underline"
        >
          {t("logisticsStrategyRail.adjust")}
        </button>
      }
      className={className}
    >
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5">
          <span className="text-sm leading-none" aria-hidden>
            {countryFlagEmoji(marketCode)}
          </span>
          <span className="font-medium text-ink">
            {localizedCountryMarketLabel(marketCode, locale)}
          </span>
          {t("common.commaSeparator")}
          {packagingPriorityLabel(t, activeTemplate?.packaging)}
        </p>
        <p className="text-[11px] text-ink-subtle">
          {t("logisticsStrategyRail.summaryDesc")}
        </p>
      </div>
    </InfoCard>
  );
}
