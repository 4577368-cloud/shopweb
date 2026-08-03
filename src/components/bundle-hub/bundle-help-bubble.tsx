"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/LocaleProvider";
import {
  getBundleGuide,
  type BundleGuideId,
} from "@/lib/bundle/guide-content";
import { CircleHelp, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Icon-only help bubble — step / scene / Shopify checklist for merchants. */
export function BundleHelpBubble({
  guideId,
  className,
}: {
  guideId: BundleGuideId;
  className?: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const doc = getBundleGuide(guideId, locale);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 w-7 px-0"
        title={t("bundleHub.guideOpen")}
        aria-label={t("bundleHub.guideOpen")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </Button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={doc.title}
          className="absolute left-0 top-[calc(100%+0.35rem)] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-hairline bg-surface p-3 shadow-card sm:left-auto sm:right-0"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="text-[13px] font-semibold leading-snug text-ink">
              {doc.title}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 w-7 shrink-0 px-0"
              title={t("bundleHub.guideClose")}
              aria-label={t("bundleHub.guideClose")}
              onClick={() => setOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <GuideSection heading={t("bundleHub.guideHow")} items={doc.how} />
          <GuideSection
            heading={t("bundleHub.guideScenes")}
            items={doc.scenes}
            className="mt-2.5"
          />
          <GuideSection
            heading={t("bundleHub.guideShopify")}
            items={doc.shopify}
            className="mt-2.5"
            emphasize
          />
        </div>
      ) : null}
    </div>
  );
}

function GuideSection({
  heading,
  items,
  className,
  emphasize,
}: {
  heading: string;
  items: string[];
  className?: string;
  emphasize?: boolean;
}) {
  return (
    <div className={className}>
      <p
        className={cn(
          "text-[11px] font-semibold",
          emphasize ? "text-brand-accent" : "text-ink"
        )}
      >
        {heading}
      </p>
      <ol className="mt-1 list-decimal space-y-1.5 pl-4 text-[11px] leading-relaxed text-ink-muted">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ol>
    </div>
  );
}
