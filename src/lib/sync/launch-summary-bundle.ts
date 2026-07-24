import type {
  ImageBindingView,
  LogisticsAnalysis,
  LogisticsTemplate,
  PricingTemplate,
  ShopMirrorProduct,
} from "@/lib/types";
import type { SkuAlignOverview } from "@/lib/sku-align-v1/types";

/** Aggregated plugin + local logistics templates for sync ceremony assembly. */
export interface LaunchSummaryBundle {
  shopName: string;
  shopProducts: ShopMirrorProduct[];
  bindings: ImageBindingView[];
  skuOverview: SkuAlignOverview | null;
  logisticsAnalysis: LogisticsAnalysis | null;
  pricingTemplate: PricingTemplate | null;
  logisticsTemplates: LogisticsTemplate[];
}

export type LaunchSummaryBundleInput = LaunchSummaryBundle;
