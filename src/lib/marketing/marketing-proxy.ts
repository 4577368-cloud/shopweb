import type { DossierRaw, DossierRequestItem, MarketingResponse } from "./types";

export class MarketingApiError extends Error {
  readonly status: number;
  readonly code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = "MarketingApiError";
    this.status = status;
    this.code = code;
  }
}

interface PluginEnvelope {
  ok?: boolean;
  source?: string;
  data?: unknown;
  consumedCredits?: number;
  remainingCredits?: number;
  code?: number;
  message?: string;
}

async function parseEnvelope(res: Response): Promise<PluginEnvelope> {
  try {
    return (await res.json()) as PluginEnvelope;
  } catch {
    return { ok: false, message: "Invalid JSON from marketing API" };
  }
}

function wrapCredits<T>(body: PluginEnvelope, data: T): MarketingResponse<T> {
  return {
    data,
    source: "pipispy",
    consumedCredits: body.consumedCredits ?? 0,
    remainingCredits: body.remainingCredits ?? 0,
  };
}

/** POST /api/plugin/marketing/data — JWT cookie required. */
export async function marketingPost(
  uri: string,
  params: Record<string, unknown>
): Promise<MarketingResponse<unknown>> {
  const res = await fetch("/api/plugin/marketing/data", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ uri, params }),
  });
  const body = await parseEnvelope(res);
  if (!res.ok || body.ok === false) {
    throw new MarketingApiError(
      body.message ?? `Marketing API failed (${res.status})`,
      res.status,
      body.code
    );
  }
  return wrapCredits(body, body.data);
}

/** GET /api/plugin/marketing/credits-balance */
export async function marketingCreditsBalance(): Promise<MarketingResponse<unknown>> {
  const res = await fetch("/api/plugin/marketing/credits-balance", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const body = await parseEnvelope(res);
  if (!res.ok || body.ok === false) {
    throw new MarketingApiError(
      body.message ?? `Credits balance failed (${res.status})`,
      res.status,
      body.code
    );
  }
  return wrapCredits(body, body.data);
}

/** GET /api/plugin/marketing/reference/enums — 免费参考数据字典（类目/地区/店型/平台/语种）。 */
export async function marketingReference(): Promise<MarketingResponse<unknown>> {
  const res = await fetch("/api/plugin/marketing/reference/enums", {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  const body = await parseEnvelope(res);
  if (!res.ok || body.ok === false) {
    throw new MarketingApiError(
      body.message ?? `Reference enums failed (${res.status})`,
      res.status,
      body.code
    );
  }
  return wrapCredits(body, body.data);
}

/**
 * POST /api/plugin/marketing/dossier — 通用扇出端点。
 * 与 /data 不同：本端点**无 PluginEnvelope 包装**，直接返回 DossierResponse
 * `{ results: Record<tag, MarketingDataResponse>, totalConsumedCredits }`。
 * 调用方负责对每个 tag 的 `.data` 做映射。
 */
export async function marketingDossier(
  requests: DossierRequestItem[]
): Promise<DossierRaw> {
  let res: Response;
  try {
    res = await fetch("/api/plugin/marketing/dossier", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ requests }),
    });
  } catch (err) {
    throw new MarketingApiError(
      `Dossier request failed: ${err instanceof Error ? err.message : String(err)}`,
      0
    );
  }
  if (!res.ok) {
    throw new MarketingApiError(`Dossier failed (${res.status})`, res.status);
  }
  try {
    return (await res.json()) as DossierRaw;
  } catch {
    throw new MarketingApiError("Invalid JSON from dossier API", res.status);
  }
}
