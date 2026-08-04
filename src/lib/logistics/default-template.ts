import type {
  LogisticsDeclareConfig,
  LogisticsTemplate,
  LogisticsTemplateVO,
} from "@/lib/types";

/** The backend stores one row per shop, so the client-side id is a fixed sentinel. */
export const LOGISTICS_TEMPLATE_ID = "default";

export const MIN_FUZZY_DECLARE_RATIO = 40;

export function createDefaultDeclareConfig(): LogisticsDeclareConfig {
  return {
    declareMode: 0,
    registrationType: 0,
    declareCurrency: "USD",
    fuzzyRatio: MIN_FUZZY_DECLARE_RATIO,
    tax: null,
    taxNo: null,
  };
}

export function normalizeDeclareConfig(
  raw: Partial<LogisticsDeclareConfig> | null | undefined
): LogisticsDeclareConfig {
  const base = createDefaultDeclareConfig();
  if (!raw) return base;
  const mode = raw.declareMode === 1 ? 1 : 0;
  const reg =
    raw.registrationType === 3 || raw.registrationType === 4
      ? raw.registrationType
      : 0;
  const fuzzy =
    typeof raw.fuzzyRatio === "number" && Number.isFinite(raw.fuzzyRatio)
      ? Math.max(MIN_FUZZY_DECLARE_RATIO, Math.round(raw.fuzzyRatio))
      : MIN_FUZZY_DECLARE_RATIO;
  const tax =
    typeof raw.tax === "number" && Number.isFinite(raw.tax) ? raw.tax : null;
  return {
    declareMode: mode,
    registrationType: reg,
    declareCurrency: (raw.declareCurrency ?? "USD").trim().toUpperCase() || "USD",
    fuzzyRatio: fuzzy,
    tax,
    taxNo: reg === 4 ? (raw.taxNo?.trim() || null) : null,
  };
}

export function createDefaultLogisticsTemplate(shopName: string): LogisticsTemplate {
  return {
    id: LOGISTICS_TEMPLATE_ID,
    shopName,
    packaging: "MINIMAL",
    markets: [{ marketGroupId: "north_america", countryCodes: ["US"] }],
    declareConfig: createDefaultDeclareConfig(),
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
    markets: vo.markets ?? [],
    declareConfig: normalizeDeclareConfig(vo.declareConfig),
    isActive: true,
    updatedAt: vo.updatedAt ?? null,
  };
}
