"use client";

// 订单中心 · 采购单支付弹窗
// ----------------------------------------------------------------------------
// 入参：tradeNo（Tangbuy 支付单号）+ 应付金额展示。
// 通道列表来自老系统 GET /api/plugin/pay/channelList；提交走 payment/order。
// 成功后由父组件刷新订单列表（信 payCb / 状态同步），不在此强行 setStatus(preparing)。
// SaaS 积分/订阅仍走 /billing/*，与本弹窗拆开。
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X, Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrderSummary } from "@/lib/order/types";
import {
  fetchTangPayChannels,
  submitTangPaymentOrder,
  type TangPayChannel,
} from "@/lib/order/tang-pay";

export interface PaymentModalProps {
  open: boolean;
  order: OrderSummary | null;
  onClose: () => void;
  /** Called after payment/order succeeds — parent should refresh list. */
  onPaid: (channel: string) => void;
}

function formatAmount(order: OrderSummary): string {
  if (order.payableAmount?.trim()) return order.payableAmount.trim();
  if (order.productCost?.trim()) return order.productCost.trim();
  return "—";
}

export function PaymentModal({ open, order, onClose, onPaid }: PaymentModalProps) {
  const t = useT();
  const [channels, setChannels] = useState<TangPayChannel[]>([]);
  const [channel, setChannel] = useState<string>("");
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [paying, setPaying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const tradeNo = order?.tradeNo?.trim() || "";

  useEffect(() => {
    if (!open || !tradeNo) {
      setChannels([]);
      setChannel("");
      setServerError(null);
      setPaying(false);
      return;
    }
    let alive = true;
    setLoadingChannels(true);
    setServerError(null);
    fetchTangPayChannels({
      tradeNo,
      country: order?.destinationCountry?.code || order?.recipient?.countryCode,
    })
      .then((list) => {
        if (!alive) return;
        setChannels(list);
        setChannel(list[0]?.channel ?? "");
      })
      .catch(() => {
        if (!alive) return;
        setChannels([]);
        setServerError(t("order.payment.serverError"));
      })
      .finally(() => {
        if (alive) setLoadingChannels(false);
      });
    return () => {
      alive = false;
    };
  }, [open, tradeNo, order?.destinationCountry?.code, order?.recipient?.countryCode, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, paying, onClose]);

  const amountLabel = useMemo(
    () => (order ? formatAmount(order) : "—"),
    [order]
  );

  if (!open || !order) return null;

  const handleConfirm = async () => {
    if (paying || !tradeNo || !channel) return;
    setPaying(true);
    setServerError(null);
    try {
      await submitTangPaymentOrder({
        tradeNo,
        orderNo: tradeNo,
        channel,
        amount: order.payableAmount ?? order.productCost ?? undefined,
      });
      onPaid(channel);
    } catch {
      setServerError(t("order.payment.serverError"));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
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
              {t("order.payment.subtitle", { no: order.shopOrderNo })}
              {tradeNo ? ` · ${tradeNo}` : ""}
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

        <div className="space-y-2 px-5 py-4">
          {!tradeNo ? (
            <p className="text-[12px] text-destructive">{t("order.payment.missingTradeNo")}</p>
          ) : loadingChannels ? (
            <div className="flex items-center gap-2 py-6 text-[12px] text-ink-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("order.payment.loadingChannels")}
            </div>
          ) : channels.length === 0 ? (
            <p className="text-[12px] text-ink-subtle">{t("order.payment.noChannels")}</p>
          ) : (
            channels.map((c) => {
              const selected = channel === c.channel;
              return (
                <button
                  key={c.channel}
                  type="button"
                  onClick={() => !paying && setChannel(c.channel)}
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
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {c.name?.trim() || c.channel}
                    </p>
                    <p className="truncate text-[11px] text-ink-subtle">{c.channel}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-hairline px-5 py-3">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-ink">
              {t("order.payment.payable")}
            </span>
            <span className="text-lg font-bold tabular-nums text-ink">
              {amountLabel}
            </span>
          </div>
          {serverError && (
            <p className="mb-2 text-[11px] text-destructive">{serverError}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="flex-1 text-right text-[10px] text-ink-subtle">
              {t("order.payment.settlementNote")}
            </span>
            <Button
              variant="primary"
              size="md"
              disabled={paying || !tradeNo || !channel || loadingChannels}
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
          </div>
        </div>
      </div>
    </div>
  );
}
