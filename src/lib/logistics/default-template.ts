import type { LogisticsTemplate } from "@/lib/types";

export function createDefaultLogisticsTemplate(
  shopName: string,
  name: string
): LogisticsTemplate {
  return {
    id: "default",
    shopName,
    name,
    packaging: "MINIMAL",
    speedPreference: "BALANCED",
    markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
    isActive: true,
  };
}
