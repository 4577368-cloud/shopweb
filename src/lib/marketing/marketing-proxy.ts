import type { MarketingResponse } from "./types";

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
