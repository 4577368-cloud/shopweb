"use client";

import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { Store, Boxes, Truck } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";

interface UseCaseItem {
  id: string;
  icon: ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
  tagKey: string;
}

const USE_CASES: UseCaseItem[] = [
  { id: "newcomer", icon: Store, titleKey: "landing.useCase1Title", descKey: "landing.useCase1Desc", tagKey: "landing.useCase1Tag" },
  { id: "operator", icon: Boxes, titleKey: "landing.useCase2Title", descKey: "landing.useCase2Desc", tagKey: "landing.useCase2Tag" },
  { id: "supply-chain", icon: Truck, titleKey: "landing.useCase3Title", descKey: "landing.useCase3Desc", tagKey: "landing.useCase3Tag" },
];

/**
 * 使用场景区：3 类典型用户。
 * 每卡：图标 + 标题 + 描述 + 适用人群标签。
 */
export function LandingUseCases() {
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
        <span className="landing-section-eyebrow">{t("landing.useCasesEyebrow")}</span>
        <h2 className="landing-section-title">{t("landing.useCasesTitle")}</h2>
        <p className="landing-section-subtitle">{t("landing.useCasesSubtitle")}</p>
      </motion.div>

      <div className="landing-use-case-grid">
        {USE_CASES.map((useCase, index) => {
          const Icon = useCase.icon;
          return (
            <motion.div
              key={useCase.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="landing-use-case-card"
            >
              <div className="landing-use-case-icon">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-[--landing-text]">
                {t(useCase.titleKey)}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[--landing-text-muted]">
                {t(useCase.descKey)}
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[--landing-cyan]/30 bg-[--landing-cyan]/5 px-2.5 py-0.5 text-[11px] font-medium text-[--landing-cyan]">
                {t(useCase.tagKey)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
