/**
 * Draft-order / procurement payment client — aligns with tangbuy-plugin
 * `DraftOrderController` + `PayController` (feature/draft-order-migration-finish).
 *
 * Paths use `/api/plugin/draftorder/*` and `/api/plugin/pay/*` (JWT session).
 */
import { ApiError } from "@/lib/api";

/** Mirrors DraftOrderItemEnum codes on the backend. */
export const DRAFT_STATUS = {
  AWAITING: 1,
  AWAITING_PAYMENT: 2,
  PROCESSING: 3,
  AWAITING_SHIPMENT: 4,
  AWAITING_FULFILLMENT: 5,
  FULFILLED: 6,
  CANCELED: 9,
  REFUNDED: 10,
  INVALID: 11,
} as const;

export type DraftStatusCode = (typeof DRAFT_STATUS)[keyof typeof DRAFT_STATUS];

export interface DraftOrderResolve {
  orderId: number;
  outerOrderId?: string | null;
  shopName?: string | null;
  status: number;
  statusLabel?: string | null;
  payNo?: string | null;
  tradeNo?: string | null;
  payTime?: string | null;
  expireTime?: number | null;
  purchaseAmount?: number | null;
  freshlyDerived?: boolean;
}

export interface DraftOrderLine {
  id: number;
  orderId?: number;
  status?: number;
  goodsName?: string | null;
  goodsId?: string | null;
  skuId?: string | null;
  nums?: number | null;
  price?: number | null;
  purchaseAmount?: number | null;
  outerLineId?: string | null;
}

export interface DraftPackageCreateInfo {
  lineId: number;
  lineName?: string;
  deliveryTime?: string;
  packageComment?: string;
  packageChoosedContent?: {
    currency?: string;
    couponId?: string;
    passwordDiscount?: string;
    incrementList?: string[];
    insure?: number;
    useInsure?: number;
    queryForm?: {
      currencyId?: number;
      declareMode?: number;
      registrationType?: number;
      tax?: number;
      taxNo?: string;
      currency?: string;
    };
  };
}

export interface DraftPurchaseRequest {
  shopName: string;
  outerOrderId: string;
  /** When known from resolve(); otherwise backend derives from shop+outer. */
  orderId?: number;
  orderType?: number;
  packageCreateInfo?: DraftPackageCreateInfo;
}

export interface DraftPurchaseResult {
  tradeNo?: string | null;
  expireTime?: string | null;
  type?: string | null;
}

export interface PayChannelRow {
  channel?: string;
  payCode?: string;
  code?: string;
  name?: string;
  [key: string]: unknown;
}

type RBody<T> = {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
};

async function pluginFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();
  const res = await fetch(path, {
    ...init,
    credentials: init?.credentials ?? auth.credentials,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...auth.headers,
      ...(init?.headers as Record<string, string> | undefined),
    },
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

function unwrapR<T>(body: RBody<T> | T, path: string): T {
  if (body && typeof body === "object" && "data" in (body as object)) {
    const r = body as RBody<T>;
    const code = r.code;
    if (code != null && code !== 200 && code !== 0) {
      throw new ApiError(r.msg || r.message || `API error (${code}): ${path}`, 400, body);
    }
    return r.data as T;
  }
  return body as T;
}

/** GET /api/plugin/draftorder/resolve */
export async function resolveDraftOrder(
  shopName: string,
  outerOrderId: string,
  deriveIfMissing = true
): Promise<DraftOrderResolve> {
  const q = new URLSearchParams({
    shopName,
    outerOrderId,
    deriveIfMissing: String(deriveIfMissing),
  });
  const body = await pluginFetch<RBody<DraftOrderResolve>>(
    `/api/plugin/draftorder/resolve?${q}`
  );
  return unwrapR(body, "resolve");
}

/** GET /api/plugin/draftorder/{orderId} */
export async function getDraftOrder(
  shopName: string,
  orderId: number
): Promise<DraftOrderResolve> {
  const q = new URLSearchParams({ shopName });
  const body = await pluginFetch<RBody<DraftOrderResolve>>(
    `/api/plugin/draftorder/${orderId}?${q}`
  );
  return unwrapR(body, "getDraftOrder");
}

/** GET /api/plugin/draftorder/{orderId}/lines */
export async function listDraftLines(
  shopName: string,
  orderId: number
): Promise<DraftOrderLine[]> {
  const q = new URLSearchParams({ shopName });
  const body = await pluginFetch<RBody<DraftOrderLine[]>>(
    `/api/plugin/draftorder/${orderId}/lines?${q}`
  );
  return unwrapR(body, "listDraftLines") ?? [];
}

/**
 * POST /api/plugin/draftorder/purchaseOrder
 * Prefer resolve() first so orderId is known; also pass shopName+outerOrderId as fallback.
 */
export async function purchaseDraftOrder(
  body: DraftPurchaseRequest
): Promise<DraftPurchaseResult> {
  const q = new URLSearchParams({
    shopName: body.shopName,
    outerOrderId: body.outerOrderId,
  });
  const payload: Record<string, unknown> = {
    orderId: body.orderId,
    orderType: body.orderType ?? 1,
  };
  if (body.packageCreateInfo) {
    payload.packageCreateInfo = body.packageCreateInfo;
  }
  const res = await pluginFetch<RBody<DraftPurchaseResult>>(
    `/api/plugin/draftorder/purchaseOrder?${q}`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return unwrapR(res, "purchaseOrder");
}

/** POST /api/plugin/draftorder/refund */
export async function refundDraftOrder(input: {
  shopName: string;
  orderId: number;
  orderLineIds: number[];
  reason?: string;
  reasonId?: number;
}): Promise<string> {
  const q = new URLSearchParams({
    shopName: input.shopName,
    orderId: String(input.orderId),
  });
  for (const id of input.orderLineIds) {
    q.append("orderLineIds", String(id));
  }
  if (input.reason) q.set("reason", input.reason);
  if (input.reasonId != null) q.set("reasonId", String(input.reasonId));
  const res = await pluginFetch<string>(`/api/plugin/draftorder/refund?${q}`, {
    method: "POST",
  });
  return typeof res === "string" ? res : String(res);
}

/** GET /api/plugin/pay/channelList — Tangbuy pay channels for procurement. */
export async function listPayChannels(input: {
  orderNo?: string;
  country?: string;
  excludeBalance?: boolean;
}): Promise<PayChannelRow[]> {
  const q = new URLSearchParams();
  if (input.orderNo) q.set("orderNo", input.orderNo);
  if (input.country) q.set("country", input.country);
  if (input.excludeBalance != null) {
    q.set("excludeBalance", String(input.excludeBalance));
  }
  const body = await pluginFetch<{
    code?: number;
    data?: unknown;
    msg?: string;
  }>(`/api/plugin/pay/channelList?${q}`);

  const data = body?.data;
  if (Array.isArray(data)) return data as PayChannelRow[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.paymentList)) return obj.paymentList as PayChannelRow[];
    if (Array.isArray(obj.data)) return obj.data as PayChannelRow[];
  }
  return [];
}

/** Normalize channel row → payCode used by payment/order. */
export function payCodeOf(row: PayChannelRow): string {
  const raw =
    row.payCode ??
    row.channel ??
    row.code ??
    row.name ??
    "";
  return String(raw).trim().toLowerCase();
}

/** POST /api/plugin/pay/payment/order — start Tangbuy checkout for tradeNo. */
export async function submitPayOrder(data: string): Promise<unknown> {
  const body = await pluginFetch<RBody<unknown>>("/api/plugin/pay/payment/order", {
    method: "POST",
    body: data,
  });
  return unwrapR(body, "payment/order");
}

/** Map draft status → order-center tab status. */
export function mapDraftStatusToOrderStatus(
  status: number | null | undefined
):
  | "pendingOrder"
  | "pendingPayment"
  | "preparing"
  | "pendingShipment"
  | "inTransit"
  | "delivered"
  | "canceled"
  | null {
  if (status == null) return null;
  switch (status) {
    case DRAFT_STATUS.AWAITING:
      return "pendingOrder";
    case DRAFT_STATUS.AWAITING_PAYMENT:
      return "pendingPayment";
    case DRAFT_STATUS.PROCESSING:
      return "preparing";
    case DRAFT_STATUS.AWAITING_SHIPMENT:
      return "pendingShipment";
    case DRAFT_STATUS.AWAITING_FULFILLMENT:
      return "inTransit";
    case DRAFT_STATUS.FULFILLED:
      return "delivered";
    case DRAFT_STATUS.CANCELED:
    case DRAFT_STATUS.INVALID:
      return "canceled";
    case DRAFT_STATUS.REFUNDED:
      return "canceled";
    default:
      return null;
  }
}
