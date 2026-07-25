"use client";

// PayPal 支付按钮（共享组件）
// ----------------------------------------------------------------------------
// 用 @paypal/react-paypal-js 包装，封装了与后端 /billing/paypal/create-order
// 和 /capture 的交互。调用方只需提供 purpose/refId/amountUsdCents 和 onSuccess 回调。
//
// 流程：
//   1. createOrder 回调 → 调后端 /paypal/create-order，返回 paypalOrderId
//   2. PayPal 弹窗显示，用户登录 PayPal 并批准
//   3. onApprove 回调 → 调后端 /paypal/{id}/capture
//   4. capture 成功 → 调用方 onSuccess(result)
//
// 错误处理：
//   - createOrder 失败 → 显示 alert，PayPal 弹窗不会打开
//   - 用户关闭 PayPal 弹窗 → onCancel 触发，调用方可选处理
//   - capture 失败 → onError 触发，显示错误信息
// ----------------------------------------------------------------------------

import { useMemo } from "react";
import {
  PayPalScriptProvider,
  PayPalButtons,
  usePayPalScriptReducer,
} from "@paypal/react-paypal-js";
import { billingApi, type CapturePayPalOrderResponse, type PayPalPurpose } from "@/lib/billing/api";

export interface PayPalButtonProps {
  /** 用途：order_payment（订单支付）/ balance_recharge（余额充值） */
  purpose: PayPalPurpose;
  /** order_payment 时为 shopify_order_id；balance_recharge 时不传 */
  refId?: string;
  /** USD 金额（分）。例如 100.00 USD → 10000 */
  amountUsdCents: number;
  /** PayPal 弹窗中显示的描述 */
  description?: string;
  /** 按钮是否禁用（例如金额未选时） */
  disabled?: boolean;
  /** capture 成功回调 */
  onSuccess: (result: CapturePayPalOrderResponse) => void;
  /** 用户关闭 PayPal 弹窗 */
  onCancel?: () => void;
  /** 错误回调（createOrder 或 capture 失败） */
  onError?: (message: string) => void;
}

/** PayPal Client ID（在浏览器加载 SDK 用，公开无害）。 */
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";
/** 是否使用沙盒环境。生产部署时设为 false。 */
const PAYPAL_SANDBOX = process.env.NEXT_PUBLIC_PAYPAL_SANDBOX !== "false";

export function PayPalScriptWrapper({ children }: { children: React.ReactNode }) {
  const options = useMemo(
    () => ({
      clientId: PAYPAL_CLIENT_ID || "test",
      currency: "USD",
      intent: "capture",
    }),
    []
  );

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-700">
        PayPal 未配置：请在 .env.local 设置 NEXT_PUBLIC_PAYPAL_CLIENT_ID
      </div>
    );
  }

  return (
    <PayPalScriptProvider options={options}>
      {children}
    </PayPalScriptProvider>
  );
}

export function PayPalButton({
  purpose,
  refId,
  amountUsdCents,
  description,
  disabled,
  onSuccess,
  onCancel,
  onError,
}: PayPalButtonProps) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer();

  if (!PAYPAL_CLIENT_ID) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-700">
        PayPal 未配置：请在 .env.local 设置 NEXT_PUBLIC_PAYPAL_CLIENT_ID
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex h-11 items-center justify-center rounded-md bg-neutral-100 text-[12px] text-neutral-500">
        PayPal 加载中…
      </div>
    );
  }

  if (isRejected) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-[11px] text-destructive">
        PayPal SDK 加载失败（检查网络或 Client ID）
      </div>
    );
  }

  return (
    <PayPalButtons
      style={{ layout: "vertical", color: "black", shape: "rect", label: "pay", height: 40 }}
      disabled={disabled}
      forceReRender={[amountUsdCents, purpose, refId]}
      createOrder={async () => {
        try {
          const resp = await billingApi.createPayPalOrder({
            purpose,
            refId,
            amountUsdCents,
            description,
          });
          return resp.paypalOrderId;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onError?.(msg);
          throw err;
        }
      }}
      onApprove={async (data) => {
        try {
          const result = await billingApi.capturePayPalOrder(data.orderID);
          if (result.success) {
            onSuccess(result);
          } else {
            onError?.(result.errorCode || "Capture failed");
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onError?.(msg);
        }
      }}
      onCancel={() => {
        onCancel?.();
      }}
      onError={(err) => {
        const msg = err instanceof Error ? err.message : String(err);
        onError?.(msg);
      }}
    />
  );
}

/** 工具：判断 PayPal 是否已配置（用于 UI 提示）。 */
export function isPayPalConfigured(): boolean {
  return Boolean(PAYPAL_CLIENT_ID);
}

/** 工具：当前是否为沙盒环境。 */
export function isPayPalSandbox(): boolean {
  return PAYPAL_SANDBOX;
}
