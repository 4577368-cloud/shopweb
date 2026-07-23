"use client";

import { Coins } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { InfoCard } from "@/components/workbench/info-card";
import { useT } from "@/i18n/LocaleProvider";
import type { PricingTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";
import { selectableCardClassName } from "@/lib/ui/selectable-card-styles";

export function needsPricingSetup(template: PricingTemplate | null): boolean {
  return template == null || template.isDefault;
}

export interface PricingStrategyRailCardProps {
  template: PricingTemplate | null;
  /** Analysis / summary finished — enables first-run guidance tone. */
  analysisReady?: boolean;
  /** Force first-setup UI (e.g. preview / after reset), even if a saved template exists. */
  forceGuide?: boolean;
  onConfigure: () => void;
  className?: string;
}

/**
 * Right-rail pricing card: setup guidance when unset, compact summary when saved.
 */
export function PricingStrategyRailCard({
  template,
  analysisReady = false,
  forceGuide = false,
  onConfigure,
  className,
}: PricingStrategyRailCardProps) {
  const t = useT();
  const unset = forceGuide || needsPricingSetup(template);
  const guiding = unset && (forceGuide || analysisReady);

  if (template == null && !analysisReady && !forceGuide) {
    return (
      <InfoCard
        title={t("pricingRail.title")}
        icon={<Coins className="h-3.5 w-3.5 text-brand" />}
        className={className}
      >
        <p>{t("pricingRail.loading")}</p>
      </InfoCard>
    );
  }

  if (!template || template.isDefault || forceGuide) {
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
          <Coins className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t("pricingRail.setupTitle")}</span>
          {guiding ? (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="text-xs leading-5 text-ink-muted">
          {t("pricingRail.setupDesc")}
        </p>
        <Button
          size="sm"
          className="mt-2.5 w-full"
          onClick={onConfigure}
        >
          {t("pricingRail.configureNow")}
        </Button>
      </section>
    );
  }

  return (
    <InfoCard
      title={t("pricingRail.title")}
      icon={<Coins className="h-3.5 w-3.5 text-brand" />}
      action={
        <button
          type="button"
          onClick={onConfigure}
          className="font-medium text-link hover:text-link-hover hover:underline"
        >
          {t("pricingRail.adjustPricing")}
        </button>
      }
      className={className}
    >
      <div className="space-y-1.5">
        <p>
          {t("pricingRail.targetCurrency")}{" "}
          <span className="font-medium text-ink">{template.targetCurrency}</span>
          {t("common.commaSeparator")}
          {t("pricingRail.exchangeRate")}{" "}
          <span className="font-medium text-ink">{template.exchangeRate}</span>
          {t("common.commaSeparator")}
          {t("pricingRail.multiplier")} ×{template.multiplier}
          {template.addend
            ? `${t("common.commaSeparator")}${t("pricingRail.addend")} +${template.addend}`
            : ""}
        </p>
        <p className="text-[11px] text-ink-subtle">
          {t("pricingRail.summaryDesc")}
        </p>
      </div>
    </InfoCard>
  );
}
