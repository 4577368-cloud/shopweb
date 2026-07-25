"use client";

import { motion } from "framer-motion";
import { ArrowRight, Wand2, Clock } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";
import { LandingHeroPreview } from "@/components/landing/landing-hero-preview";

interface LandingHeroProps {
  onStart: () => void;
  compact?: boolean;
}

export function LandingHero({ onStart, compact = false }: LandingHeroProps) {
  const t = useT();

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.07, delayChildren: 0.08 },
    },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  const Text = (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className={compact ? "space-y-4" : "space-y-5"}
    >
      <motion.div variants={item}>
        <span className="landing-badge">
          <Wand2 className="h-3 w-3" />
          {t("landing.badge")}
        </span>
      </motion.div>

      {/* 大标题 */}
      <motion.h1
        variants={item}
        className={
          compact
            ? "text-3xl font-extrabold leading-tight tracking-tight text-[--landing-text]"
            : "text-[2.75rem] font-extrabold leading-[1.1] tracking-tight text-[--landing-text] md:text-[3.25rem] lg:text-[3.75rem]"
        }
      >
        {t("landing.heroTitle")}
      </motion.h1>

      {/* 60 秒速度环 */}
      {!compact ? (
        <motion.div variants={item} className="flex items-center gap-4">
          <div className="relative">
            <span className="landing-big-number text-[3.5rem] md:text-[4.5rem]">60</span>
            {/* 速度环装饰 */}
            <motion.div
              className="pointer-events-none absolute -inset-3 rounded-full border-2 border-dashed border-[--landing-accent]/20"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[--landing-accent]"
              animate={{ scale: [1, 1.3, 1], opacity: [0.8, 0.4, 0.8] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-[--landing-text] md:text-xl">
              {t("landing.heroSeconds")}
            </span>
            <span className="text-sm text-[--landing-text-muted]">
              {t("landing.heroSecondsSub")}
            </span>
          </div>
        </motion.div>
      ) : null}

      <motion.p
        variants={item}
        className={
          compact
            ? "text-sm leading-relaxed text-[--landing-text-muted]"
            : "max-w-xl text-base leading-relaxed text-[--landing-text-muted] md:text-lg"
        }
      >
        {t("landing.heroSubtitle")}
      </motion.p>

      {!compact ? (
        <motion.div variants={item} className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStart}
            className="landing-btn-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] px-6 py-2.5 text-sm font-semibold"
          >
            {t("landing.ctaStart")}
            <ArrowRight className="h-4 w-4" />
          </button>
          <a
            href="#how-it-works"
            className="landing-btn-secondary inline-flex items-center rounded-[var(--radius-control)] px-6 py-2.5 text-sm font-semibold"
          >
            {t("landing.ctaDemo")}
          </a>
        </motion.div>
      ) : null}

      {!compact ? (
        <motion.div
          variants={item}
          className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-xs text-[--landing-text-muted]"
        >
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-[--landing-accent]" />
            {t("landing.trustMerchants")}
          </span>
          <span className="text-[--landing-border-hover]">·</span>
          <span>{t("landing.trustAccuracy")}</span>
          <span className="text-[--landing-border-hover]">·</span>
          <span>{t("landing.trustSpeed")}</span>
        </motion.div>
      ) : null}
    </motion.div>
  );

  if (compact) {
    return Text;
  }

  return (
    <div className="landing-hero-grid">
      {Text}
      <LandingHeroPreview />
    </div>
  );
}
