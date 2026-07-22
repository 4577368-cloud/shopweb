import type { LogisticsTemplate } from "@/lib/types";

export function buildLogisticsTemplateScopeKey(
  template: LogisticsTemplate | null | undefined
): string {
  if (!template) return "";
  return [
    template.id,
    template.packaging,
    template.speedPreference,
    JSON.stringify(template.markets ?? []),
  ].join("|");
}
