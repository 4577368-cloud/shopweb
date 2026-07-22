/**
 * Map workbench logistics types → Tangbuy estimate `postLimitType`.
 * Tangbuy uses finer-grained codes than our Java classifier enum.
 */
export function toTangbuyPostLimitType(
  postalClass?: string | null
): string | undefined {
  const raw = postalClass?.trim();
  if (!raw) return undefined;

  switch (raw.toUpperCase()) {
    case "GENERAL":
    case "APPAREL":
      return "GENERAL";
    case "BATTERY_MAGNETIC":
      return "BATTERY_BUILT_IN";
    case "FOOD":
      return "FOOD";
    case "BLADE":
      return "BLADE";
    case "BATTERY_BUILT_IN":
    case "BATTERY_EXTERNAL":
    case "MAGNETIC":
    case "LIQUID":
    case "POWDER":
    case "FRAGILE":
    case "OTHER":
      return raw.toUpperCase();
    default:
      return raw;
  }
}
