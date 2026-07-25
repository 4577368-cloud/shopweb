"use client";

import { motion } from "framer-motion";
import type { ComponentType } from "react";
import { Link2, Search, Crosshair, Package, Send } from "@/lib/ui/icons";
import { useT } from "@/i18n/LocaleProvider";

interface FeatureItem {
  id: string;
  icon: ComponentType<{ className?: string }>;
  titleKey: string;
  descKey: string;
  metricKey: string;
}

const FEATURES: FeatureItem[] = [
  { id: "auth", icon: Link2, titleKey: "landing.featureAuthTitle", descKey: "landing.featureAuthDesc", metricKey: "landing.featureAuthMetric" },
  { id: "products", icon: Search, titleKey: "landing.featureProductsTitle", descKey: "landing.featureProductsDesc", metricKey: "landing.featureProductsMetric" },
  { id: "sku", icon: Crosshair, titleKey: "landing.featureSkuTitle", descKey: "landing.featureSkuDesc", metricKey: "landing.featureSkuMetric" },
  { id: "logistics", icon: Package, titleKey: "landing.featureLogisticsTitle", descKey: "landing.featureLogisticsDesc", metricKey: "landing.featureLogisticsMetric" },
  { id: "sync", icon: Send, titleKey: "landing.featureSyncTitle", descKey: "landing.featureSyncDesc", metricKey: "landing.featureSyncMetric" },
];

/**
 * 核心能力五宫格：对应工作流 5 步。
 * 玻璃质感卡片，hover 上浮 + glow。
 */
export function LandingFeatures() {
  const t = useT();

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-center"
      >
        <h2 className="text-3xl font-bold tracking-tight text-[--landing-text] md:text-4xl">
          {t("landing.featuresTitle")}
        </h2>
        <p className="mt-3 text-sm text-[--landing-text-muted]">
          {t("landing.featuresSubtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="landing-glass-card group flex flex-col p-5"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[--landing-accent]/15 text-[--landing-cyan] ring-1 ring-[--landing-cyan]/20 transition group-hover:bg-[--landing-accent]/25">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-[--landing-text]">
                {t(feature.titleKey)}
              </h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-[--landing-text-muted]">
                {t(feature.descKey)}
              </p>
              <p className="mt-3 text-xs font-medium text-[--landing-cyan]">
                {t(feature.metricKey)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
