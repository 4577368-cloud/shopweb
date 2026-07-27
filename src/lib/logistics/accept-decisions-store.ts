import fs from "fs";
import path from "path";
import type { VariantAcceptanceRecord } from "@/lib/logistics/merge-acceptances-into-analysis";

export type StoredVariantAcceptance = VariantAcceptanceRecord;

export interface AcceptDecisionsFile {
  shopName: string;
  acceptances: StoredVariantAcceptance[];
}

const STORAGE_DIR = path.join(process.cwd(), ".data", "logistics");

/**
 * 后端 API 基址。Next.js 服务端读取 NEXT_PUBLIC_API_BASE（与 api.ts 保持一致）。
 * 设置时优先调用后端 /api/plugin/logistics/acceptances；未设置或调用失败时回退到本地文件。
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

function revokedPath(shopName: string): string {
  const safe = shopName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(STORAGE_DIR, `${safe}-revoked.json`);
}

function readLocalRevoked(shopName: string): Set<string> {
  try {
    ensureStorageDir();
    const filePath = revokedPath(shopName);
    if (!fs.existsSync(filePath)) return new Set();
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
      skuIds?: string[];
    };
    return new Set((raw.skuIds ?? []).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalRevoked(shopName: string, skuIds: Set<string>): void {
  ensureStorageDir();
  fs.writeFileSync(
    revokedPath(shopName),
    JSON.stringify({ shopName, skuIds: Array.from(skuIds) }, null, 2)
  );
}

function filterRevoked(
  shopName: string,
  rows: StoredVariantAcceptance[]
): StoredVariantAcceptance[] {
  const revoked = readLocalRevoked(shopName);
  if (revoked.size === 0) return rows;
  return rows.filter((row) => !revoked.has(row.thirdPlatformSkuId));
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

// ===== 本地文件（fallback） =====

function readLocalAcceptances(shopName: string): StoredVariantAcceptance[] {
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
      writeLocalAcceptances(shopName, normalized);
    }
    return normalized;
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
  const bySku = new Map(
    existing.map((a) => [a.thirdPlatformSkuId, a] as const)
  );
  for (const row of incoming) {
    bySku.set(row.thirdPlatformSkuId, row);
  }
  const merged = Array.from(bySku.values());
  writeLocalAcceptances(shopName, merged);
  return merged;
}

// ===== 后端 API =====

async function fetchAcceptancesFromBackend(
  shopName: string
): Promise<StoredVariantAcceptance[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/plugin/logistics/acceptances?shopName=${encodeURIComponent(shopName)}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    return data
      .filter((row): row is StoredVariantAcceptance => row != null && typeof row === "object")
      .map(normalizeAcceptance);
  } catch {
    return null;
  }
}

async function upsertAcceptancesToBackend(
  shopName: string,
  incoming: StoredVariantAcceptance[]
): Promise<StoredVariantAcceptance[] | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/api/plugin/logistics/acceptances`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ shopName, acceptances: incoming }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const list = data?.acceptances;
    if (!Array.isArray(list)) return null;
    return list
      .filter((row): row is StoredVariantAcceptance => row != null && typeof row === "object")
      .map(normalizeAcceptance);
  } catch {
    return null;
  }
}

// ===== 公共 API（backend-first，本地文件 fallback） =====

/**
 * 读取某 shop 的全量接受决策。
 * API_BASE 已配置时优先调用后端 /api/plugin/logistics/acceptances；
 * 后端不可达或未配置时回退到本地 .data/logistics/*.json。
 */
export async function readAcceptances(
  shopName: string
): Promise<StoredVariantAcceptance[]> {
  const backend = await fetchAcceptancesFromBackend(shopName);
  const rows = backend !== null ? backend : readLocalAcceptances(shopName);
  return filterRevoked(shopName, rows);
}

/**
 * 批量 UPSERT 接受决策。后端优先；失败时回退本地文件。
 * 返回合并后的全量列表（与后端返回一致；fallback 时返回本地合并结果）。
 */
export async function upsertAcceptances(
  shopName: string,
  incoming: StoredVariantAcceptance[]
): Promise<StoredVariantAcceptance[]> {
  // 重新确认时清掉对应撤销标记
  if (incoming.length > 0) {
    const revoked = readLocalRevoked(shopName);
    let changed = false;
    for (const row of incoming) {
      if (revoked.delete(row.thirdPlatformSkuId)) changed = true;
    }
    if (changed) writeLocalRevoked(shopName, revoked);
  }

  const backend = await upsertAcceptancesToBackend(shopName, incoming);
  if (backend !== null) return filterRevoked(shopName, backend);
  return filterRevoked(shopName, upsertLocalAcceptances(shopName, incoming));
}

/**
 * 撤销已确认决策，允许用户重选线路后再确认。
 * 本地 tombstone 保证后续 merge 不再把这些 SKU 标为已确认；
 * 同时从本地 acceptances 文件中移除。
 */
export async function removeAcceptances(
  shopName: string,
  skuIds: string[]
): Promise<StoredVariantAcceptance[]> {
  const idSet = new Set(skuIds.filter(Boolean));
  if (idSet.size === 0) return readAcceptances(shopName);

  const revoked = readLocalRevoked(shopName);
  for (const id of idSet) revoked.add(id);
  writeLocalRevoked(shopName, revoked);

  const local = readLocalAcceptances(shopName).filter(
    (row) => !idSet.has(row.thirdPlatformSkuId)
  );
  writeLocalAcceptances(shopName, local);

  return readAcceptances(shopName);
}

// ===== 兼容旧同步调用方（仅本地文件，不再推荐使用） =====

/** @deprecated 使用异步 readAcceptances；本函数仅读本地文件，不查后端。 */
export function readAcceptancesSync(shopName: string): StoredVariantAcceptance[] {
  return readLocalAcceptances(shopName);
}

/** @deprecated 使用异步 upsertAcceptances；本函数仅写本地文件，不同步后端。 */
export function writeAcceptances(
  shopName: string,
  acceptances: StoredVariantAcceptance[]
): void {
  writeLocalAcceptances(shopName, acceptances);
}
