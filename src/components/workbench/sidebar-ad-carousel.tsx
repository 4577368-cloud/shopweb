"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Sidebar promo slot geometry (matches StepSidebar: w-[15.5rem] with px-4 padding).
 * Provide assets at 2× for retina: 432 × 346 px (WebP/PNG).
 */
export const SIDEBAR_AD_SLOT = {
  width: 216,
  height: 173,
  aspectRatio: "5 / 4",
  retinaWidth: 432,
  retinaHeight: 346,
} as const;

const SLIDE_INTERVAL_MS = 5000;

const SLIDES = [
  {
    id: "1",
    src: "https://imgus.tangbuy.com/static/images/2026-07-23/c081f75fc8b547c9ac05f8c554ebd800-178479360258315226238531274178740.png",
    alt: "推广 1",
  },
  {
    id: "2",
    src: "https://imgus.tangbuy.com/static/images/2026-07-23/4a28b868e52f4cbfb7035cd1a6b312d3-17847924963615610563641188460745.png",
    alt: "推广 2",
  },
  {
    id: "3",
    src: "https://imgus.tangbuy.com/static/images/2026-07-23/b43ffb71f6cc441b8e537a6b6cbf2450-17847938167449790737401923439366.png",
    alt: "推广 3",
  },
] as const;

export function SidebarAdCarousel({ className }: { className?: string }) {
  const [active, setActive] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduceMotion || SLIDES.length <= 1) return;
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <div
      className={cn("shrink-0", className)}
      aria-roledescription="carousel"
      aria-label="Promotions"
    >
      <div
        className="relative overflow-hidden rounded-[var(--radius-control)] border border-hairline bg-surface-muted"
        style={{ aspectRatio: SIDEBAR_AD_SLOT.aspectRatio }}
      >
        {SLIDES.map((slide, index) => (
          <div
            key={slide.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-500",
              index === active ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            aria-hidden={index !== active}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              className="h-full w-full object-cover"
              draggable={false}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>

      <div
        className="mt-2 flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="Promotion slides"
      >
        {SLIDES.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={`Slide ${index + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === active
                ? "w-4 bg-brand-accent"
                : "w-1.5 bg-muted-strong hover:bg-ring/60"
            )}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </div>
  );
}
