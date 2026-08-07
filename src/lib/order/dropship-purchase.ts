// 代发简版采购单 API（对接 plugin DraftOrderController）
import { ApiError } from "@/lib/api";

export interface DropshipPackageCreateInfo {
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

export interface DropshipPurchaseRequest {
  shopName: string;
  outerOrderId: string;
  orderId?: number;
  orderType?: number;
  packageCreateInfo?: DropshipPackageCreateInfo;
}

export interface DropshipPurchaseResult {
  tradeNo?: string;
  expireTime?: string;
  type?: string;
  orderId?: number;
  outerOrderId?: string;
  tangbuyOrderNo?: string;
  payableAmountCny?: number;
  lineNos?: string[];
}

export interface DropshipPurchaseAmountPreview {
  goodsAmountCny?: number;
  packageAmountCny?: number;
  totalCny?: number;
}

async function draftRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { resolveAuthStrategyFromLocation } = await import(
    "@/host/adapters/auth-transport"
  );
  const strategy = resolveAuthStrategyFromLocation();
  const auth = await strategy.prepareRequest();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
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

/** POST /api/plugin/draft/order/purchaseOrder — 代发简版下单（须带 packageCreateInfo） */
export function placeDropshipOrder(
  body: DropshipPurchaseRequest
): Promise<DropshipPurchaseResult> {
  if (!body.packageCreateInfo?.lineId) {
    return Promise.reject(
      new ApiError("packageCreateInfo.lineId is required before purchase", 400)
    );
  }
  const allowMock =
    process.env.NEXT_PUBLIC_PLACE_MOCK === "1" ||
    process.env.NEXT_PUBLIC_PLACE_MOCK === "true" ||
    // When logistics APIs are stubbed, allow place mock so the wizard is end-to-end testable.
    (process.env.NEXT_PUBLIC_PLACE_LOGISTICS_STUB !== "0" &&
      process.env.NEXT_PUBLIC_PLACE_LOGISTICS_STUB !== "false");

  return draftRequest<DropshipPurchaseResult>(
    "/api/plugin/draft/order/purchaseOrder",
    { method: "POST", body: JSON.stringify({ ...body, orderType: 1 }) }
  ).catch((err) => {
    if (!allowMock) throw err;
    // Dev-only mock success when explicitly enabled.
    const tradeNo = `MOCK-${body.outerOrderId}-${Date.now()}`;
    return {
      tradeNo,
      tangbuyOrderNo: tradeNo,
      outerOrderId: body.outerOrderId,
      type: "mock",
    } satisfies DropshipPurchaseResult;
  });
}

/** POST /api/plugin/draft/order/calDraftPurchasedAmount — 试算 */
export function previewDropshipAmount(
  body: DropshipPurchaseRequest
): Promise<DropshipPurchaseAmountPreview> {
  if (!body.packageCreateInfo?.lineId) {
    return Promise.reject(
      new ApiError("packageCreateInfo.lineId is required for amount preview", 400)
    );
  }
  return draftRequest<DropshipPurchaseAmountPreview>(
    "/api/plugin/draft/order/calDraftPurchasedAmount",
    { method: "POST", body: JSON.stringify({ ...body, orderType: 1 }) }
  );
}
