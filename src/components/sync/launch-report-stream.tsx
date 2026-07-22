"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CHAR_INTERVAL_MS = 24;

export function LaunchReportStream({
  text,
  percent,
  showFull,
  layout = "horizontal",
  instant = false,
  className,
}: {
  text: string;
  percent: number;
  showFull: boolean;
  layout?: "horizontal" | "vertical";
  /** Skip typewriter — show full report immediately (e.g. returning from completion). */
  instant?: boolean;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(0);

  const targetChars = useMemo(() => {
    if (!text) return 0;
    if (instant || showFull) return text.length;
    return Math.max(0, Math.floor((text.length * percent) / 100));
  }, [text, percent, showFull, instant]);

  useEffect(() => {
    if (instant) {
      setRevealed(text.length);
      return;
    }
    setRevealed(0);
  }, [text, instant]);

  useEffect(() => {
    if (instant) {
      setRevealed(text.length);
      return;
    }
    if (revealed >= targetChars) return;
    const timer = window.setInterval(() => {
      setRevealed((prev) => {
        const step = targetChars - prev > 40 ? 3 : targetChars - prev > 12 ? 2 : 1;
        return Math.min(prev + step, targetChars);
      });
    }, CHAR_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [revealed, targetChars, instant, text.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: instant ? "auto" : "smooth" });
  }, [revealed, instant]);

  const visible = text.slice(0, revealed);
  const streaming = !instant && revealed < text.length;
  const complete = revealed >= text.length && text.length > 0;
  const isVertical = layout === "vertical";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: instant ? 0 : 0.15, duration: instant ? 0.2 : 0.35 }}
      className={cn(
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-hairline bg-surface shadow-card",
        !isVertical && "min-h-[180px]",
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-2.5">
        <p className="text-sm font-semibold text-ink">开店准备报告</p>
        <span className="text-[10px] tabular-nums text-ink-subtle">
          {revealed}/{text.length} 字
        </span>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto bg-surface px-4 py-3 scroll-smooth",
          !isVertical && "max-h-[min(28vh,220px)]"
        )}
      >
        <p className="whitespace-pre-wrap text-[13px] leading-[1.75] text-ink/90">
          {visible}
          {streaming ? (
            <span
              className="ml-0.5 inline-block w-[2px] animate-pulse bg-brand align-middle"
              style={{ height: "1em" }}
              aria-hidden
            />
          ) : null}
        </p>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent transition-opacity duration-500",
          complete || instant ? "opacity-0" : "opacity-100"
        )}
        aria-hidden
      />
    </motion.div>
  );
}
