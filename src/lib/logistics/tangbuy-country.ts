import { isMallGatewayConfigured } from "@/lib/tangbuy-mall-gateway";

const AREA_LIST_PATH = "/gateway/resource/areaListGroup";
const SESSION_KEY = "tangbuy-country-ids:v1";

/** Offline fallback when areaListGroup is unreachable. */
export const VERIFIED_TANGBUY_COUNTRY_IDS: Record<string, string> = {
  US: "3",
  GB: "21",
  FR: "22",
  DE: "23",
  CA: "24999",
};

let countryMapCache: Map<string, string> | null = null;
let countryMapPromise: Promise<Map<string, string>> | null = null;

function gatewayBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TANGBUY_MALL_GATEWAY_BASE_URL ?? "https://tangbuy.cc"
  ).replace(/\/+$/, "");
}

function gatewayToken(): string | null {
  return process.env.NEXT_PUBLIC_TANGBUY_MALL_TOKEN?.trim() || null;
}

function readSessionCache(): Map<string, string> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const map = new Map<string, string>();
    for (const [code, id] of Object.entries(parsed)) {
      if (code.trim() && id.trim()) map.set(code.trim().toUpperCase(), id.trim());
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  }
}

function writeSessionCache(map: Map<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify(Object.fromEntries(map.entries()))
    );
  } catch {
    // ignore quota / private mode
  }
}

function extractCountryCode(row: Record<string, unknown>): string | null {
  const raw = row.code ?? row.countryCode ?? row.isoCode;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().toUpperCase();
}

function extractCountryId(row: Record<string, unknown>): string | null {
  const raw = row.id ?? row.countryId ?? row.areaId;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Parse POST /gateway/resource/areaListGroup { level: 2 }. */
export function parseAreaListGroupResponse(raw: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  const data = raw.data;
  if (!data || typeof data !== "object") return map;

  for (const group of Object.values(data as Record<string, unknown>)) {
    if (!Array.isArray(group)) continue;
    for (const item of group) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const code = extractCountryCode(row);
      const id = extractCountryId(row);
      if (code && id) map.set(code, id);
    }
  }

  return map;
}

async function fetchCountryMapFromGateway(): Promise<Map<string, string>> {
  if (!isMallGatewayConfigured()) {
    return new Map(Object.entries(VERIFIED_TANGBUY_COUNTRY_IDS));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json;charset=UTF-8",
    Origin: "https://dropshipping.tangbuy.cc",
    Referer: "https://dropshipping.tangbuy.cc/",
    currency: "USD",
    device: "pc",
    lang: "cn",
    "tang-request-device": "web",
  };

  const token = gatewayToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${gatewayBaseUrl()}${AREA_LIST_PATH}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ level: 2 }),
  });

  if (!res.ok) {
    return new Map(Object.entries(VERIFIED_TANGBUY_COUNTRY_IDS));
  }

  const raw = (await res.json()) as Record<string, unknown>;
  if (typeof raw.code === "number" && raw.code !== 200) {
    return new Map(Object.entries(VERIFIED_TANGBUY_COUNTRY_IDS));
  }

  const map = parseAreaListGroupResponse(raw);
  if (map.size === 0) {
    return new Map(Object.entries(VERIFIED_TANGBUY_COUNTRY_IDS));
  }

  return map;
}

/** Load ISO2 → Tangbuy countryId map (cached for the session). */
export async function loadTangbuyCountryMap(): Promise<Map<string, string>> {
  if (countryMapCache?.size) return countryMapCache;

  const session = readSessionCache();
  if (session?.size) {
    countryMapCache = session;
    return session;
  }

  if (!countryMapPromise) {
    countryMapPromise = fetchCountryMapFromGateway()
      .then((map) => {
        countryMapCache = map;
        if (map.size) writeSessionCache(map);
        return map;
      })
      .finally(() => {
        countryMapPromise = null;
      });
  }

  return countryMapPromise;
}

function resolveFromEnv(countryCode: string): string | null {
  const envRaw = process.env.TANGBUY_COUNTRY_IDS;
  if (!envRaw) return null;
  try {
    const parsed = JSON.parse(envRaw) as Record<string, string>;
    const fromEnv = parsed[countryCode];
    return fromEnv?.trim() || null;
  } catch {
    return null;
  }
}

/** Resolve Tangbuy internal countryId for estimateSkuSaleFeePrice. */
export async function resolveTangbuyCountryId(
  countryCode: string
): Promise<string | null> {
  const code = countryCode.trim().toUpperCase();
  if (!code) return null;

  const fromEnv = resolveFromEnv(code);
  if (fromEnv) return fromEnv;

  try {
    const map = await loadTangbuyCountryMap();
    const fromApi = map.get(code);
    if (fromApi) return fromApi;
  } catch {
    // fall through to verified fallback
  }

  return VERIFIED_TANGBUY_COUNTRY_IDS[code] ?? null;
}
