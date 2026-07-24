"use client";

// 订单中心表格视图（参考图风格：紧凑列 + 多行单元格 + 行 hover/active）。
// 6 列：订单信息 / 商品 / 金额 / 订单状态 / 预计发货时间 / 操作。
// 点击行联动右栏「选中的订单」快览；点击「查看」跳 Shopify Admin。
import { useT } from "@/i18n/LocaleProvider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { ChevronDown, ExternalLink } from "@/lib/ui/icons";
import type { OrderSummary, PaymentStatus } from "@/lib/order/types";
import { cn } from "@/lib/utils";

// 占位店铺域名（独立站形态跳 Shopify Admin 新窗口；嵌入式走 App Bridge Redirect.dispatch）
const FALLBACK_SHOP_DOMAIN = "your-store.myshopify.com";
function shopifyAdminUrl(shopifyOrderId: string, domain: string): string {
  return `https://${domain || FALLBACK_SHOP_DOMAIN}/admin/orders/${shopifyOrderId}`;
}

function PaymentStatusPill({ status }: { status?: PaymentStatus }) {
  const t = useT();
  const cfg: Record<PaymentStatus, { className: string; labelKey: string }> = {
    paid: { className: "bg-emerald-50 text-emerald-700", labelKey: "order.paymentStatus.paid" },
    unpaid: { className: "bg-slate-100 text-slate-500", labelKey: "order.paymentStatus.unpaid" },
    partial: { className: "bg-amber-50 text-amber-700", labelKey: "order.paymentStatus.partial" },
  };
  const v = cfg[status ?? "unpaid"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        v.className
      )}
    >
      {t(v.labelKey)}
    </span>
  );
}

export interface OrderTableProps {
  orders: OrderSummary[];
  selectedOrderId?: string;
  shopDomain?: string;
  onRowClick?: (order: OrderSummary) => void;
}

export function OrderTable({ orders, selectedOrderId, shopDomain, onRowClick }: OrderTableProps) {
  const t = useT();
  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-10 text-center text-sm text-ink-muted">
        {t("order.empty")}
      </div>
    );
  }
  return (
    <div className="rounded-[var(--radius-card)] border border-hairline bg-surface">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[260px]">{t("order.table.info")}</TableHead>
            <TableHead className="w-[200px]">{t("order.table.products")}</TableHead>
            <TableHead className="w-[140px]">{t("order.table.amount")}</TableHead>
            <TableHead className="w-[120px]">{t("order.table.status")}</TableHead>
            <TableHead className="w-[140px]">{t("order.table.paymentStatus")}</TableHead>
            <TableHead className="w-[140px]">{t("order.table.expectedShipAt")}</TableHead>
            <TableHead className="w-[100px] text-right">{t("order.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const isSelected = selectedOrderId === o.id;
            const totalQty = (o.lineItems ?? []).reduce((s, it) => s + (it.qty ?? 1), 0);
            return (
              <TableRow
                key={o.id}
                onClick={() => onRowClick?.(o)}
                data-focused={isSelected ? "true" : undefined}
                className={cn(
                  "cursor-pointer",
                  isSelected && "!bg-brand-soft/60 !ring-1 !ring-inset !ring-brand/40"
                )}
              >
                {/* 订单信息 */}
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="truncate text-sm font-semibold text-ink">
                      {o.shopOrderNo}
                    </p>
                    <a
                      href={shopifyAdminUrl(o.shopifyOrderId, shopDomain ?? FALLBACK_SHOP_DOMAIN)}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-0.5 text-[11px] text-link hover:text-link-hover hover:underline"
                    >
                      Shopify: {o.shopifyOrderId.slice(-4)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <p className="text-[10px] text-ink-subtle">
                      {o.createdAt}
                    </p>
                  </div>
                </TableCell>

                {/* 商品 */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {(o.lineItems ?? []).slice(0, 2).map((it, i) => (
                        <div
                          key={i}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-slate-100 text-[10px] font-semibold text-slate-500"
                          title={it.title}
                        >
                          {(it.title ?? "?").slice(0, 1)}
                        </div>
                      ))}
                      {(o.lineItems?.length ?? 0) > 2 && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-slate-50 text-[10px] font-medium text-slate-500">
                          +{(o.lineItems?.length ?? 0) - 2}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted">
                      {t("order.card.qty")}: {totalQty}
                    </span>
                  </div>
                </TableCell>

                {/* 金额 */}
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold tabular-nums text-ink">
                      {o.productCost ?? "—"}
                    </p>
                    {o.logisticsFee && (
                      <p className="text-[10px] text-ink-subtle">
                        {t("order.table.shippingIncluded")} {o.logisticsFee}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* 订单状态 */}
                <TableCell>
                  <StatusBadge status={o.status} />
                </TableCell>

                {/* 支付状态 */}
                <TableCell>
                  <PaymentStatusPill status={o.paymentStatus} />
                </TableCell>

                {/* 预计发货时间 */}
                <TableCell>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {o.expectedShipAt ?? "—"}
                  </span>
                </TableCell>

                {/* 操作 */}
                <TableCell className="text-right">
                  <div
                    className="inline-flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={shopifyAdminUrl(o.shopifyOrderId, shopDomain ?? FALLBACK_SHOP_DOMAIN)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-link hover:text-link-hover hover:underline"
                    >
                      {t("order.table.viewAction")}
                    </a>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-ink-subtle hover:bg-canvas hover:text-ink-muted"
                      aria-label={t("order.table.moreAction")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}