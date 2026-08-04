import type { LogisticsTemplate } from "@/lib/types";

export function buildLogisticsTemplateScopeKey(
  template: LogisticsTemplate | null | undefined
): string {
  if (!template) return "";
  const d = template.declareConfig;
  return [
    template.id,
    template.packaging,
    JSON.stringify(template.markets ?? []),
    d?.declareMode ?? 0,
    d?.registrationType ?? 0,
    d?.declareCurrency ?? "USD",
    d?.fuzzyRatio ?? 40,
    d?.tax ?? "",
    d?.taxNo ?? "",
  ].join("|");
}
