"use client";

import { motion } from "framer-motion";
import { useT } from "@/i18n/LocaleProvider";

interface StepItem {
  id: string;
  num: string;
  titleKey: string;
  descKey: string;
}

const STEPS: StepItem[] = [
  { id: "1", num: "01", titleKey: "landing.step1Title", descKey: "landing.step1Desc" },
  { id: "2", num: "02", titleKey: "landing.step2Title", descKey: "landing.step2Desc" },
  { id: "3", num: "03", titleKey: "landing.step3Title", descKey: "landing.step3Desc" },
];

/**
 * How it works：3 步流程，横向排列，连接线。
 */
export function LandingHowItWorks() {
  const t = useT();

  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5 }}
        className="mb-12 text-center"
      >
        <h2 className="text-3xl font-bold tracking-tight text-[--landing-text] md:text-4xl">
          {t("landing.howItWorksTitle")}
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {STEPS.map((step, index) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, delay: index * 0.12 }}
            className="relative flex flex-col"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="text-3xl font-bold tabular-nums text-[--landing-cyan]">
                {step.num}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-[--landing-cyan]/40 to-transparent" />
            </div>
            <h3 className="text-base font-semibold text-[--landing-text]">
              {t(step.titleKey)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[--landing-text-muted]">
              {t(step.descKey)}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
