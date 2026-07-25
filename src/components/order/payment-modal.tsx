"use client";

// 订单中心 · 支付弹窗
// ----------------------------------------------------------------------------
// 三通道：PayPal / Ulimit(Visa·Master) / 余额。
// - 余额通道：调用真实后端 /api/plugin/billing/consume/balance 扣减 CNY（P3.1）
// - PayPal / Ulimit：mock 流程（P3.2 接入支付网关）
//
// 单位约定：前端展示用「元」（与 mock-store 一致），后端 API 用「分」（LONG）。
// 本组件在调用 API 时做元→分转换，返回结果分→元。
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X, Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PAYMENT_CHANNELS,
  CNY_PER_USD,
  cnyNeededFor,
  deriveAmountUsd,
  feeForChannel,
} from "@/lib/order/payment";
import type { OrderSummary } from "@/lib/order/types";
import type { PaymentChannel } from "@/lib/order/mock-store";
import { billingApi, type CapturePayPalOrderResponse } from "@/lib/billing/api";
import {
  PayPalScriptWrapper,
  PayPalButton,
  isPayPalConfigured,
} from "@/components/billing/paypal-button";

export interface PaymentModalProps {
  open: boolean;
  order: OrderSummary | null;
  /** 当前余额（元 CNY） */
  balanceCny: number;
  onClose: () => void;
  /**
   * 支付成功回调。
   * @param channel  使用的通道
   * @param feeUsd   手续费（USD）
   * @param newBalanceCny 余额通道扣减后的新余额（元 CNY）；其他通道不传（仍由父组件 mock 维护）
   */
  onPaid: (channel: PaymentChannel, feeUsd: number, newBalanceCny?: number) => void;
}

function formatUsd(n: number): string {
  return `USD ${n.toFixed(2)}`;
}

function formatCny(n: number): string {
  return `CNY ${n.toFixed(2)}`;
}

function ChannelLogo({ channel }: { channel: PaymentChannel }) {
  const def = PAYMENT_CHANNELS.find((c) => c.id === channel)!;
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-white"
      style={{ backgroundColor: def.accent }}
      aria-hidden="true"
    >
      {def.logoText}
    </div>
  );
}

export function PaymentModal({ open, order, balanceCny, onClose, onPaid }: PaymentModalProps) {
  const t = useT();
  const [channel, setChannel] = useState<PaymentChannel>("balance");
  const [paying, setPaying] = useState(false);
  // 服务端返回的错误信息（余额不足 / 网络异常 / 参数错误）。null=无错误
  const [serverError, setServerError] = useState<string | null>(null);

  // 切换订单 / 通道时重置默认通道并清错误
  useEffect(() => {
    if (open) {
      setChannel("balance");
      setPaying(false);
      setServerError(null);
    }
  }, [open, order?.id]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, paying, onClose]);

  const amountUsd = useMemo(() => (order ? deriveAmountUsd(order) : 0), [order]);
  const feeUsd = feeForChannel(channel);
  const totalUsd = amountUsd + feeUsd;
  const needCny = cnyNeededFor(totalUsd);
  const balanceUsd = Math.round((balanceCny / CNY_PER_USD) * 100) / 100;
  const balanceEnough = balanceCny >= needCny;

  if (!open || !order) return null;

  const handleConfirm = async () => {
    if (paying) return;
    if (channel === "balance" && !balanceEnough) return;
    setPaying(true);
    setServerError(null);

    // 余额通道：调真实后端 /billing/consume/balance
    if (channel === "balance") {
      try {
        // 元 → 分（后端 LONG 以分为单位）
        const amountCnyCents = Math.round(needCny * 100);
        const amountUsdCents = Math.round(totalUsd * 100);
        const result = await billingApi.consumeBalance({
          shopifyOrderId: order.shopifyOrderId || order.shopOrderNo || order.id,
          amountCny: amountCnyCents,
          amountUsd: amountUsdCents,
          remark: `Order ${order.shopOrderNo}`,
        });
        if (result.success) {
          // 分 → 元（返回给父组件）
          const newBalanceYuan = result.balanceAfter / 100;
          onPaid(channel, feeUsd, newBalanceYuan);
        } else {
          // 后端业务失败：余额不足等
          const msg = result.errorCode === "INSUFFICIENT_BALANCE"
            ? t("order.payment.insufficient", { need: formatCny(needCny), have: formatCny(balanceCny) })
            : t("order.payment.serverError");
          setServerError(msg);
        }
      } catch (err) {
        // 网络异常 / 401 / 500
        const message = err instanceof Error ? err.message : String(err);
        setServerError(`${t("order.payment.serverError")} (${message})`);
      } finally {
        setPaying(false);
      }
      return;
    }

    // PayPal 通道：由 PayPalButton 组件自己处理（createOrder + onApprove）
    // 此函数不会被 PayPal 通道调用（按钮被 PayPalButton 替代，详见 JSX）
    if (channel === "paypal") {
      return;
    }

    // Ulimit：mock 流程，等后续接入
    setTimeout(() => {
      onPaid(channel, feeUsd);
      setPaying(false);
    }, 400);
  };

  // PayPal onApprove 成功回调
  const handlePayPalSuccess = (_result: CapturePayPalOrderResponse) => {
    setPaying(false);
    // order_payment 用途：refId 是 shopify_order_id；余额不变
    onPaid("paypal", feeUsd);
  };

  const handlePayPalError = (message: string) => {
    setPaying(false);
    setServerError(`${t("order.payment.serverError")} (${message})`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !paying && onClose()}
        aria-hidden="true"
      />
      <div className="relative w-[520px] max-w-[calc(100vw-32px)] rounded-[var(--radius-card)] border border-hairline bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {t("order.payment.title")}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
              {t("order.payment.subtitle", { no: order.shopOrderNo })}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => !paying && onClose()}
            aria-label={t("order.drawer.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Channel list */}
        <div className="space-y-2 px-5 py-4">
          {PAYMENT_CHANNELS.map((c) => {
            const selected = channel === c.id;
            const fee = feeForChannel(c.id);
            const isBalance = c.id === "balance";
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => !paying && setChannel(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[var(--radius-card)] border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-brand bg-surface-selected"
                    : "border-hairline bg-surface hover:border-brand/40"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-brand" : "border-hairline"
                  )}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-brand" />}
                </span>
                <ChannelLogo channel={c.id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {t(c.nameKey)}
                  </p>
                  {isBalance ? (
                    <p className="truncate text-[11px] text-ink-subtle">
                      {t(c.noteKey)} · {formatCny(balanceCny)}{" "}
                      <span className="text-ink-subtle/70">
                        ≈ {formatUsd(balanceUsd)}
                      </span>
                    </p>
                  ) : c.id === "ulimit" ? (
                    <p className="truncate text-[11px] text-ink-subtle">
                      {t("order.payment.channel.ulimitSub")}
                    </p>
                  ) : (
                    <p className="truncate text-[11px] text-ink-subtle">
                      {t("order.payment.feeShort")}: {formatUsd(fee)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right text-[10px] text-ink-subtle">
                  <p>
                    {t("order.payment.feeShort")}{" "}
                    <span className="font-semibold text-ink">{formatUsd(fee)}</span>
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer: total + pay */}
        <div className="border-t border-hairline px-5 py-3">
          <div className="mb-2 grid grid-cols-2 gap-y-1 text-[11px] text-ink-muted">
            <span>{t("order.payment.payable")}</span>
            <span className="text-right tabular-nums text-ink">
              {formatUsd(amountUsd)}
            </span>
            <span>{t("order.payment.feeLabel")}</span>
            <span className="text-right tabular-nums text-ink">
              {formatUsd(feeUsd)}
            </span>
          </div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink">
              {t("order.payment.total")}
            </span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {formatUsd(totalUsd)}
            </span>
          </div>
          {channel === "balance" && !balanceEnough && (
            <p className="mb-2 text-[11px] text-destructive">
              {t("order.payment.insufficient", {
                need: formatCny(needCny),
                have: formatCny(balanceCny),
              })}
            </p>
          )}
          {serverError && (
            <p className="mb-2 text-[11px] text-destructive">{serverError}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-right text-[10px] text-ink-subtle">
              {t("order.payment.settlementNote")}
            </span>
            {channel === "paypal" ? (
              <div className="min-w-[180px] flex-1">
                {isPayPalConfigured() ? (
                  <PayPalScriptWrapper>
                    <PayPalButton
                      purpose="order_payment"
                      refId={order.shopifyOrderId || order.shopOrderNo || order.id}
                      amountUsdCents={Math.round(totalUsd * 100)}
                      description={`Order ${order.shopOrderNo}`}
                      disabled={paying}
                      onSuccess={handlePayPalSuccess}
                      onCancel={() => setPaying(false)}
                      onError={handlePayPalError}
                    />
                  </PayPalScriptWrapper>
                ) : (
                  <p className="text-[11px] text-amber-600">
                    PayPal 未配置
                  </p>
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                size="md"
                disabled={paying || (channel === "balance" && !balanceEnough)}
                onClick={handleConfirm}
                className="min-w-[120px]"
              >
                {paying ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("order.payment.processing")}
                  </>
                ) : (
                  t("order.payment.confirm")
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
