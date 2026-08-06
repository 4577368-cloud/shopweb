// 订单中心 · 内部状态 mock store（A+ 批"跑通流程"用）
// ----------------------------------------------------------------------------
// 业务语义：后端目前只把 Shopify 顾客已付款订单头同步过来（→ pendingOrder）。
// 我们向货源下单 / 向货源付款 这两步的内部状态还没有后端接口，先在 localStorage
// 跑通；后端 B 轨就绪后，把这两个 setter 替换成真实 API 调用即可。
//
// 隔离原则：
// - 不动 ShopOrderHeader / OrderSummary 的 shape，只在外部用 WeakMap 思路
//   （这里是 plain object）记录"内部态"增量。
// - SSR 友好：所有读取/写入用 try/catch + typeof window 保护。
// ----------------------------------------------------------------------------

import type { OrderStatus, OrderSummary, PaymentStatus } from "./types";
import { mapDraftStatusToOrderStatus } from "./draftorder-api";

const INTERNAL_KEY = "tangbuy.order.internal.v1";
const BALANCE_KEY = "tangbuy.order.balance.cny.v1";

/** 测试用默认余额（CNY）。用户 2026-07-24 拍板："默认给当前默认充值 10000" */
export const DEFAULT_BALANCE_CNY = 10000;

/** 我们向货源付款的渠道（与设计稿保持解耦，可独立枚举） */
export type PaymentChannel = "paypal" | "ulimit" | "balance" | string;

/** 订单内部状态增量（按订单 id 持有；不污染 OrderSummary shape） */
export interface OrderInternal {
  /** 我们系统的内部单号（mock：点「下单」时生成） */
  tangbuyOrderNo?: string;
  /** 货源单号（mock：点「下单」时生成） */
  supplierOrderNo?: string;
  /** 内部状态：是否已下过单（区分 pendingOrder vs pendingPayment） */
  placedAt?: string;
  /** 是否已向货源付款（区分 pendingPayment vs preparing） */
  paidAt?: string;
  paymentChannel?: PaymentChannel;
  /** 应付金额（USD，mock：点「下单」时快照，下游不变） */
  amountUsd?: number;
  /** 手续费（USD，弹窗按通道计算） */
  feeUsd?: number;
  /** 内部支付状态（与 OrderSummary.paymentStatus 同步） */
  paymentStatus?: PaymentStatus;
  /** Plugin draft order id */
  draftOrderId?: number;
  /** Tangbuy pay tradeNo */
  tradeNo?: string;
  /** DraftOrderItemEnum code */
  draftStatus?: number;
  /** Pay expire epoch ms */
  expireTimeMs?: number | null;
}

type InternalMap = Record<string, OrderInternal>;

// ---- 内部状态（per-order） ----

function safeRead(): InternalMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INTERNAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as InternalMap) : {};
  } catch {
    return {};
  }
}

function safeWrite(map: InternalMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTERNAL_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode — 静默退化，不影响 UI */
  }
}

export function getOrderInternal(orderId: string): OrderInternal {
  if (!orderId) return {};
  return safeRead()[orderId] ?? {};
}

export function setOrderInternal(orderId: string, patch: Partial<OrderInternal>): OrderInternal {
  if (!orderId) return {};
  const map = safeRead();
  const merged: OrderInternal = { ...(map[orderId] ?? {}), ...patch };
  map[orderId] = merged;
  safeWrite(map);
  return merged;
}

/** 把内部状态合并进 OrderSummary 视图（不修改原对象，返回新对象） */
export function hydrateOrders(orders: OrderSummary[]): OrderSummary[] {
  const map = safeRead();
  return orders.map((o) => {
    const intl = map[o.id];
    if (!intl) return o;
    const fromDraft = mapDraftStatusToOrderStatus(
      intl.draftStatus ?? o.draftStatus
    ) as OrderStatus | null;
    // Prefer draft machine when we have placed/paid internals; else keep Shopify/procurement.
    let status = o.status;
    if (intl.paidAt || (intl.draftStatus != null && intl.draftStatus >= 3)) {
      status = fromDraft ?? "preparing";
    } else if (intl.placedAt || intl.tradeNo || intl.draftOrderId) {
      status = fromDraft ?? "pendingPayment";
    }
    return {
      ...o,
      tangbuyOrderNo: intl.tangbuyOrderNo ?? o.tangbuyOrderNo,
      supplierOrderNo: intl.supplierOrderNo ?? o.supplierOrderNo,
      draftOrderId: intl.draftOrderId ?? o.draftOrderId,
      tradeNo: intl.tradeNo ?? o.tradeNo,
      draftStatus: intl.draftStatus ?? o.draftStatus,
      status,
      // 内部态优先级最高
      paymentStatus: intl.paymentStatus ?? o.paymentStatus,
      // 仅当原值缺失时才用「明天」兜底，避免覆盖后端真实预计发货时间。
      expectedShipAt: o.expectedShipAt ?? (intl.paidAt ? todayPlus(1) : undefined),
      payableAmount:
        o.payableAmount ??
        (intl.amountUsd != null ? `USD ${intl.amountUsd.toFixed(2)}` : undefined),
    };
  });
}

// ---- 余额（CNY，全局） ----

function safeReadBalance(): number {
  if (typeof window === "undefined") return DEFAULT_BALANCE_CNY;
  try {
    const raw = window.localStorage.getItem(BALANCE_KEY);
    if (raw == null) {
      // 首次访问：写入默认 10000 CNY
      window.localStorage.setItem(BALANCE_KEY, String(DEFAULT_BALANCE_CNY));
      return DEFAULT_BALANCE_CNY;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : DEFAULT_BALANCE_CNY;
  } catch {
    return DEFAULT_BALANCE_CNY;
  }
}

function safeWriteBalance(cny: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BALANCE_KEY, String(cny));
  } catch {
    /* 静默退化 */
  }
}

export function getBalanceCny(): number {
  return safeReadBalance();
}

export function setBalanceCny(cny: number): number {
  const v = Math.max(0, Number(cny) || 0);
  safeWriteBalance(v);
  return v;
}

/** 在余额里扣 CNY（不够则返回 false；调用方决定如何提示） */
export function tryDeductBalanceCny(cny: number): { ok: true; balance: number } | { ok: false; balance: number } {
  const cur = getBalanceCny();
  if (cur < cny) return { ok: false, balance: cur };
  const next = setBalanceCny(cur - cny);
  return { ok: true, balance: next };
}

// ---- 副作用（mock） ----

/** 生成"我方"内部单号（mock：TB-XXXX-XXXX） */
export function generateTangbuyOrderNo(orderId: string): string {
  const seed = String(orderId ?? "0");
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = (Math.abs(h) % 9000) + 1000;
  const b = (Math.abs(h * 7) % 9000) + 1000;
  return `TB-${a}-${b}`;
}

/** 生成"货源"单号（mock：SUP-XXXX） */
export function generateSupplierOrderNo(orderId: string): string {
  const seed = String(orderId ?? "0");
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) | 0;
  return `SUP-${(Math.abs(h) % 90000) + 10000}`;
}

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
