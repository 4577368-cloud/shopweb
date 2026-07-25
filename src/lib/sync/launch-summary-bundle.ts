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
  /**
   * 商品状态分组计数（key 为状态字符串：ACTIVE / DRAFT / ARCHIVED / UNKNOWN）。
   * 由后端 LaunchSummaryBundleVO 提供，用于 sync 报告真实统计发布上架/下架/草稿数量。
   * mock 路径下不存在该字段。
   */
  productStatusCounts?: Record<string, number> | null;
}

export type LaunchSummaryBundleInput = LaunchSummaryBundle;
