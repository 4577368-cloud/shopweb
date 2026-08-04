import type { PackagingType } from "@/lib/types";
import { codesFromSelections, singleCountryCodeFromMarkets } from "@/components/logistics/market-multi-select";
import type { LogisticsDeclareConfig, LogisticsTemplate } from "@/lib/types";
import {
  createDefaultDeclareConfig,
  MIN_FUZZY_DECLARE_RATIO,
} from "@/lib/logistics/default-template";

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

/**
 * Fixed balanced option for Tangbuy estimate API (1=economy 2=balanced 3=fast).
 * Speed preference was removed from the merchant template.
 */
export const DEFAULT_ESTIMATE_SHIPPING_OPTION = 2;

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
  const code = singleCountryCodeFromMarkets(template?.markets);
  if (!code) return null;
  const pick = preferred?.trim().toUpperCase();
  if (pick && pick === code) return pick;
  return code;
}

export interface EstimateTemplateParams {
  countryCode: string;
  countryId: string;
  shippingOption: number;
  packaging: PackagingType;
  declareConfig: LogisticsDeclareConfig;
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
    shippingOption: DEFAULT_ESTIMATE_SHIPPING_OPTION,
    packaging: template?.packaging ?? "MINIMAL",
    declareConfig: template?.declareConfig ?? createDefaultDeclareConfig(),
  };
}

/** Build purchaseOrder packageChoosedContent.queryForm from template declare prefs. */
export function buildPackageQueryFormFromTemplate(
  template: LogisticsTemplate | null | undefined,
  goodsAmount?: number | null
): {
  declareMode: number;
  registrationType: number;
  tax: number;
  currency?: string;
  taxNo?: string;
} {
  const d = template?.declareConfig ?? createDefaultDeclareConfig();
  let tax = typeof d.tax === "number" && Number.isFinite(d.tax) ? d.tax : 0;
  if (
    d.declareMode === 0 &&
    tax <= 0 &&
    typeof goodsAmount === "number" &&
    Number.isFinite(goodsAmount) &&
    goodsAmount > 0
  ) {
    const ratio = Math.max(MIN_FUZZY_DECLARE_RATIO, d.fuzzyRatio ?? MIN_FUZZY_DECLARE_RATIO) / 100;
    tax = Math.round(goodsAmount * ratio * 100) / 100;
  } else if (d.declareMode === 1 && tax <= 0 && typeof goodsAmount === "number") {
    tax = Math.max(0, goodsAmount);
  }
  return {
    declareMode: d.declareMode,
    registrationType: d.registrationType,
    tax,
    currency: d.declareCurrency || "USD",
    ...(d.registrationType === 4 && d.taxNo ? { taxNo: d.taxNo } : {}),
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
