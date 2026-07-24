"use client";

// 订单卡片（Phase 2）：通用常驻字段 + 按 status 渲染设计稿 §2.3 专属字段矩阵。
// 待发货 / 待送达渲染物流双轨；「重新下单」按钮按用户决策暂缓（本阶段隐藏）。
import { useT } from "@/i18n/LocaleProvider";
import type { LineItem, OrderSummary } from "@/lib/order/types";
import { StatusBadge } from "./status-badge";
import { LogisticsTracks } from "./logistics-tracks";
import { cn } from "@/lib/utils";

// 占位店铺域名（独立站形态跳 Shopify Admin 新窗口；嵌入式走 App Bridge Redirect.dispatch）。
const SHOP_DOMAIN = "your-store.myshopify.com";
function shopifyAdminUrl(shopifyOrderId: string): string {
  return `https://${SHOP_DOMAIN}/admin/orders/${shopifyOrderId}`;
}

type TFn = (key: string, params?: Record<string, string | number>) => string;

function Field({ label, value }: { label: string; value?: string }) {
  const text = value ?? "—";
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-ink-subtle">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-ink" title={text}>
        {text}
      </p>
    </div>
  );
}

// 货币求和（¥86.00 + ¥42.00 → ¥128.00）；解析失败回退 "—"。
function addCurrency(a?: string, b?: string): string {
  const pa = a ? parseFloat(a.replace(/[^\d.]/g, "")) : NaN;
  const pb = b ? parseFloat(b.replace(/[^\d.]/g, "")) : NaN;
  if (isNaN(pa) && isNaN(pb)) return "—";
  const sum = (isNaN(pa) ? 0 : pa) + (isNaN(pb) ? 0 : pb);
  return `¥${sum.toFixed(2)}`;
}

function LineItemRow({ item, t }: { item: LineItem; t: TFn }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-hairline bg-surface px-2 py-1.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-soft text-xs font-semibold text-brand-accent">
        {(item.title ?? "?").slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-ink">{item.title}</p>
        <p className="text-[10px] text-ink-subtle">SKU: {item.sku}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-medium text-ink">{item.unitCost}</p>
        <p className="text-[10px] text-ink-subtle">× {item.qty}</p>
      </div>
    </div>
  );
}

function CostSummary({ order, t }: { order: OrderSummary; t: TFn }) {
  const fee = order.needsQuote ? undefined : order.logisticsFee;
  return (
    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface p-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-ink-subtle">
        {t("order.columns.costSummary")}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-ink-muted">
          {t("order.card.costProduct")}:{" "}
          <b className="text-ink">{order.productCost ?? "—"}</b>
        </span>
        <span className="text-ink-muted">
          {t("order.card.costLogistics")}:{" "}
          <b className="text-ink">
            {order.needsQuote ? t("order.card.needsQuote") : order.logisticsFee ?? "—"}
          </b>
        </span>
        <span className="text-ink-muted">
          {t("order.card.costTotal")}:{" "}
          <b className="text-ink">{addCurrency(order.productCost, fee)}</b>
        </span>
      </div>
    </div>
  );
}

// 按状态渲染专属字段 + 操作（设计稿 §2.3）。
function StatusBody({ order, t }: { order: OrderSummary; t: TFn }) {
  switch (order.status) {
    case "pendingOrder":
      return (
        <div className="mt-3 space-y-3">
          {order.lineItems && order.lineItems.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-ink-subtle">
                {t("order.card.lineItems")}
              </p>
              <div className="space-y-1.5">
                {order.lineItems.map((it, i) => (
                  <LineItemRow key={i} item={it} t={t} />
                ))}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {order.routeLine && (
              <Field label={t("order.card.routeLine")} value={order.routeLine} />
            )}
            {order.logisticsMethod && (
              <Field label={t("order.card.logisticsMethod")} value={order.logisticsMethod} />
            )}
            {order.logisticsEta && (
              <Field label={t("order.card.logisticsEta")} value={order.logisticsEta} />
            )}
            <Field
              label={t("order.card.logisticsFee")}
              value={order.needsQuote ? t("order.card.needsQuote") : order.logisticsFee}
            />
          </div>
          <CostSummary order={order} t={t} />
          {order.remark && (
            <Field label={t("order.columns.remark")} value={order.remark} />
          )}
          {/* 重新下单按钮：用户决策暂缓（Phase 4 后端下单接口就绪后补）。 */}
        </div>
      );

    case "pendingSupplement":
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label={t("order.card.supplementReason")} value={order.supplementReason} />
            <Field label={t("order.card.supplementAmount")} value={order.supplementAmount} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover"
            >
              {t("order.card.confirmSupplement")}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.cancel")}
            </button>
          </div>
        </div>
      );

    case "pendingPayment":
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label={t("order.card.supplier")} value={order.supplierOrderNo} />
            <Field label={t("order.card.payableAmount")} value={order.payableAmount} />
            <Field label={t("order.card.payMethod")} value={order.payMethod} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-hover"
            >
              {t("order.card.markPaid")}
            </button>
          </div>
        </div>
      );

    case "preparing":
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label={t("order.card.expectedShipAt")} value={order.expectedShipAt} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.urge")}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.cancel")}
            </button>
          </div>
        </div>
      );

    case "pendingShipment":
      return (
        <div className="mt-3 space-y-2">
          <Field label={t("order.card.wulouNo")} value={order.wulouNo} />
          {order.track && <LogisticsTracks track={order.track} />}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.viewDomestic")}
            </button>
          </div>
        </div>
      );

    case "inTransit":
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Field label={t("order.card.wulouNo")} value={order.wulouNo} />
            <Field label={t("order.card.intlTrackingNo")} value={order.intlTrackingNo} />
            <Field label={t("order.card.carrier")} value={order.carrier} />
            <Field label={t("order.card.eta")} value={order.logisticsEta} />
          </div>
          {order.track && <LogisticsTracks track={order.track} />}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.viewIntl")}
            </button>
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.handleException")}
            </button>
          </div>
        </div>
      );

    case "delivered":
      return (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label={t("order.card.signedAt")} value={order.signedAt} />
            <Field label={t("order.card.signedBy")} value={order.signedBy} />
            <Field label={t("order.card.deliveryStatus")} value={order.deliveryStatus} />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="rounded-[var(--radius-control)] border border-brand bg-surface px-3 py-1.5 text-xs font-medium text-brand hover:bg-surface-hover"
            >
              {t("order.card.archive")}
            </button>
          </div>
        </div>
      );

    case "canceled":
      return (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Field label={t("order.card.canceledAt")} value={order.canceledAt} />
            <Field label={t("order.card.cancelReason")} value={order.cancelReason} />
            <Field label={t("order.card.refundStatus")} value={order.refundStatus} />
          </div>
        </div>
      );
  }
}

export function OrderCard({ order }: { order: OrderSummary }) {
  const t = useT();
  const item = order.lineItems?.[0];
  return (
    <article className="rounded-[var(--radius-card)] border border-hairline bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-soft text-sm font-semibold text-brand-accent">
          {(item?.title ?? order.shopOrderNo).slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {item?.title ?? order.shopOrderNo}
              </p>
              <p className="mt-0.5 text-xs text-ink-subtle">
                SKU: {item?.sku ?? "—"}
              </p>
            </div>
            <a
              href={shopifyAdminUrl(order.shopifyOrderId)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-link hover:text-link-hover hover:underline"
            >
              {t("order.viewDetail")} ↗
            </a>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} />
            <span className="rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-muted">
              {order.destinationCountry.name}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Field label={t("order.columns.shopOrderNo")} value={order.shopOrderNo} />
            <Field label={t("order.columns.tangbuyOrderNo")} value={order.tangbuyOrderNo} />
            <Field label={t("order.columns.supplierOrderNo")} value={order.supplierOrderNo} />
            <Field label={t("order.card.createdAt")} value={order.createdAt} />
          </div>

          <StatusBody order={order} t={t} />
        </div>
      </div>
    </article>
  );
}
