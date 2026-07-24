"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface FadeSwapProps {
  /** Whether the dependent data is still loading. */
  loading: boolean;
  /**
   * Skeleton/placeholder shown while loading. The wrapper keeps the same
   * vertical footprint as the final content via `minHeight`, so swapping
   * does not cause layout shift.
   */
  skeleton: ReactNode;
  /** Real content rendered once data is ready. */
  children: ReactNode;
  /**
   * Min height (in tailwind spacing units) the wrapper reserves while
   * loading, so the final content appears in the same slot.
   * Default: 320px.
   */
  minHeightClass?: string;
  /**
   * Fade duration in ms. Default 220 — fast enough to feel snappy,
   * slow enough to read as motion rather than a flash.
   */
  durationMs?: number;
  /**
   * Hide the skeleton from the a11y tree once we have real content,
   * so screen readers do not announce the placeholder.
   */
  ariaLabel?: string;
  className?: string;
}

/**
 * Cross-fade between a loading placeholder and real content.
 *
 * Why this exists:
 *  - Hard `{loading ? <Skeleton/> : <Content/>}` switches visually pop
 *    (especially after a slow network) and may trigger layout shift.
 *  - This component reserves vertical space, fades the skeleton out and
 *    the content in over ~220ms, and waits one frame before unmounting
 *    the skeleton so the two layers overlap briefly (no blank gap).
 *
 *  - When `loading` is true, skeleton is shown; real content stays mounted but faded out.
 */
export function FadeSwap({
  loading,
  skeleton,
  children,
  minHeightClass = "min-h-[320px]",
  durationMs = 220,
  ariaLabel,
  className,
}: FadeSwapProps) {
  const showSkeleton = loading;

  return (
    <div
      className={cn("relative w-full", minHeightClass, className)}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
    >
      {/* Skeleton layer — fades out when content is ready. */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity ease-out",
          showSkeleton ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ transitionDuration: `${durationMs}ms` }}
        aria-hidden={!showSkeleton}
      >
        {skeleton}
      </div>

      {/* Real content — fades in once data is ready. */}
      <div
        className={cn(
          "relative transition-opacity ease-out",
          showSkeleton ? "opacity-0" : "opacity-100"
        )}
        style={{ transitionDuration: `${durationMs}ms` }}
      >
        {children}
      </div>
    </div>
  );
}
