/**
 * Tangbuy pay BFF — channelList + payment/order via plugin `/api/plugin/pay/*`.
 * Settles procurement tradeNo; separate from SaaS `/billing/*` credits.
 */
import { ApiError } from "@/lib/api";

export interface TangPayChannel {
  channel: string;
  name?: string;
  [key: string]: unknown;
}

async function payRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...auth.headers,
  };
  const res = await fetch(path, {
    ...init,
    credentials: init?.credentials ?? auth.credentials,
    headers,
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    data = text;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status}): ${path}`;
    if (data && typeof data === "object" && data !== null) {
      const m =
        (data as { message?: unknown; msg?: unknown }).message ??
        (data as { msg?: unknown }).msg;
      if (typeof m === "string" && m.trim()) message = m;
    }
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

function unwrapAjaxData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if ("data" in o) return o.data;
  return raw;
}

/** GET /api/plugin/pay/channelList?orderNo={tradeNo} */
export async function fetchTangPayChannels(opts: {
  tradeNo: string;
  country?: string | null;
  excludeBalance?: boolean;
}): Promise<TangPayChannel[]> {
  const q = new URLSearchParams();
  q.set("orderNo", opts.tradeNo);
  if (opts.country?.trim()) q.set("country", opts.country.trim());
  if (opts.excludeBalance) q.set("excludeBalance", "true");
  const raw = await payRequest<unknown>(
    `/api/plugin/pay/channelList?${q.toString()}`
  );
  const data = unwrapAjaxData(raw);
  if (!Array.isArray(data)) return [];
  return data
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .map((row) => ({
      ...row,
      channel: String(row.channel ?? row.code ?? row.id ?? "").trim(),
      name: row.name != null ? String(row.name) : undefined,
    }))
    .filter((c) => c.channel.length > 0);
}

/**
 * POST /api/plugin/pay/payment/order
 * Body is opaque JSON string forwarded to tang-pay (reference PayController).
 */
export async function submitTangPaymentOrder(payload: {
  tradeNo: string;
  channel: string;
  amount?: number | string | null;
  [key: string]: unknown;
}): Promise<unknown> {
  const body = JSON.stringify(payload);
  return payRequest<unknown>("/api/plugin/pay/payment/order", {
    method: "POST",
    body,
  });
}
