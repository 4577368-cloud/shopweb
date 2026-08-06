"use client";

// 订单中心 · 支付弹窗
// ----------------------------------------------------------------------------
// mode: procurement（默认，有 tradeNo）
//   → GET /api/plugin/pay/channelList?orderNo=<tradeNo>
//   → POST /api/plugin/pay/payment/order  JSON { orderNo, payCode, ... }
//   → 可选轮询 draft 状态，再回调 onPaid
// mode: billing（无 tradeNo 的遗留兜底）
//   → 余额走 /billing/consume/balance；PayPal 走 Billing PayPalButton
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
import {
  DRAFT_STATUS,
  getDraftOrder,
  listPayChannels,
  payCodeOf,
  submitPayOrder,
  type PayChannelRow,
} from "@/lib/order/draftorder-api";
import { ApiError } from "@/lib/api";

export interface PaymentModalProps {
  open: boolean;
  order: OrderSummary | null;
  /** 当前余额（元 CNY）—— billing 模式或展示用 */
  balanceCny: number;
  shopName?: string;
  onClose: () => void;
  /**
   * 支付成功回调。
   * @param channel  使用的通道
   * @param feeUsd   手续费（USD）
   * @param newBalanceCny 余额通道扣减后的新余额（元 CNY）；采购支付可不传
   */
  onPaid: (
    channel: PaymentChannel,
    feeUsd: number,
    newBalanceCny?: number,
    meta?: { draftStatus?: number; tradeNo?: string }
  ) => void;
}

function formatUsd(n: number): string {
  return `USD ${n.toFixed(2)}`;
}

function formatCny(n: number): string {
  return `CNY ${n.toFixed(2)}`;
}

function mapPayCodeToUiChannel(code: string): PaymentChannel {
  const c = code.toLowerCase();
  if (c.includes("paypal")) return "paypal";
  if (c.includes("balance") || c === "wallet") return "balance";
  if (c.includes("card") || c.includes("ulimit") || c.includes("alipay")) {
    return "ulimit";
  }
  return c || "balance";
}

function ChannelLogo({ channel }: { channel: PaymentChannel }) {
  const def = PAYMENT_CHANNELS.find((c) => c.id === channel);
  const accent = def?.accent ?? "#64748B";
  const logoText = def?.logoText ?? String(channel).slice(0, 2).toUpperCase();
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[13px] font-bold text-white"
      style={{ backgroundColor: accent }}
      aria-hidden="true"
    >
      {logoText}
    </div>
  );
}

async function pollDraftPaid(
  shopName: string,
  orderId: number,
  attempts = 6
): Promise<number | undefined> {
  for (let i = 0; i < attempts; i++) {
    try {
      const d = await getDraftOrder(shopName, orderId);
      if (
        d.status != null &&
        d.status !== DRAFT_STATUS.AWAITING &&
        d.status !== DRAFT_STATUS.AWAITING_PAYMENT
      ) {
        return d.status;
      }
    } catch {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return undefined;
}

export function PaymentModal({
  open,
  order,
  balanceCny,
  shopName,
  onClose,
  onPaid,
}: PaymentModalProps) {
  const t = useT();
  const tradeNo = order?.tradeNo?.trim() || "";
  const procurementMode = Boolean(tradeNo);

  const [channel, setChannel] = useState<PaymentChannel>("balance");
  const [payCode, setPayCode] = useState("balance");
  const [paying, setPaying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [remoteChannels, setRemoteChannels] = useState<PayChannelRow[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPaying(false);
    setServerError(null);
    setChannel("balance");
    setPayCode("balance");
  }, [open, order?.id, tradeNo]);

  useEffect(() => {
    if (!open || !procurementMode || !tradeNo) {
      setRemoteChannels([]);
      return;
    }
    let alive = true;
    setChannelsLoading(true);
    listPayChannels({
      orderNo: tradeNo,
      country: order?.destinationCountry?.code || undefined,
    })
      .then((rows) => {
        if (!alive) return;
        setRemoteChannels(rows);
        const first = rows[0];
        if (first) {
          const code = payCodeOf(first);
          if (code) {
            setPayCode(code);
            setChannel(mapPayCodeToUiChannel(code));
          }
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const msg =
          err instanceof ApiError
            ? err.message
            : t("order.payment.serverError");
        setServerError(msg);
      })
      .finally(() => {
        if (alive) setChannelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, procurementMode, tradeNo, order?.destinationCountry?.code, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, paying, onClose]);

  const amountUsd = useMemo(() => (order ? deriveAmountUsd(order) : 0), [order]);
  const feeUsd = feeForChannel(
    channel === "paypal" || channel === "ulimit" || channel === "balance"
      ? channel
      : "balance"
  );
  const totalUsd = amountUsd + feeUsd;
  const needCny = cnyNeededFor(totalUsd);
  const balanceUsd = Math.round((balanceCny / CNY_PER_USD) * 100) / 100;
  const balanceEnough = balanceCny >= needCny;

  const channelRows = useMemo(() => {
    if (procurementMode && remoteChannels.length > 0) {
      return remoteChannels.map((row) => {
        const code = payCodeOf(row);
        return {
          code,
          label:
            String(row.name ?? row.channel ?? row.payCode ?? code) || code,
          ui: mapPayCodeToUiChannel(code),
        };
      });
    }
    return PAYMENT_CHANNELS.map((c) => ({
      code: c.id,
      label: t(c.nameKey),
      ui: c.id as PaymentChannel,
    }));
  }, [procurementMode, remoteChannels, t]);

  if (!open || !order) return null;

  const handleProcurementPay = async () => {
    if (paying || !tradeNo) return;
    setPaying(true);
    setServerError(null);
    try {
      const payload = JSON.stringify({
        orderNo: tradeNo,
        payCode,
        channel: payCode,
      });
      await submitPayOrder(payload);

      let draftStatus: number | undefined;
      if (shopName && order.draftOrderId) {
        draftStatus = await pollDraftPaid(shopName, order.draftOrderId);
      }
      onPaid(mapPayCodeToUiChannel(payCode), feeUsd, undefined, {
        draftStatus: draftStatus ?? DRAFT_STATUS.PROCESSING,
        tradeNo,
      });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : t("order.payment.serverError");
      setServerError(msg);
    } finally {
      setPaying(false);
    }
  };

  const handleConfirm = async () => {
    if (paying) return;
    if (procurementMode) {
      await handleProcurementPay();
      return;
    }

    if (channel === "balance" && !balanceEnough) return;
    setPaying(true);
    setServerError(null);

    if (channel === "balance") {
      try {
        const amountCnyCents = Math.round(needCny * 100);
        const amountUsdCents = Math.round(totalUsd * 100);
        const result = await billingApi.consumeBalance({
          shopifyOrderId: order.shopifyOrderId || order.shopOrderNo || order.id,
          amountCny: amountCnyCents,
          amountUsd: amountUsdCents,
          remark: `Order ${order.shopOrderNo}`,
        });
        if (result.success) {
          const newBalanceYuan = result.balanceAfter / 100;
          onPaid(channel, feeUsd, newBalanceYuan);
        } else {
          const msg =
            result.errorCode === "INSUFFICIENT_BALANCE"
              ? t("order.payment.insufficient", {
                  need: formatCny(needCny),
                  have: formatCny(balanceCny),
                })
              : t("order.payment.serverError");
          setServerError(msg);
        }
      } catch {
        setServerError(t("order.payment.serverError"));
      } finally {
        setPaying(false);
      }
      return;
    }

    if (channel === "paypal") {
      return;
    }

    setTimeout(() => {
      onPaid(channel, feeUsd);
      setPaying(false);
    }, 400);
  };

  const handlePayPalSuccess = (_result: CapturePayPalOrderResponse) => {
    setPaying(false);
    onPaid("paypal", feeUsd);
  };

  const handlePayPalError = (message: string) => {
    setPaying(false);
    setServerError(`${t("order.payment.serverError")} (${message})`);
  };

  const showBillingPayPal = !procurementMode && channel === "paypal";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !paying && onClose()}
        aria-hidden="true"
      />
      <div className="relative w-[520px] max-w-[calc(100vw-32px)] rounded-[var(--radius-card)] border border-hairline bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {t("order.payment.title")}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
              {t("order.payment.subtitle", {
                no: order.tangbuyOrderNo || order.shopOrderNo,
              })}
              {tradeNo ? (
                <span className="ml-1 text-ink-subtle/80">· {tradeNo}</span>
              ) : null}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => !paying && onClose()}
            aria-label={t("order.drawer.close")}
            className="h-7 w-7 px-0"
            title={t("order.drawer.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-2 px-5 py-4">
          {channelsLoading && (
            <p className="flex items-center gap-2 text-[12px] text-ink-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("order.payment.loadingChannels")}
            </p>
          )}
          {channelRows.map((c) => {
            const selected = payCode === c.code || channel === c.ui;
            const isBalance = c.ui === "balance";
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  if (paying) return;
                  setPayCode(c.code);
                  setChannel(c.ui);
                }}
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
                <ChannelLogo channel={c.ui} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {c.label}
                  </p>
                  {isBalance && !procurementMode ? (
                    <p className="truncate text-[11px] text-ink-subtle">
                      {t("order.payment.channel.balanceNote")} ·{" "}
                      {formatCny(balanceCny)}{" "}
                      <span className="text-ink-subtle/70">
                        ≈ {formatUsd(balanceUsd)}
                      </span>
                    </p>
                  ) : (
                    <p className="truncate text-[11px] text-ink-subtle">
                      {procurementMode
                        ? t("order.payment.procurementHint")
                        : t("order.payment.feeShort") +
                          ": " +
                          formatUsd(feeForChannel(c.ui as "paypal" | "ulimit" | "balance"))}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-hairline px-5 py-3">
          <div className="mb-2 grid grid-cols-2 gap-y-1 text-[11px] text-ink-muted">
            <span>{t("order.payment.payable")}</span>
            <span className="text-right tabular-nums text-ink">
              {order.payableAmount || formatUsd(amountUsd)}
            </span>
            {!procurementMode && (
              <>
                <span>{t("order.payment.feeLabel")}</span>
                <span className="text-right tabular-nums text-ink">
                  {formatUsd(feeUsd)}
                </span>
              </>
            )}
          </div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink">
              {t("order.payment.total")}
            </span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {order.payableAmount || formatUsd(totalUsd)}
            </span>
          </div>
          {!procurementMode && channel === "balance" && !balanceEnough && (
            <p className="mb-2 text-[11px] text-destructive">
              {t("order.payment.insufficient", {
                need: formatCny(needCny),
                have: formatCny(balanceCny),
              })}
            </p>
          )}
          {!procurementMode && !tradeNo && (
            <p className="mb-2 text-[11px] text-amber-700">
              {t("order.payment.missingTradeNo")}
            </p>
          )}
          {serverError && (
            <p className="mb-2 text-[11px] text-destructive">{serverError}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-right text-[10px] text-ink-subtle">
              {t("order.payment.settlementNote")}
            </span>
            {showBillingPayPal ? (
              <div className="min-w-[180px] flex-1">
                {isPayPalConfigured() ? (
                  <PayPalScriptWrapper>
                    <PayPalButton
                      purpose="order_payment"
                      refId={
                        order.shopifyOrderId || order.shopOrderNo || order.id
                      }
                      amountUsdCents={Math.round(totalUsd * 100)}
                      description={`Order ${order.shopOrderNo}`}
                      disabled={paying}
                      onSuccess={handlePayPalSuccess}
                      onCancel={() => setPaying(false)}
                      onError={handlePayPalError}
                    />
                  </PayPalScriptWrapper>
                ) : (
                  <p className="text-[11px] text-amber-600">PayPal 未配置</p>
                )}
              </div>
            ) : (
              <Button
                variant="primary"
                size="md"
                disabled={
                  paying ||
                  channelsLoading ||
                  (!procurementMode &&
                    channel === "balance" &&
                    !balanceEnough) ||
                  (procurementMode && !tradeNo)
                }
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
