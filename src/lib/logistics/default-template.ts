import type { LogisticsTemplate, LogisticsTemplateVO } from "@/lib/types";

/** The backend stores one row per shop, so the client-side id is a fixed sentinel. */
export const LOGISTICS_TEMPLATE_ID = "default";

export function createDefaultLogisticsTemplate(shopName: string): LogisticsTemplate {
  return {
    id: LOGISTICS_TEMPLATE_ID,
    shopName,
    packaging: "MINIMAL",
    speedPreference: "BALANCED",
    markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
    isActive: true,
  };
}

export function logisticsTemplateFromVo(
  vo: LogisticsTemplateVO,
  shopName: string
): LogisticsTemplate {
  return {
    id: LOGISTICS_TEMPLATE_ID,
    shopName: vo.shopName?.trim() || shopName,
    packaging: vo.packaging ?? "MINIMAL",
    speedPreference: vo.speedPreference ?? "BALANCED",
    markets: vo.markets ?? [],
    isActive: true,
    updatedAt: vo.updatedAt ?? null,
  };
}
