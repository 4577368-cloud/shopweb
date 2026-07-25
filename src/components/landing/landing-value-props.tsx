"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X, Check, ArrowRight } from "@/lib/ui/icons";

interface ComparisonRow {
  id: string;
  labelKey: string;
  traditionalTimeKey: string;
  traditionalDescKey: string;
  aiTimeKey: string;
  aiDescKey: string;
  traditionalWidth: string; // e.g. "100%"
  aiWidth: string; // e.g. "8%"
}

const ROWS: ComparisonRow[] = [
  {
    id: "sourcing",
    labelKey: "landing.compareLabel1",
    traditionalTimeKey: "landing.compareTradTime1",
    traditionalDescKey: "landing.compareTradDesc1",
    aiTimeKey: "landing.compareAiTime1",
    aiDescKey: "landing.compareAiDesc1",
    traditionalWidth: "100%",
    aiWidth: "6%",
  },
  {
    id: "sku",
    labelKey: "landing.compareLabel2",
    traditionalTimeKey: "landing.compareTradTime2",
    traditionalDescKey: "landing.compareTradDesc2",
    aiTimeKey: "landing.compareAiTime2",
    aiDescKey: "landing.compareAiDesc2",
    traditionalWidth: "100%",
    aiWidth: "15%",
  },
  {
    id: "logistics",
    labelKey: "landing.compareLabel3",
    traditionalTimeKey: "landing.compareTradTime3",
    traditionalDescKey: "landing.compareTradDesc3",
    aiTimeKey: "landing.compareAiTime3",
    aiDescKey: "landing.compareAiDesc3",
    traditionalWidth: "100%",
    aiWidth: "12%",
  },
  {
    id: "listing",
    labelKey: "landing.compareLabel4",
    traditionalTimeKey: "landing.compareTradTime4",
    traditionalDescKey: "landing.compareTradDesc4",
    aiTimeKey: "landing.compareAiTime4",
    aiDescKey: "landing.compareAiDesc4",
    traditionalWidth: "100%",
    aiWidth: "10%",
  },
];

function SpeedBar({ width, isFast, delay }: { width: string; isFast: boolean; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <div ref={ref} className="landing-speed-bar">
      <motion.div
        className={`landing-speed-bar-fill ${isFast ? "" : "is-slow"}`}
        initial={{ width: "0%" }}
        animate={inView ? { width } : { width: "0%" }}
        transition={{ duration: 1.2, delay, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function LandingValueProps() {
  const t = useT();

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5 }}
        className="landing-section-head"
      >
        <span className="landing-section-eyebrow">{t("landing.valueEyebrow")}</span>
        <h2 className="landing-section-title">{t("landing.valueTitle")}</h2>
        <p className="landing-section-subtitle">{t("landing.valueSubtitle")}</p>
      </motion.div>

      {/* 对比表头 */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.4 }}
        className="mb-6 hidden grid-cols-[1fr_1.2fr_1.2fr] gap-6 md:grid"
      >
        <div />
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[--landing-text-muted]">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500">
            <X className="h-3 w-3" />
          </span>
          {t("landing.valueTraditionalTitle")}
        </div>
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[--landing-accent]">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[--landing-accent-soft] text-[--landing-accent]">
            <Check className="h-3 w-3" />
          </span>
          {t("landing.valueAiTitle")}
        </div>
      </motion.div>

      {/* 对比行 */}
      <div className="grid gap-4">
        {ROWS.map((row, index) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: index * 0.08 }}
            className="landing-glass-card grid grid-cols-1 items-center gap-5 p-5 md:grid-cols-[1fr_1.2fr_1.2fr] md:gap-6 md:p-6"
          >
            {/* 环节名 */}
            <div className="text-sm font-semibold text-[--landing-text]">{t(row.labelKey)}</div>

            {/* 传统 */}
            <div>
              <div className="mb-2 flex items-baseline justify-between md:justify-start md:gap-3">
                <span className="text-lg font-bold tabular-nums text-[--landing-text-muted] md:text-xl">
                  {t(row.traditionalTimeKey)}
                </span>
                <span className="text-xs text-[--landing-text-subtle]">{t(row.traditionalDescKey)}</span>
              </div>
              <SpeedBar width={row.traditionalWidth} isFast={false} delay={index * 0.1} />
            </div>

            {/* AI */}
            <div>
              <div className="mb-2 flex items-baseline justify-between md:justify-start md:gap-3">
                <span className="text-lg font-extrabold tabular-nums text-[--landing-accent] md:text-xl">
                  {t(row.aiTimeKey)}
                </span>
                <span className="text-xs text-[--landing-text-muted]">{t(row.aiDescKey)}</span>
              </div>
              <SpeedBar width={row.aiWidth} isFast delay={index * 0.1 + 0.15} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* 底部总览 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-[--landing-border] bg-[--landing-bg-alt] px-6 py-5"
      >
        <div className="text-center">
          <p className="text-2xl font-extrabold text-[--landing-text-muted] md:text-3xl">2–4h</p>
          <p className="mt-0.5 text-xs text-[--landing-text-subtle]">{t("landing.compareTotalTrad")}</p>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[--landing-accent-soft] text-[--landing-accent]">
          <ArrowRight className="h-4 w-4" />
        </div>
        <div className="text-center">
          <p className="landing-text-gradient text-2xl font-extrabold md:text-3xl">60s</p>
          <p className="mt-0.5 text-xs text-[--landing-text-muted]">{t("landing.compareTotalAi")}</p>
        </div>
      </motion.div>
    </section>
  );
}
