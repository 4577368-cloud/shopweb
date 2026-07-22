import type { LogisticsSpeedPreference, PackagingType } from "@/lib/types";
import { codesFromSelections } from "@/components/logistics/market-multi-select";
import type { LogisticsTemplate } from "@/lib/types";

/**
 * Offline fallback only — browser quote flow resolves IDs via areaListGroup.
 * Override via TANGBUY_COUNTRY_IDS env JSON.
 */
export const TANGBUY_COUNTRY_IDS: Record<string, string> = {
  US: "3",
  GB: "21",
  FR: "22",
  DE: "23",
  CA: "24999",
};

export function resolveCountryId(countryCode: string): string | null {
  const code = countryCode.trim().toUpperCase();
  if (!code) return null;

  const envRaw = process.env.TANGBUY_COUNTRY_IDS;
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw) as Record<string, string>;
      const fromEnv = parsed[code];
      if (fromEnv?.trim()) return fromEnv.trim();
    } catch {
      // ignore malformed env
    }
  }

  return TANGBUY_COUNTRY_IDS[code] ?? null;
}

/** Tangbuy estimate API shippingOption: 1=经济 2=均衡 3=快速 */
/** Tangbuy increment codes for packaging — mirrors dropshipping estimate payload. */
export function packagingToIncrementList(
  packaging: PackagingType | string | undefined
): string[] {
  switch (packaging) {
    case "CARTON":
      return ["11"];
    case "MINIMAL":
    default:
      return ["10"];
  }
}

export function speedPreferenceToShippingOption(
  pref: LogisticsSpeedPreference | string | undefined
): number {
  switch (pref) {
    case "ECONOMY":
      return 1;
    case "FAST":
      return 3;
    case "BALANCED":
    default:
      return 2;
  }
}

export function listTemplateCountryCodes(
  template: LogisticsTemplate | null | undefined
): string[] {
  if (!template) return [];
  return codesFromSelections(template.markets);
}

export function resolveQuoteMarketCode(
  template: LogisticsTemplate | null | undefined,
  preferred?: string | null
): string | null {
  const codes = listTemplateCountryCodes(template);
  if (codes.length === 0) return null;
  const pick = preferred?.trim().toUpperCase();
  if (pick && codes.includes(pick)) return pick;
  return codes[0] ?? null;
}

export interface EstimateTemplateParams {
  countryCode: string;
  countryId: string;
  shippingOption: number;
  packaging: PackagingType;
}

export function buildEstimateParams(
  template: LogisticsTemplate | null | undefined,
  marketCode: string | null | undefined,
  countryIdOverride?: string | null
): EstimateTemplateParams | null {
  const countryCode = resolveQuoteMarketCode(template, marketCode);
  if (!countryCode) return null;
  const countryId =
    countryIdOverride?.trim() || resolveCountryId(countryCode) || null;
  if (!countryId) return null;
  return {
    countryCode,
    countryId,
    shippingOption: speedPreferenceToShippingOption(template?.speedPreference),
    packaging: template?.packaging ?? "MINIMAL",
  };
}

export function shippingOptionLabel(option: number): string {
  switch (option) {
    case 1:
      return "经济";
    case 3:
      return "快速";
    default:
      return "均衡";
  }
}

/** Prototype-style strategy subtitle on logistics page. */
export function formatSpeedPriorityLabel(
  pref: LogisticsSpeedPreference | string | undefined
): string {
  switch (pref) {
    case "ECONOMY":
      return "经济优先 · 8-15 天";
    case "FAST":
      return "快速优先 · 5-10 天";
    case "BALANCED":
    default:
      return "均衡优先 · 10-18 天";
  }
}
