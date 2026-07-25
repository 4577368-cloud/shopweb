/** Shared helpers to normalize pipispy JSON (snake_case) into plain records. */

export type PipispyRecord = Record<string, unknown>;

export function asRecord(v: unknown): PipispyRecord | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as PipispyRecord;
  return null;
}

export function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

export function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = num(v, NaN);
  return Number.isNaN(n) ? null : n;
}

export function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  return fallback;
}

export function bool(v: unknown, fallback = false): boolean {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1" || v === "true") return true;
  if (v === 0 || v === "0" || v === "false") return false;
  return fallback;
}

export function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean);
}

/** Pull list rows from pipispy `data` node (various envelope shapes). */
export function extractRecords(payload: unknown): PipispyRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((x) => x && typeof x === "object") as PipispyRecord[];
  }
  const root = asRecord(payload);
  if (!root) return [];

  const data = root.data;
  if (Array.isArray(data)) return data as PipispyRecord[];
  const dataObj = asRecord(data);
  if (dataObj) {
    for (const k of ["list", "data", "records", "items", "rows", "result"]) {
      const arr = dataObj[k];
      if (Array.isArray(arr)) return arr as PipispyRecord[];
    }
    for (const v of Object.values(dataObj)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return v as PipispyRecord[];
    }
  }

  for (const k of ["list", "records", "items"]) {
    const arr = root[k];
    if (Array.isArray(arr)) return arr as PipispyRecord[];
  }
  return [];
}

export function extractPageNode(payload: unknown): PipispyRecord | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = asRecord(root.data);
  const page = asRecord(root.page) ?? asRecord(data?.page);
  return page;
}
