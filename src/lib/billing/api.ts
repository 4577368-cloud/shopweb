/**
 * Billing API client for `/api/plugin/billing/**`.
 *
 * 同 auth/api.ts，使用同源路径（Next.js rewrite 代理到 tangbuy-plugin），
 * 自动携带 httpOnly cookie。后端 JwtAuthFilter 已保护此前缀，未登录返回 401。
 */

import { ApiError } from "@/lib/api";

const BILLING_BASE = "/api/plugin/billing";

async function billingRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith("/") ? path : `${BILLING_BASE}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new ApiError(`Network request failed: ${url}`, 0, cause);
  }

  const text = await res.text();
  const data = text ? safeJsonParse(text) : undefined;

  if (!res.ok) {
    let message = `Request failed (${res.status}): ${url}`;
    let code: string | undefined;
    if (data && typeof data === "object" && data !== null) {
      const m = (data as { message?: unknown }).message;
      const c = (data as { code?: unknown }).code;
      if (typeof m === "string" && m.trim()) message = m;
      if (typeof c === "string" && c.trim()) code = c;
    }
    const err = new ApiError(message, res.status, data) as ApiError & {
      code?: string;
    };
    err.code = code;
    throw err;
  }

  if (res.status === 204 || !data) return null as T;
  return data as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ===== Types =====

export interface AccountOverview {
  userId: number;
  /** 当前余额（分 CNY）。前端展示时 / 100 得到元。 */
  balanceCny: number;
  totalRecharged: number;
  totalConsumed: number;
  totalRefunded: number;
}

export interface TransactionItem {
  id: number;
  type: "recharge" | "consume" | "refund" | "adjust";
  /** 变动金额（分 CNY）。正数=入账，负数=出账。 */
  amountCny: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  remark: string | null;
  createdAt: string; // ISO timestamp
}

export interface TransactionListResponse {
  items: TransactionItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConsumeBalancePayload {
  /** Shopify 订单号（必填，用于审计关联） */
  shopifyOrderId: string;
  /** 扣款金额（分 CNY），必须 > 0 */
  amountCny: number;
  /** 原始 USD 金额（分，仅用于备注）。例如 100.00 USD → 10000 */
  amountUsd?: number;
  remark?: string;
}

export interface ConsumeResult {
  success: boolean;
  /** 扣减后余额（分 CNY）。失败时为当前余额。 */
  balanceAfter: number;
  transactionId: string | null;
  errorCode: "INSUFFICIENT_BALANCE" | "INVALID_AMOUNT" | "SHOPIFY_ORDER_REQUIRED" | null;
}

export interface RechargePayload {
  /** 充值金额（分 CNY），必须 > 0 */
  amountCny: number;
  remark?: string;
}

// ===== PayPal (P3.2) =====

export type PayPalPurpose = "order_payment" | "balance_recharge";

export interface CreatePayPalOrderPayload {
  purpose: PayPalPurpose;
  /** order_payment 时必填：shopify_order_id；balance_recharge 时不传 */
  refId?: string;
  /** USD 金额（分）。例如 100.00 USD → 10000 */
  amountUsdCents: number;
  description?: string;
}

export interface CreatePayPalOrderResponse {
  paypalOrderId: string;
  purpose: PayPalPurpose;
  amountUsdCents: number;
  /** balance_recharge 时返回预估入账 CNY（分）；order_payment 时为 null */
  amountCnyCents: number | null;
  status: string;
}

export interface CapturePayPalOrderResponse {
  success: boolean;
  status: string;
  purpose: PayPalPurpose;
  refId: string | null;
  /** balance_recharge 时返回新余额（分 CNY）；order_payment 时为 null */
  balanceAfter: number | null;
  errorCode: string | null;
}

// ===== Payment Orders (P3.5) =====

export type PaymentOrderStatus =
  | "created"
  | "approved"
  | "capturing"
  | "captured"
  | "failed"
  | (string & {});

export interface PaymentOrderItem {
  id: number;
  paypalOrderId: string;
  purpose: PayPalPurpose;
  /** order_payment 时为 shopify_order_id；balance_recharge 时为 null */
  refId: string | null;
  amountUsdCents: number;
  /** balance_recharge 时为入账 CNY（分）；order_payment 时可能为 null */
  amountCnyCents: number | null;
  status: PaymentOrderStatus;
  paypalCaptureId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  capturedAt: string | null;
}

export interface PaymentOrderListResponse {
  items: PaymentOrderItem[];
  total: number;
  limit: number;
  offset: number;
}

// ===== Credits (P4) =====

export interface CreditBalanceResponse {
  userId: number;
  balanceCredits: number;
}

export interface CreditOverview {
  userId: number;
  balanceCredits: number;
  totalGranted: number;
  totalConsumed: number;
  totalExpired: number;
}

export interface CreditTransactionItem {
  id: number;
  type: "grant" | "consume" | "expire" | "adjust";
  /** 变动积分。正数=入账，负数=出账。 */
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  endpoint: string | null;
  remark: string | null;
  createdAt: string;
}

export interface CreditTransactionListResponse {
  items: CreditTransactionItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreditLotItem {
  id: number;
  sourceType: "subscription" | "credit_pack" | "promo" | "manual";
  sourceId: number | null;
  amountGranted: number;
  amountConsumed: number;
  amountExpired: number;
  remaining: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreditLotListResponse {
  items: CreditLotItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface ConsumeCreditsPayload {
  /** 调用的接口名（如 ad-products/search）。 */
  endpoint: string;
  /** 消耗积分数（必须 > 0）。 */
  amount: number;
  /** 关联业务类型（默认 marketing_api）。 */
  refType?: string;
  refId?: string;
  remark?: string;
}

export interface ConsumeCreditsResult {
  success: boolean;
  balanceAfter: number;
  transactionId: number | null;
  errorCode: "INSUFFICIENT_CREDITS" | "INVALID_AMOUNT" | "ENDPOINT_REQUIRED" | null;
}

export interface GrantCreditsPayload {
  amount: number;
  sourceType?: "subscription" | "credit_pack" | "promo" | "manual";
  sourceId?: number;
  /** ISO-8601 字符串（如 2026-12-31T23:59:59Z），不传 = 永不过期。 */
  expiresAtStr?: string;
  remark?: string;
}

export interface GrantCreditsResult {
  success: boolean;
  balanceAfter: number;
  lotId: number;
  transactionId: number;
}

// ===== API =====

export const billingApi = {
  /** GET /overview — 账户概览（懒创建账户）。 */
  overview: () => billingRequest<AccountOverview>(`${BILLING_BASE}/overview`),

  /** GET /account/transactions — 余额流水（分页）。 */
  listTransactions: (params: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return billingRequest<TransactionListResponse>(
      `${BILLING_BASE}/account/transactions${suffix}`
    );
  },

  /** POST /consume/balance — 余额支付订单。 */
  consumeBalance: (payload: ConsumeBalancePayload) =>
    billingRequest<ConsumeResult>(`${BILLING_BASE}/consume/balance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /recharge — 人工充值（仅 P3.1 测试用）。 */
  recharge: (payload: RechargePayload) =>
    billingRequest<AccountOverview>(`${BILLING_BASE}/recharge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /paypal/create-order — 创建 PayPal 订单（用于 PayPal JS SDK）。 */
  createPayPalOrder: (payload: CreatePayPalOrderPayload) =>
    billingRequest<CreatePayPalOrderResponse>(`${BILLING_BASE}/paypal/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /paypal/{paypalOrderId}/capture — 捕获 PayPal 订单（onApprove 回调中调用）。 */
  capturePayPalOrder: (paypalOrderId: string) =>
    billingRequest<CapturePayPalOrderResponse>(
      `${BILLING_BASE}/paypal/${encodeURIComponent(paypalOrderId)}/capture`,
      { method: "POST" }
    ),

  // ===== Payment Orders (P3.5) =====

  /** GET /orders — 当前用户的支付订单列表（分页 + status 过滤）。 */
  listPaymentOrders: (params: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return billingRequest<PaymentOrderListResponse>(
      `${BILLING_BASE}/orders${suffix}`
    );
  },

  /** GET /orders/{id} — 支付订单详情。 */
  getPaymentOrder: (id: number) =>
    billingRequest<PaymentOrderItem>(
      `${BILLING_BASE}/orders/${encodeURIComponent(id)}`
    ),

  // ===== Credits (P4) =====

  /** GET /credits/balance — 积分余额（运营中心调，替代 mock）。 */
  creditsBalance: () =>
    billingRequest<CreditBalanceResponse>(`${BILLING_BASE}/credits/balance`),

  /** GET /credits/overview — 积分账户概览（含累计统计）。 */
  creditsOverview: () =>
    billingRequest<CreditOverview>(`${BILLING_BASE}/credits/overview`),

  /** GET /credits/transactions — 积分流水（分页 + 类型筛选）。 */
  listCreditTransactions: (params: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return billingRequest<CreditTransactionListResponse>(
      `${BILLING_BASE}/credits/transactions${suffix}`
    );
  },

  /** GET /credits/lots — 积分批次列表（含过期）。 */
  listCreditLots: (params: { limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return billingRequest<CreditLotListResponse>(
      `${BILLING_BASE}/credits/lots${suffix}`
    );
  },

  /** POST /consume/credits — 积分消耗（运营中心调用）。 */
  consumeCredits: (payload: ConsumeCreditsPayload) =>
    billingRequest<ConsumeCreditsResult>(`${BILLING_BASE}/consume/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  /** POST /credits/grant — 发放积分（P4 测试用，P5 接入支付后由订阅流程替代）。 */
  grantCredits: (payload: GrantCreditsPayload) =>
    billingRequest<GrantCreditsResult>(`${BILLING_BASE}/credits/grant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
};

// ===== 金额格式化工具（前端展示） =====

/** 分 CNY → 元字符串，保留 2 位小数：1234 → "12.34" */
export function centsToYuan(cents: number): string {
  if (!Number.isFinite(cents)) return "0.00";
  return (cents / 100).toFixed(2);
}

/** 元字符串/数值 → 分 CNY：12.34 → 1234；"¥12.34" → 1234 */
export function yuanToCents(yuan: number | string): number {
  if (typeof yuan === "string") {
    const cleaned = yuan.replace(/[^\d.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  return Number.isFinite(yuan) ? Math.round(yuan * 100) : 0;
}
