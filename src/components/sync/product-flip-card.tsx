"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "@/lib/ui/icons";
import { AnimatePresence, motion } from "framer-motion";
import { ThumbImage } from "@/components/ui/thumb-image";
import { useT } from "@/i18n/LocaleProvider";
import type { LaunchProduct } from "@/lib/sync/launch-summary";

const FLIP_INTERVAL_MS = 1200;

export function ProductFlipCard({
  products,
  activeIndex,
  processedCount,
  totalCount,
  carouselCount,
  autoRotate = false,
}: {
  products: LaunchProduct[];
  activeIndex: number;
  processedCount: number;
  totalCount: number;
  carouselCount?: number;
  autoRotate?: boolean;
}) {
  const t = useT();
  const [index, setIndex] = useState(activeIndex);

  const count = products.length;
  const previewTotal = carouselCount ?? count;
  const current = products[index % Math.max(count, 1)];

  useEffect(() => {
    setIndex(activeIndex);
  }, [activeIndex]);

  useEffect(() => {
    if (!autoRotate || count <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count);
    }, FLIP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRotate, count]);

  if (!current) {
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface p-6 text-center text-sm text-ink-muted shadow-card">
        {t("syncUi.noProductsToShow")}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4 shadow-card"
    >
      <div className="mb-3">
        <p className="text-sm font-semibold text-ink">{t("syncUi.productPrepTitle")}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {t("syncUi.scannedCount", { processed: processedCount, total: totalCount })}
          {previewTotal < totalCount ? (
            <span className="text-ink-subtle">
              {t("syncUi.carouselCount", { count: previewTotal })}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex items-stretch gap-1">
        {autoRotate ? (
          <button
            type="button"
            className="flex h-auto w-7 shrink-0 items-center justify-center self-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            onClick={() => setIndex((prev) => (prev - 1 + count) % count)}
            aria-label={t("syncUi.prevProductAria")}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}

        <div className="min-h-[168px] flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.article
              key={current.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
              className="flex gap-4 py-1"
            >
              <div className="relative h-36 w-28 shrink-0 overflow-hidden rounded-lg">
                {current.image ? (
                  <ThumbImage
                    src={current.image}
                    alt={current.title}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-surface-muted text-[10px] text-ink-subtle">
                    {t("syncUi.noImage")}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-snug text-ink">{current.title}</h3>
                <ul className="mt-3 space-y-1.5">
                  {current.checks.map((check) => (
                    <li
                      key={check}
                      className="flex items-start gap-2 text-xs text-ink-muted"
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.article>
          </AnimatePresence>
        </div>

        {autoRotate ? (
          <button
            type="button"
            className="flex h-auto w-7 shrink-0 items-center justify-center self-center rounded-md text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            onClick={() => setIndex((prev) => (prev + 1) % count)}
            aria-label={t("syncUi.nextProductAria")}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}
