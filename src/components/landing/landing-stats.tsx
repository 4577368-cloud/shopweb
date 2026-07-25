"use client";

import { motion } from "framer-motion";
import { useT } from "@/i18n/LocaleProvider";

interface StatItem {
  id: string;
  valueKey: string;
  labelKey: string;
}

const STATS: StatItem[] = [
  { id: "merchants", valueKey: "landing.statMerchantsValue", labelKey: "landing.statMerchantsLabel" },
  { id: "accuracy", valueKey: "landing.statAccuracyValue", labelKey: "landing.statAccuracyLabel" },
  { id: "speed", valueKey: "landing.statSpeedValue", labelKey: "landing.statSpeedLabel" },
  { id: "steps", valueKey: "landing.statStepsValue", labelKey: "landing.statStepsLabel" },
];

/**
 * Stats 数据条：4 个核心数字指标，居中展示在 Hero 下方。
 * 数字采用渐变高亮，玻璃质感卡片。
 */
export function LandingStats() {
  const t = useT();

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="landing-stats"
      >
        {STATS.map((stat, index) => (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="landing-stat-card"
          >
            <p className="landing-stat-value">{t(stat.valueKey)}</p>
            <p className="landing-stat-label">{t(stat.labelKey)}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
