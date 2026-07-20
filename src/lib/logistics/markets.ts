/** Static market groups (Shopify Markets–inspired). Phase 1 dictionary — not live Markets API. */

export interface MarketCountry {
  code: string;
  name: string;
  nameZh: string;
}

export interface MarketGroup {
  id: string;
  label: string;
  labelZh: string;
  countries: MarketCountry[];
}

export const MARKET_GROUPS: MarketGroup[] = [
  {
    id: "north_america",
    label: "North America",
    labelZh: "北美",
    countries: [
      { code: "US", name: "United States", nameZh: "美国" },
      { code: "CA", name: "Canada", nameZh: "加拿大" },
      { code: "MX", name: "Mexico", nameZh: "墨西哥" },
    ],
  },
  {
    id: "uk",
    label: "United Kingdom",
    labelZh: "英国",
    countries: [{ code: "GB", name: "United Kingdom", nameZh: "英国" }],
  },
  {
    id: "eu",
    label: "European Union",
    labelZh: "欧盟",
    countries: [
      { code: "DE", name: "Germany", nameZh: "德国" },
      { code: "FR", name: "France", nameZh: "法国" },
      { code: "IT", name: "Italy", nameZh: "意大利" },
      { code: "ES", name: "Spain", nameZh: "西班牙" },
      { code: "NL", name: "Netherlands", nameZh: "荷兰" },
      { code: "BE", name: "Belgium", nameZh: "比利时" },
      { code: "PL", name: "Poland", nameZh: "波兰" },
      { code: "SE", name: "Sweden", nameZh: "瑞典" },
      { code: "IE", name: "Ireland", nameZh: "爱尔兰" },
      { code: "AT", name: "Austria", nameZh: "奥地利" },
      { code: "PT", name: "Portugal", nameZh: "葡萄牙" },
      { code: "FI", name: "Finland", nameZh: "芬兰" },
      { code: "DK", name: "Denmark", nameZh: "丹麦" },
    ],
  },
  {
    id: "anz",
    label: "Australia & NZ",
    labelZh: "澳新",
    countries: [
      { code: "AU", name: "Australia", nameZh: "澳大利亚" },
      { code: "NZ", name: "New Zealand", nameZh: "新西兰" },
    ],
  },
  {
    id: "asia",
    label: "Asia",
    labelZh: "亚洲",
    countries: [
      { code: "JP", name: "Japan", nameZh: "日本" },
      { code: "KR", name: "South Korea", nameZh: "韩国" },
      { code: "SG", name: "Singapore", nameZh: "新加坡" },
      { code: "MY", name: "Malaysia", nameZh: "马来西亚" },
      { code: "TH", name: "Thailand", nameZh: "泰国" },
      { code: "PH", name: "Philippines", nameZh: "菲律宾" },
      { code: "VN", name: "Vietnam", nameZh: "越南" },
      { code: "TW", name: "Taiwan", nameZh: "中国台湾" },
      { code: "HK", name: "Hong Kong", nameZh: "中国香港" },
    ],
  },
];

export function findCountry(code: string): MarketCountry | undefined {
  const upper = code.toUpperCase();
  for (const g of MARKET_GROUPS) {
    const c = g.countries.find((x) => x.code === upper);
    if (c) return c;
  }
  return undefined;
}

export function findGroupForCountry(code: string): MarketGroup | undefined {
  const upper = code.toUpperCase();
  return MARKET_GROUPS.find((g) => g.countries.some((c) => c.code === upper));
}

export function countryLabel(code: string): string {
  const c = findCountry(code);
  return c ? `${c.nameZh} (${c.code})` : code;
}
