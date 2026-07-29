// 订单中心 · 支付通道配置 + 金额工具（A+ 批"跑通流程"用）
// ----------------------------------------------------------------------------
// 支付通道是"我方"向货源付款的渠道（与 Shopify 顾客付款无关，对应订单中心
// pendingPayment 状态）。三个通道：PayPal / Ulimit（Visa·Master）/ 余额。
// 余额默认 10000 CNY（见 mock-store.DEFAULT_BALANCE_CNY）。
// ----------------------------------------------------------------------------

import type { OrderSummary } from "./types";
import type { PaymentChannel } from "./mock-store";

/** 汇率：1 USD ≈ 6.43 CNY（贴近截图 5640.3/877.38 ≈ 6.4286） */
export const CNY_PER_USD = 6.43;

/** 通道固定手续费（USD；余额为 0） */
export const CHANNEL_FEE_USD: Record<PaymentChannel, number> = {
  paypal: 1.11,
  ulimit: 0.92,
  balance: 0,
};

export interface PaymentChannelDef {
  id: PaymentChannel;
  /** i18n 名称键（order.payment.channel.<id>） */
  nameKey: string;
  /** i18n 备注键（手续费说明 / 余额提示） */
  noteKey: string;
  /** 通道主色 hex（弹窗 logo 背景） */
  accent: string;
  /** 通道 logo 文本（占位品牌） */
  logoText: string;
}

export const PAYMENT_CHANNELS: PaymentChannelDef[] = [
  {
    id: "paypal",
    nameKey: "order.payment.channel.paypal",
    noteKey: "order.payment.settlementNote",
    accent: "#003087",
    logoText: "PayPal",
  },
  {
    id: "ulimit",
    nameKey: "order.payment.channel.ulimit",
    noteKey: "order.payment.channel.ulimitNote",
    accent: "#16A34A",
    logoText: "U",
  },
  {
    id: "balance",
    nameKey: "order.payment.channel.balance",
    noteKey: "order.payment.channel.balanceNote",
    accent: "#F59E0B",
    logoText: "¥",
  },
];

// ---- 金额工具 ----

/** 任意串（"¥86.00" / "USD 60.00" / "60.00"）→ 数值；不可解析返回 null */
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** 从 OrderSummary 提应付金额（USD）。优先级：productCost → 兜底用 deterministic mock */
export function deriveAmountUsd(order: OrderSummary): number {
  if (!order) return 0;
  // 1) productCost 是"主金额"（¥xx / USD xx / 空）
  const pc = parseMoney(order.productCost);
  if (pc != null && pc > 0) {
    // 含货币符号 ¥ 视为 CNY，转换为 USD
    if (order.productCost?.includes("¥")) {
      return Math.round((pc / CNY_PER_USD) * 100) / 100;
    }
    return pc; // USD 或无符号
  }
  // 2) 兜底：基于 orderId 的确定性 mock（范围 50–250 USD）
  const seed = String(order.id ?? "0");
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.round((50 + (Math.abs(h) % 200)) * 100) / 100;
}

/** 通道手续费（USD） */
export function feeForChannel(channel: PaymentChannel): number {
  return CHANNEL_FEE_USD[channel] ?? 0;
}

/** USD → CNY 展示用 */
export function usdToCny(usd: number): number {
  return Math.round(usd * CNY_PER_USD * 100) / 100;
}

/** 校验余额是否足够扣（CNY） */
export function hasEnoughBalance(
  balanceCny: number,
  totalUsd: number
): boolean {
  const needCny = usdToCny(totalUsd);
  return balanceCny >= needCny;
}

/** 扣减余额需要多少 CNY */
export function cnyNeededFor(totalUsd: number): number {
  return usdToCny(totalUsd);
}
