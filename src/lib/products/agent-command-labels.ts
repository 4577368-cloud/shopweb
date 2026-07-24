import type { ProductsTranslateFn } from "@/lib/products/agent-command-types";

export interface ProductsCommandLabels {
  copyActionLabel: (
    action: "translate" | "rewrite" | "optimize",
    targetLang?: string
  ) => string;
  previewFieldLabel: (copyField: "title" | "description" | "all") => string;
  previewModeNote: (style: "literal" | "amazon", short?: boolean) => string;
  previewDurationHint: (estimatedSeconds: number) => string;
}

export function createProductsCommandLabels(
  t: ProductsTranslateFn
): ProductsCommandLabels {
  return {
    copyActionLabel(action, targetLang) {
      if (action === "translate") {
        return t("productsPage.copyTranslate", {
          lang: targetLang?.toUpperCase() ?? "EN",
        });
      }
      if (action === "rewrite") return t("productsPage.copyRewrite");
      return t("productsPage.copyOptimize");
    },
    previewFieldLabel(copyField) {
      if (copyField === "title") return t("productsPreview.fieldTitle");
      if (copyField === "description") {
        return t("productsPreview.fieldDescription");
      }
      return t("productsPreview.fieldAll");
    },
    previewModeNote(style, short = false) {
      return style === "literal"
        ? short
          ? t("productsPreview.modeLiteralShort")
          : t("productsPreview.modeLiteral")
        : t("productsPreview.modeAmazon");
    },
    previewDurationHint(estimatedSeconds) {
      return estimatedSeconds < 60
        ? t("productsPreview.durationSeconds", { seconds: estimatedSeconds })
        : t("productsPreview.durationMinutes", {
            minutes: Math.ceil(estimatedSeconds / 60),
          });
    },
  };
}
