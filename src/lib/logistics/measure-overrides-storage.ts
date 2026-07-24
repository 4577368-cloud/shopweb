import type { MeasureOverride } from "@/components/logistics/logistics-decision-list";

const MEASURE_OVERRIDES_PREFIX = "logistics-measures:v1:";

function measureOverridesStorageKey(shopName: string): string {
  return `${MEASURE_OVERRIDES_PREFIX}${shopName}`;
}

export function readMeasureOverrides(shopName: string): Map<string, MeasureOverride> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(measureOverridesStorageKey(shopName));
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Array<[string, MeasureOverride]>;
    if (!Array.isArray(parsed)) return new Map();
    return new Map(parsed);
  } catch {
    return new Map();
  }
}

export function writeMeasureOverrides(
  shopName: string,
  map: Map<string, MeasureOverride>
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      measureOverridesStorageKey(shopName),
      JSON.stringify([...map.entries()])
    );
  } catch {
    // ignore quota / private mode
  }
}
