import type { LogisticsEstimateResult } from "@/lib/api";
import {
  formatFee,
  formatTransitLabel,
  resolveLines,
  type LogisticsTranslate,
} from "@/lib/logistics/display";
import type {
  LogisticsTemplate,
  ProductLogisticsProfile,
  VariantLogisticsDecision,
} from "@/lib/types";

export function resolveProductProfileByHint(
  profiles: ProductLogisticsProfile[],
  opts: {
    productId?: string | null;
    titleHint?: string | null;
    focusTitle?: string | null;
  }
): ProductLogisticsProfile | null {
  const id = opts.productId?.trim();
  if (id) {
    const byId = profiles.find((p) => p.thirdPlatformItemId === id);
    if (byId) return byId;
  }

  const hints = [opts.titleHint, opts.focusTitle]
    .map((h) => h?.trim().toLowerCase())
    .filter(Boolean) as string[];

  for (const hint of hints) {
    const exact = profiles.find(
      (p) => (p.title ?? "").trim().toLowerCase() === hint
    );
    if (exact) return exact;
    const partial = profiles.find((p) =>
      (p.title ?? "").toLowerCase().includes(hint)
    );
    if (partial) return partial;
  }

  return null;
}

function variantExplainLine(
  t: LogisticsTranslate,
  variant: VariantLogisticsDecision,
  quote: LogisticsEstimateResult | undefined,
  template: LogisticsTemplate | null
): string {
  const label = variant.optionLabel?.trim() || variant.thirdPlatformSkuId;
  const { recommended, alternatives, quoteStatus } = resolveLines(
    variant,
    quote
  );

  if (variant.decisionStatus === "pending_sku") {
    return `${label}: ${t("agentLogistics.statusPendingSku")}`;
  }
  if (quoteStatus === "INGESTING") {
    return `${label}: ${t("logisticsDisplay.quoteColumn.ingesting")}`;
  }
  if (quoteStatus === "FAILED" || !recommended) {
    const err =
      quote?.errorMessage?.trim() ||
      t("logisticsDisplay.quoteColumn.quoteFailed");
    return `${label}: ${err}`;
  }

  const fee = formatFee(recommended, null);
  const transit = formatTransitLabel(t, recommended);
  const alt = alternatives[0];
  const altPart =
    alt && alternatives.length > 0
      ? ` · ${t("logisticsDisplay.quoteColumn.altLine")}: ${alt.lineName} ${formatFee(alt, null)}`
      : "";
  return `${label}: ${recommended.lineName} · ${[fee, transit]
    .filter(Boolean)
    .join(" · ")}${altPart}`;
}

export function buildQuoteExplainLines(
  t: LogisticsTranslate,
  profile: ProductLogisticsProfile,
  quoteResults: Map<string, LogisticsEstimateResult>,
  template: LogisticsTemplate | null
): string[] {
  const lines: string[] = [];
  const title = profile.title?.trim();
  if (title) {
    lines.push(
      t("agentLogistics.explainQuoteProductHeading", { title })
    );
  }
  if (profile.dominantLogisticsTypeLabel) {
    lines.push(
      t("agentLogistics.explainQuotePostal", {
        postal: profile.dominantLogisticsTypeLabel,
      })
    );
  }

  const variants = profile.variantDecisions ?? [];
  if (variants.length === 0) {
    lines.push(t("agentLogistics.explainQuoteNoVariants"));
    return lines;
  }

  for (const variant of variants) {
    const quote = quoteResults.get(variant.thirdPlatformSkuId);
    lines.push(variantExplainLine(t, variant, quote, template));
  }

  return lines;
}
