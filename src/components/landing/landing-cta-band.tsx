"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";

interface CtaBandProps {
  onStart: () => void;
}

/**
 * 底部 CTA 行动召唤带。
 * 渐变光带 + 居中标题 + 主 CTA + 次 CTA。
 */
export function LandingCtaBand({ onStart }: CtaBandProps) {
  const t = useT();

  return (
    <section className="px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5 }}
        className="landing-cta-band"
      >
        <div className="relative z-10 mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-[--landing-text] md:text-4xl">
            {t("landing.ctaBandTitle")}
          </h2>
          <p className="mt-3 text-sm text-[--landing-text-muted] md:text-base">
            {t("landing.ctaBandSubtitle")}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStart}
              className="landing-btn-primary inline-flex items-center gap-2 rounded-[var(--radius-control)] px-6 py-2.5 text-sm font-semibold"
            >
              {t("landing.ctaBandButton")}
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="#how-it-works"
              className="landing-btn-secondary inline-flex items-center rounded-[var(--radius-control)] px-6 py-2.5 text-sm font-semibold"
            >
              {t("landing.ctaDemo")}
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
