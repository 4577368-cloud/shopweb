import fs from "fs";
import path from "path";
import type { LogisticsLine, QuoteStatus } from "@/lib/types";

export interface StoredVariantAcceptance {
  thirdPlatformSkuId: string;
  thirdPlatformItemId: string;
  acceptedAt: string;
  recommendedLine?: LogisticsLine;
  alternativeLines?: LogisticsLine[];
  quoteStatus?: QuoteStatus;
}

export interface AcceptDecisionsFile {
  shopName: string;
  acceptances: StoredVariantAcceptance[];
}

const STORAGE_DIR = path.join(process.cwd(), ".data", "logistics");

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function acceptancePath(shopName: string): string {
  const safe = shopName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `${safe}-acceptances.json`);
}

function normalizeAcceptance(row: StoredVariantAcceptance): StoredVariantAcceptance {
  const hasLine = Boolean(
    row.recommendedLine?.lineName?.trim() || row.recommendedLine?.lineCode?.trim()
  );
  if (hasLine) return row;
  if (row.quoteStatus === "SUCCESS" || !row.quoteStatus) {
    return { ...row, quoteStatus: "NOT_REQUESTED" };
  }
  return row;
}

export function readAcceptances(shopName: string): StoredVariantAcceptance[] {
  try {
    ensureStorageDir();
    const filePath = acceptancePath(shopName);
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AcceptDecisionsFile;
    if (!raw || !Array.isArray(raw.acceptances)) return [];
    const normalized = raw.acceptances.map(normalizeAcceptance);
    const needsRewrite = normalized.some(
      (row, index) => row.quoteStatus !== raw.acceptances[index]?.quoteStatus
    );
    if (needsRewrite) {
      writeAcceptances(shopName, normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

export function writeAcceptances(
  shopName: string,
  acceptances: StoredVariantAcceptance[]
): void {
  ensureStorageDir();
  const payload: AcceptDecisionsFile = { shopName, acceptances };
  fs.writeFileSync(acceptancePath(shopName), JSON.stringify(payload, null, 2));
}

export function upsertAcceptances(
  shopName: string,
  incoming: StoredVariantAcceptance[]
): StoredVariantAcceptance[] {
  const existing = readAcceptances(shopName);
  const bySku = new Map(
    existing.map((a) => [a.thirdPlatformSkuId, a] as const)
  );
  for (const row of incoming) {
    bySku.set(row.thirdPlatformSkuId, row);
  }
  const merged = Array.from(bySku.values());
  writeAcceptances(shopName, merged);
  return merged;
}
