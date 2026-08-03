"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/LocaleProvider";
import type { BundlePlayType } from "@/lib/bundle/campaign-types";
import { BundleHelpBubble } from "@/components/bundle-hub/bundle-help-bubble";

const PLAYS: {
  type: BundlePlayType;
  titleKey: string;
  descKey: string;
  disabled?: boolean;
}[] = [
  {
    type: "fixed_kit",
    titleKey: "bundleHub.playFixedTitle",
    descKey: "bundleHub.playFixedDesc",
  },
  {
    type: "mix_match",
    titleKey: "bundleHub.playMixTitle",
    descKey: "bundleHub.playMixDesc",
  },
  {
    type: "product_offer",
    titleKey: "bundleHub.playOfferTitle",
    descKey: "bundleHub.playOfferDesc",
  },
  {
    type: "byob",
    titleKey: "bundleHub.playByobTitle",
    descKey: "bundleHub.playByobDesc",
  },
];

export function PlayTypePicker({
  onSelect,
  className,
}: {
  onSelect: (type: BundlePlayType) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        <p className="text-[12px] text-ink-muted">{t("bundleHub.pickHint")}</p>
        <BundleHelpBubble guideId="pick" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PLAYS.map((p) => (
          <button
            key={p.type}
            type="button"
            onClick={() => onSelect(p.type)}
            className={cn(
              "rounded-lg border border-hairline bg-surface px-3 py-3 text-left transition-colors",
              "hover:border-brand-accent/40 hover:bg-brand-soft/30"
            )}
          >
            <p className="text-[13px] font-semibold text-ink">{t(p.titleKey)}</p>
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              {t(p.descKey)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
