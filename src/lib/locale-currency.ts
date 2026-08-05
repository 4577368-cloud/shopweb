/**
 * Map UI locale → display / listing target currency.
 * System FX is resolved for this currency under the hood (not shown to merchants).
 */
export function currencyForUiLocale(locale?: string | null): string {
  const lang = (locale ?? "en").split("-")[0]?.toLowerCase() ?? "en";
  switch (lang) {
    case "zh":
      return "CNY";
    case "fr":
    case "es":
      return "EUR";
    case "en":
    default:
      return "USD";
  }
}
