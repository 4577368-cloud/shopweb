import type { ScanSummaryStats } from "@/lib/scan/copilot-workflow";

const PREFIX = "products-scan-handoff:";

export interface ScanHandoffPayload extends ScanSummaryStats {
  at: number;
}

export function markScanHandoff(shopName: string, stats: ScanSummaryStats): void {
  if (typeof sessionStorage === "undefined") return;
  const payload: ScanHandoffPayload = { ...stats, at: Date.now() };
  sessionStorage.setItem(`${PREFIX}${shopName}`, JSON.stringify(payload));
}

/** Read and clear one-time handoff after scan → result transition. */
export function consumeScanHandoff(shopName: string): ScanHandoffPayload | null {
  if (typeof sessionStorage === "undefined") return null;
  const key = `${PREFIX}${shopName}`;
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw) as ScanHandoffPayload;
    if (parsed.at && Date.now() - parsed.at > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}
