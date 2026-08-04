"use client";

// 订单详情抽屉（右侧滑出）。渲染设计稿 §2.3 字段矩阵 + 物流双轨 mini 进度条。
// 商品明细在真实订单缺失时诚实占位（P0-8）；
// A+ 批：待下单→下单 / 待支付→支付 按钮在头部按状态显示（替换原 disabled 重新下单）。
import { useEffect, useState } from "react";
import { useT } from "@/i18n/LocaleProvider";
import { X, ExternalLink, Link2 } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrderSummary } from "@/lib/order/types";
import { StatusBadge } from "./status-badge";
import { ProcurementStatusMeta } from "./procurement-status-meta";
import { LogisticsTracksMini } from "./logistics-tracks-mini";
import { OrderRecipientPanel } from "./order-recipient-panel";
import { shopifyAdminUrl, FALLBACK_SHOP_DOMAIN } from "@/lib/order/shopify-admin-url";
import { isRecipientIncomplete } from "@/lib/order/api";
import type { OrderRecipient } from "@/lib/order/types";

export interface OrderDetailDrawerProps {
  order: OrderSummary | null;
  shopDomain: string;
  /** Short shop name for address save API (optional; mock falls back to localStorage). */
  shopName?: string;
  onClose: () => void;
  onPlace?: (order: OrderSummary) => void;
  onOpenPayment?: (order: OrderSummary) => void;
  placingId?: string;
  onRecipientSaved?: (orderId: string, recipient: OrderRecipient) => void;
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <span className="shrink-0 text-ink-subtle">{label}</span>
      <span className="truncate text-right text-ink">{value}</span>
    </div>
  );
}

export function OrderDetailDrawer({
  order,
  shopDomain,
  shopName = "",
  onClose,
  onPlace,
  onOpenPayment,
  placingId,
  onRecipientSaved,
}: OrderDetailDrawerProps) {
  const t = useT();
  const [recipientOpen, setRecipientOpen] = useState(false);

  // Esc 关闭（收件人面板打开时由其自行处理 Esc）
  useEffect(() => {
    if (!order || recipientOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, onClose, recipientOpen]);

  if (!order) return null;

  const domain = shopDomain || FALLBACK_SHOP_DOMAIN;
  const lineItems = order.lineItems ?? [];
  const recipientIncomplete =
    order.recipient == null || isRecipientIncomplete(order.recipient);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-hairline bg-surface shadow-xl">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {order.shopOrderNo}
            </p>
            <p className="text-[11px] text-ink-subtle">{t("order.drawer.title")}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label={t("order.drawer.close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 内容 */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {/* 状态 + 操作 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0">
              <StatusBadge status={order.status} />
              <ProcurementStatusMeta order={order} />
            </div>
            {order.paymentStatus && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                {t(`order.paymentStatus.${order.paymentStatus}`)}
              </span>
            )}
            <a
              href={shopifyAdminUrl(order.shopifyOrderId, domain)}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-[11px] font-medium text-link hover:text-link-hover hover:underline"
            >
              {t("order.drawer.shopify")}
              <ExternalLink className="h-3 w-3" />
            </a>
            {/* A+ 批：按状态显示下单 / 支付按钮（替代原 disabled "重新下单"） */}
            {order.status === "pendingOrder" && onPlace && (
              <Button
                size="sm"
                variant="primary"
                disabled={placingId === order.id}
                onClick={() => onPlace(order)}
              >
                {t("order.action.placeBtn")}
              </Button>
            )}
            {order.status === "pendingPayment" && onOpenPayment && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => onOpenPayment(order)}
              >
                {t("order.action.payBtn")}
              </Button>
            )}
          </div>

          {/* 基础字段 */}
          <div className="rounded-[var(--radius-card)] border border-hairline bg-muted px-3 py-1.5">
            <Field label={t("order.drawer.tangbuyNo")} value={order.tangbuyOrderNo} />
            <Field
              label={t("order.columns.supplierOrderNo")}
              value={
                order.supplierOrderNo && order.supplierOrderNo !== "—"
                  ? order.supplierOrderNo
                  : undefined
              }
            />
            <Field
              label={t("order.procurement.lineStatus")}
              value={
                order.merchantFulfillmentPhase
                  ? t(`order.merchantPhase.${order.merchantFulfillmentPhase}`)
                  : order.procurementLineStatusLabel
              }
            />
            <Field label={t("order.card.intlTrackingNo")} value={order.intlTrackingNo} />
            <Field label={t("order.card.carrier")} value={order.carrier} />
            <Field label={t("order.card.createdAt")} value={order.createdAt} />
            <Field label={t("order.table.amount")} value={order.productCost} />
            <Field label={t("order.columns.destination")} value={order.destinationCountry.name} />
            <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
              <span className="shrink-0 text-ink-subtle">
                {t("order.recipient.linkLabel")}
              </span>
              <button
                type="button"
                onClick={() => setRecipientOpen(true)}
                className="truncate text-right text-[12px] font-medium text-link hover:text-link-hover hover:underline"
              >
                {recipientIncomplete
                  ? t("order.recipient.linkIncomplete")
                  : t("order.recipient.linkView")}
              </button>
            </div>
          </div>

          {/* 商品 */}
          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("order.drawer.sectionProducts")}
            </p>
            {lineItems.length > 0 ? (
              <ul className="space-y-1.5">
                {lineItems.map((it, i) => (
                  <li
                    key={i}
                    className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2"
                  >
                    <p className="truncate text-[12px] font-medium text-ink">{it.title}</p>
                    <div className="mt-0.5 flex items-center gap-3 text-[10px] text-ink-subtle">
                      <span>SKU: {it.sku}</span>
                      <span>×{it.qty}</span>
                      {it.unitCost && <span>{it.unitCost}</span>}
                    </div>
                    {it.linkedOffer && (
                        <div className="mt-2 rounded-[var(--radius-card)] border border-info bg-info-soft px-2.5 py-1.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-info">
                          <Link2 className="h-3 w-3" />
                          <span>{t("order.drawer.linkedOffer")}</span>
                          <span className="rounded-full bg-info-soft px-1.5 py-0.5 text-[9px] text-info">
                            {it.linkedOffer.sourceRole === "PRIMARY"
                              ? t("order.drawer.linkedRolePrimary")
                              : t("order.drawer.linkedRoleSupplement")}
                          </span>
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-ink-muted">
                            {it.linkedOffer.source === "TANGBUY"
                              ? t("order.drawer.linkedSourceTangbuy")
                              : t("order.drawer.linkedSource1688")}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-ink">{it.linkedOffer.title}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-ink-subtle">
                          <span>
                            {t("order.drawer.linkedOfferId")}: {it.linkedOffer.offerId}
                          </span>
                          <span>
                            {t("order.drawer.linkedProcurement")}: {it.linkedOffer.procurementPrice}
                          </span>
                          {it.linkedOffer.detailUrl && (
                            <a
                              href={it.linkedOffer.detailUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-link hover:underline"
                            >
                              {t("order.drawer.linkedDetail")}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-[var(--radius-card)] border border-dashed border-hairline bg-muted px-3 py-3">
                <p className="text-[11px] text-ink-subtle">{t("order.drawer.noProduct")}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-ink-subtle">
                  {t("order.drawer.noProductNote")}
                </p>
                <a
                  href={shopifyAdminUrl(order.shopifyOrderId, domain)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-hairline px-2.5 py-1 text-[11px] font-medium text-link hover:text-link-hover hover:underline"
                >
                  {t("order.drawer.shopify")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </section>

          {/* 物流进度 */}
          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("order.drawer.sectionLogistics")}
            </p>
            <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2.5">
              <LogisticsTracksMini track={order.track} />
            </div>
          </section>

          {/* 成本汇总 */}
          <section>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              {t("order.drawer.costGoods")}
            </p>
            <div className="rounded-[var(--radius-card)] border border-hairline bg-muted px-3 py-1.5">
              <Field label={t("order.drawer.costGoods")} value={order.productCost} />
              <Field label={t("order.drawer.costShipping")} value={order.logisticsFee} />
            </div>
          </section>
        </div>
      </aside>

      <OrderRecipientPanel
        order={order}
        shopName={shopName}
        open={recipientOpen}
        onClose={() => setRecipientOpen(false)}
        onSaved={(recipient) => {
          onRecipientSaved?.(order.id, recipient);
        }}
      />
    </div>
  );
}
