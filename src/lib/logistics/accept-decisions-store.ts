import fs from "fs";
import path from "path";
import type { VariantAcceptanceRecord } from "@/lib/logistics/merge-acceptances-into-analysis";

export type StoredVariantAcceptance = VariantAcceptanceRecord;

/** Auth forwarded from Next route handlers to tangbuy-plugin. */
export type UpstreamAuthHeaders = {
  cookie?: string | null;
  authorization?: string | null;
};

export interface AcceptDecisionsFile {
  shopName: string;
  acceptances: StoredVariantAcceptance[];
}

const STORAGE_DIR = path.join(process.cwd(), ".data", "logistics");

/**
 * Backend API base. When set, prefer plugin `/api/plugin/logistics/acceptances`.
 * Local `.data` files remain a last-resort fallback for offline/dev only.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/+$/, "");

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

function readLocalAcceptances(shopName: string): StoredVariantAcceptance[] {
  try {
    ensureStorageDir();
    const filePath = acceptancePath(shopName);
    if (!fs.existsSync(filePath)) return [];
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as AcceptDecisionsFile;
    if (!raw || !Array.isArray(raw.acceptances)) return [];
    return raw.acceptances.map(normalizeAcceptance);
  } catch {
    return [];
  }
}

function writeLocalAcceptances(
  shopName: string,
  acceptances: StoredVariantAcceptance[]
): void {
  ensureStorageDir();
  const payload: AcceptDecisionsFile = { shopName, acceptances };
  fs.writeFileSync(acceptancePath(shopName), JSON.stringify(payload, null, 2));
}

function upsertLocalAcceptances(
  shopName: string,
  incoming: StoredVariantAcceptance[]
): StoredVariantAcceptance[] {
  const existing = readLocalAcceptances(shopName);
  const bySku = new Map(existing.map((a) => [a.thirdPlatformSkuId, a] as const));
  for (const row of incoming) {
    bySku.set(row.thirdPlatformSkuId, row);
  }
  const merged = Array.from(bySku.values());
  writeLocalAcceptances(shopName, merged);
  return merged;
}

function authHeaders(auth?: UpstreamAuthHeaders): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const cookie = auth?.cookie?.trim();
  if (cookie) headers.Cookie = cookie;
  const authorization = auth?.authorization?.trim();
  if (authorization) headers.Authorization = authorization;
  return headers;
}

async function fetchAcceptancesFromBackend(
  shopName: string,
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/plugin/logistics/acceptances?shopName=${encodeURIComponent(shopName)}`,
      {
        method: "GET",
        headers: authHeaders(auth),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      console.warn(
        `[acceptances] GET failed status=${res.status} shop=${shopName}`
      );
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data
      .filter((row): row is StoredVariantAcceptance => row != null && typeof row === "object")
      .map(normalizeAcceptance);
  } catch (e) {
    console.warn(`[acceptances] GET network error shop=${shopName}`, e);
    return null;
  }
}

async function upsertAcceptancesToBackend(
  shopName: string,
  incoming: StoredVariantAcceptance[],
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/plugin/logistics/acceptances`, {
      method: "POST",
      headers: {
        ...authHeaders(auth),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shopName, acceptances: incoming }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[acceptances] POST upsert failed status=${res.status} shop=${shopName}`
      );
      return null;
    }
    const data = await res.json();
    const list = data?.acceptances;
    if (!Array.isArray(list)) return null;
    return list
      .filter((row): row is StoredVariantAcceptance => row != null && typeof row === "object")
      .map(normalizeAcceptance);
  } catch (e) {
    console.warn(`[acceptances] POST network error shop=${shopName}`, e);
    return null;
  }
}

async function removeAcceptancesFromBackend(
  shopName: string,
  skuIds: string[],
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/plugin/logistics/acceptances/remove`, {
      method: "POST",
      headers: {
        ...authHeaders(auth),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shopName, skuIds }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(
        `[acceptances] POST remove failed status=${res.status} shop=${shopName}`
      );
      return null;
    }
    const data = await res.json();
    const list = data?.acceptances;
    if (!Array.isArray(list)) return null;
    return list
      .filter((row): row is StoredVariantAcceptance => row != null && typeof row === "object")
      .map(normalizeAcceptance);
  } catch (e) {
    console.warn(`[acceptances] remove network error shop=${shopName}`, e);
    return null;
  }
}

/** Read acceptances — plugin first (with auth), local file fallback. */
export async function readAcceptances(
  shopName: string,
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[]> {
  const backend = await fetchAcceptancesFromBackend(shopName, auth);
  if (backend !== null) return backend;
  return readLocalAcceptances(shopName);
}

/** Batch UPSERT — plugin first; local fallback only if backend unreachable. */
export async function upsertAcceptances(
  shopName: string,
  incoming: StoredVariantAcceptance[],
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[]> {
  const backend = await upsertAcceptancesToBackend(shopName, incoming, auth);
  if (backend !== null) return backend;
  return upsertLocalAcceptances(shopName, incoming);
}

/**
 * Reopen (revoke) confirmed decisions so the user can re-pick lines.
 * Prefer plugin soft-delete; fall back to editing the local JSON file.
 */
export async function removeAcceptances(
  shopName: string,
  skuIds: string[],
  auth?: UpstreamAuthHeaders
): Promise<StoredVariantAcceptance[]> {
  const idSet = new Set(skuIds.filter(Boolean));
  if (idSet.size === 0) return readAcceptances(shopName, auth);

  const backend = await removeAcceptancesFromBackend(shopName, [...idSet], auth);
  if (backend !== null) return backend;

  const local = readLocalAcceptances(shopName).filter(
    (row) => !idSet.has(row.thirdPlatformSkuId)
  );
  writeLocalAcceptances(shopName, local);
  return local;
}

/** @deprecated Use async {@link readAcceptances}. */
export function readAcceptancesSync(shopName: string): StoredVariantAcceptance[] {
  return readLocalAcceptances(shopName);
}

/** @deprecated Use async {@link upsertAcceptances}. */
export function writeAcceptances(
  shopName: string,
  acceptances: StoredVariantAcceptance[]
): void {
  writeLocalAcceptances(shopName, acceptances);
}
