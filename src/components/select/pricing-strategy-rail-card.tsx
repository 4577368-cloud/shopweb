"use client";

import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoCard } from "@/components/workbench/info-card";
import type { PricingTemplate } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const unset = forceGuide || needsPricingSetup(template);
  const guiding = unset && (forceGuide || analysisReady);

  if (template == null && !analysisReady && !forceGuide) {
    return (
      <InfoCard
        title="定价策略"
        icon={<Coins className="h-3.5 w-3.5 text-brand" />}
        className={className}
      >
        <p>读取定价策略中…</p>
      </InfoCard>
    );
  }

  if (!template || template.isDefault || forceGuide) {
    return (
      <section
        className={cn(
          "rounded-[var(--radius-card)] border px-3.5 py-3 shadow-card transition-shadow",
          guiding
            ? "border-brand/35 bg-brand-soft/80 ring-1 ring-brand/20"
            : "border-emerald-100 bg-brand-soft/50",
          className
        )}
      >
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-brand-strong">
          <Coins className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">先配置定价策略</span>
          {guiding ? (
            <span
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brand"
              aria-hidden
            />
          ) : null}
        </div>
        <p className="text-xs leading-5 text-ink-muted">
          设置目标币种、汇率、倍率等后，系统才会生成建议售价。
        </p>
        <Button
          size="sm"
          className="mt-2.5 w-full"
          onClick={onConfigure}
        >
          立即配置
        </Button>
      </section>
    );
  }

  return (
    <InfoCard
      title="定价策略"
      icon={<Coins className="h-3.5 w-3.5 text-brand" />}
      action={
        <button
          type="button"
          onClick={onConfigure}
          className="font-medium text-brand-strong hover:underline"
        >
          调整定价
        </button>
      }
      className={className}
    >
      <div className="space-y-1.5">
        <p>
          目标币种{" "}
          <span className="font-medium text-ink">{template.targetCurrency}</span>
          ，汇率{" "}
          <span className="font-medium text-ink">{template.exchangeRate}</span>
          ，倍率 ×{template.multiplier}
          {template.addend ? `，加价 +${template.addend}` : ""}
        </p>
        <p className="text-[11px] text-ink-subtle">
          采购价按汇率换算为目标币种后，再按倍率、加价与取整生成建议售价。
        </p>
      </div>
    </InfoCard>
  );
}
