"use client";

// 余额充值 Modal
// ----------------------------------------------------------------------------
// 用户在订单中心顶部点击「充值」按钮打开。
// 流程：
//   1. 输入/选择充值金额（USD）
//   2. 点 PayPal 按钮 → 创建 PayPal 订单 → 弹窗支付 → 捕获
//   3. 捕获成功后调 onSuccess(newBalanceCny) 关闭弹窗
//
// 当前汇率由后端配置（TANG_PLUGIN_PAYPAL_USD_TO_CNY_RATE，默认 6.43），
// 后端在 capture 时按实际配置换算 CNY 入账，前端只展示预估。
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X, Loader2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import {
  PayPalScriptWrapper,
  PayPalButton,
  isPayPalConfigured,
} from "@/components/billing/paypal-button";
import type { CapturePayPalOrderResponse } from "@/lib/billing/api";

const USD_PRESETS = [50, 100, 200, 500];

// 与后端默认值一致（仅用于展示预估 CNY）
const USD_TO_CNY_RATE = 6.43;

export interface RechargeModalProps {
  open: boolean;
  /** 当前余额（元 CNY），用于展示 */
  balanceCny: number;
  onClose: () => void;
  /** 充值成功回调，传入新余额（元 CNY） */
  onSuccess: (newBalanceCny: number) => void;
}

export function RechargeModal({ open, balanceCny, onClose, onSuccess }: RechargeModalProps) {
  const t = useT();
  const [amountUsd, setAmountUsd] = useState<number>(100);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [paying, setPaying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmountUsd(100);
      setCustomAmount("");
      setPaying(false);
      setServerError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !paying) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, paying, onClose]);

  const effectiveAmountUsd = useMemo(() => {
    const custom = Number(customAmount);
    if (customAmount && Number.isFinite(custom) && custom > 0) {
      return Math.round(custom * 100) / 100;
    }
    return amountUsd;
  }, [amountUsd, customAmount]);

  const amountUsdCents = Math.round(effectiveAmountUsd * 100);
  const estimatedCny = Math.round(effectiveAmountUsd * USD_TO_CNY_RATE * 100) / 100;

  if (!open) return null;

  const handleSuccess = (result: CapturePayPalOrderResponse) => {
    setPaying(false);
    if (result.success && result.balanceAfter != null) {
      // 分 → 元
      const newBalanceYuan = result.balanceAfter / 100;
      onSuccess(newBalanceYuan);
    } else {
      setServerError(t("order.payment.serverError"));
    }
  };

  const handleError = (message: string) => {
    setPaying(false);
    setServerError(`${t("order.payment.serverError")} (${message})`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[440px] max-w-[92vw] rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-neutral-900">
            {t("billing.recharge.title")}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700"
            aria-label="close"
            disabled={paying}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* 当前余额 */}
          <div className="rounded-md bg-neutral-50 px-3 py-2 text-[12px]">
            <span className="text-neutral-500">{t("billing.recharge.currentBalance")}：</span>
            <span className="font-semibold text-neutral-900">
              CNY {balanceCny.toFixed(2)}
            </span>
          </div>

          {/* 预设金额 */}
          <div>
            <label className="mb-2 block text-[12px] font-medium text-neutral-700">
              {t("billing.recharge.selectAmount")}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {USD_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setAmountUsd(amt);
                    setCustomAmount("");
                  }}
                  className={`rounded-md border px-3 py-2 text-[12px] font-medium transition ${
                    !customAmount && amountUsd === amt
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  ${amt}
                </button>
              ))}
            </div>
          </div>

          {/* 自定义金额 */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-700">
              {t("billing.recharge.customAmount")}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">
                $
              </span>
              <input
                type="number"
                min={1}
                max={10000}
                step={0.01}
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={String(amountUsd)}
                className="w-full rounded-md border border-neutral-300 py-2 pl-7 pr-3 text-[13px] focus:border-neutral-500 focus:outline-none"
                disabled={paying}
              />
            </div>
          </div>

          {/* 预估入账 */}
          <div className="rounded-md bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
            {t("billing.recharge.estimatedCredit")}：
            <span className="font-semibold">CNY {estimatedCny.toFixed(2)}</span>
            <span className="ml-2 text-sky-600">
              (1 USD ≈ {USD_TO_CNY_RATE} CNY)
            </span>
          </div>

          {/* 错误提示 */}
          {serverError && (
            <p className="text-[11px] text-destructive">{serverError}</p>
          )}

          {/* PayPal 按钮 */}
          <div className="pt-1">
            {isPayPalConfigured() ? (
              <PayPalScriptWrapper>
                <PayPalButton
                  purpose="balance_recharge"
                  amountUsdCents={amountUsdCents}
                  description="Balance recharge"
                  disabled={paying || amountUsdCents <= 0}
                  onSuccess={handleSuccess}
                  onCancel={() => setPaying(false)}
                  onError={handleError}
                />
              </PayPalScriptWrapper>
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-700">
                {t("billing.paypalNotConfigured")}
              </div>
            )}
          </div>

          {/* 备注 */}
          <p className="text-[10px] text-neutral-400">
            {t("billing.recharge.note")}
          </p>
        </div>
      </div>
    </div>
  );
}
