import launchSummaryJson from "@/data/launchSummary.json";
import type { CeremonyStats } from "@/lib/sync/ceremony-progress";

export type PipelineStepStatus = "completed" | "active" | "pending";

export interface PipelineStep {
  id: string;
  title: string;
  status: PipelineStepStatus;
  badge?: string;
  summary: string;
  metrics?: Record<string, number>;
}

export interface LaunchProduct {
  id: string;
  title: string;
  image: string;
  checks: string[];
}

export type ProgressTaskStatus = "done" | "running" | "pending";

export interface ProgressTask {
  id: string;
  label: string;
  detail?: string;
  status: ProgressTaskStatus;
}

export interface FollowUpItem {
  id: string;
  count: number;
  title: string;
  description?: string;
  href: string;
  actionLabel: string;
}

export interface LaunchSummary {
  meta: {
    shopName: string;
    shopDomain: string;
    completedAt: string;
    locale: string;
    dataSource?: "live" | "mock";
  };
  pipeline: {
    currentStepId: string;
    steps: PipelineStep[];
  };
  shopifyWrites: {
    newListings: number;
    titleOptimizations: number;
    priceAdjustments: number;
    sourceLinks: number;
    footnote: string;
    ctaHref: string;
    ctaLabel: string;
    showAuditGap?: boolean;
  };
  fulfillmentPrep: {
    skuMapped: number;
    skuTotal: number;
    logisticsConfirmed: number;
    logisticsTotal: number;
    pendingReview: number;
    footnote: string;
    ctaHref: string;
    ctaLabel: string;
  };
  strategy: {
    pricing: {
      sourceLabel: string;
      exchangeRate: number;
      multiplier: number;
      addend: number;
      targetCurrency: string;
      rounding: string;
      isDefault?: boolean;
    };
    logistics: {
      markets: string;
      speed: string;
      packaging: string;
    };
  };
  products: LaunchProduct[];
  stats: CeremonyStats;
  progress: {
    targetPercent: number;
    tasks: ProgressTask[];
    footnote?: string;
  };
  followUps: FollowUpItem[];
}

export function getLaunchSummary(): LaunchSummary {
  const summary = launchSummaryJson as LaunchSummary;
  return {
    ...summary,
    meta: { ...summary.meta, dataSource: "mock" },
    stats: summary.stats ?? {
      productsTotal: 42,
      productsInCeremony: summary.products.length,
      sourceLinksConfirmed: summary.shopifyWrites.newListings,
      sourceLinksTotal: summary.shopifyWrites.sourceLinks,
      sourceLinksPending: 0,
      skuMapped: summary.fulfillmentPrep.skuMapped,
      skuTotal: summary.fulfillmentPrep.skuTotal,
      logisticsQuoted: 0,
      logisticsConfirmed: summary.fulfillmentPrep.logisticsConfirmed,
      logisticsTotal: summary.fulfillmentPrep.logisticsTotal,
    },
  };
}
