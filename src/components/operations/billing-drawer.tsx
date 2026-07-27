// 计费抽屉（D4）：展示三档商品目录（catalog/plans）+ 订阅/加购包下单 + PayPal 捕获。
// 真实模式：点击购买 → create-subscription/create-pack-order → PayPal 捕获 → 服务端发放 lot。
// 演示/未配 PayPal：提供"直接完成支付"回退（sandbox capture）。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT, useLocale } from "@/i18n/LocaleProvider";
import { localePath } from "@/i18n/LocaleLink";
import { Button } from "@/components/ui/button";
import { Drawer } from "./drawer";
import { billingApi, type CatalogItem, type CapturePayPalOrderResponse } from "@/lib/billing/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

export function BillingDrawer({
  open,
  wallet,
  onClose,
  onPurchased,
}: {
  open: boolean;
  wallet?: { balanceCredits: number } | null;
  onClose: () => void;
  onPurchased?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [catalog, setCatalog] = useState<{ plans: CatalogItem[]; packages: CatalogItem[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [processingCode, setProcessingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paypalHostCode, setPaypalHostCode] = useState<string | null>(null);
  const paypalHostRef = useRef<HTMLDivElement | null>(null);

  const loadCatalog = useCallback(() => {
    setLoading(true);
    billingApi
      .catalog()
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(null);
      loadCatalog();
    }
  }, [open, loadCatalog]);

  const capture = useCallback(
    async (paypalOrderId: string) => {
      const res: CapturePayPalOrderResponse = await billingApi.capturePayPalOrder(paypalOrderId);
      if (!res.success) {
        throw new Error(t("ops.billing.errCapture"));
      }
      return res;
    },
    [t]
  );

  const handleBuy = useCallback(
    async (item: CatalogItem) => {
      setError(null);
      setSuccess(null);
      setProcessingCode(item.code);
      try {
        const order =
          item.kind === "subscription"
            ? await billingApi.createSubscription(item.code)
            : await billingApi.createPackOrder(item.code);
        if (PAYPAL_CLIENT_ID) {
          // 真实 PayPal 流程：动态加载 SDK 并渲染按钮。
          setPaypalHostCode(item.code);
          // 等待 React 渲染出独立的 host div
          await new Promise((r) => setTimeout(r, 50));
          await loadPaypalSdk(PAYPAL_CLIENT_ID, t);
          const paypal = (window as any).paypal;
          if (paypal && paypalHostRef.current) {
            paypal
              .Buttons({
                createOrder: () => Promise.resolve(order.paypalOrderId),
                onApprove: async () => {
                  await capture(order.paypalOrderId);
                  setSuccess(item.code);
                  setPaypalHostCode(null);
                  onPurchased?.();
                },
                onError: () => {
                  setError(t("ops.billing.errCapture"));
                  setPaypalHostCode(null);
                },
              })
              .render(paypalHostRef.current);
          }
        } else {
          // 演示/未配置：直接 capture（sandbox 下单后无需真实审批）。
          await capture(order.paypalOrderId);
          setSuccess(item.code);
          onPurchased?.();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setProcessingCode(null);
      }
    },
    [capture, onPurchased]
  );

  const items = [...(catalog?.plans ?? []), ...(catalog?.packages ?? [])];

  return (
    <Drawer open={open} onClose={onClose} title={t("ops.billing.title")} widthClass="max-w-lg">
      <p className="mb-2 text-[12px] leading-relaxed text-ink-muted">{t("ops.billing.desc")}</p>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-subtle">
        {t("ops.billing.renewNote")}{" "}
        <Link href={localePath(locale, "/account/refund-policy")} className="text-link hover:underline">
          {t("ops.billing.refundLink")}
        </Link>
      </p>

      {wallet && (
        <div className="mb-3 rounded-[var(--radius-card)] border border-hairline bg-surface-muted/40 px-3 py-2 text-[12px]">
          <span className="text-ink-subtle">{t("ops.billing.currentBalance")}: </span>
          <span className="font-semibold tabular-nums text-brand">{wallet.balanceCredits.toLocaleString()} {t("ops.usage.points")}</span>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-[var(--radius-control)] border border-destructive-soft bg-destructive-soft px-3 py-2 text-[12px] text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded-[var(--radius-control)] border border-success-soft bg-success-soft px-3 py-2 text-[12px] text-success">
          {t("ops.billing.success", { code: success })}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-[var(--radius-card)] bg-muted" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const credits = item.promoActive ? item.creditsPromo : item.creditsNormal;
            const price = (item.priceUsdCents / 100).toFixed(2);
            return (
              <div key={item.code} className="rounded-[var(--radius-card)] border border-hairline bg-surface p-3 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink">{item.name}</span>
                      {item.promoActive && (
                        <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                          {t("ops.billing.promoTag")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      ${price} · {item.kind === "subscription" ? t("ops.billing.perMonth", { d: item.durationDays }) : t("ops.billing.once")} · {credits.toLocaleString()} {t("ops.usage.points")}
                    </p>
                    {item.promoActive && item.creditsPromo !== item.creditsNormal && (
                      <p className="text-[10px] text-ink-subtle">{t("ops.billing.promoNote", { n: item.creditsPromo })}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={processingCode != null}
                    onClick={() => handleBuy(item)}
                  >
                    {processingCode === item.code ? t("ops.billing.processing") : t("ops.billing.buy")}
                  </Button>
                </div>
                {paypalHostCode === item.code && <div ref={paypalHostRef} className="mt-2" />}
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

let sdkPromise: Promise<void> | null = null;
function loadPaypalSdk(clientId: string, t: (key: string) => string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).paypal) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(t("ops.billing.errSdkLoad")));
    document.body.appendChild(s);
  });
  return sdkPromise;
}
