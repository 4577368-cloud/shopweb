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
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./status-badge";
import { ProcurementStatusMeta } from "./procurement-status-meta";
import { ExternalLink, Plus } from "@/lib/ui/icons";
import type { OrderSummary, PaymentStatus } from "@/lib/order/types";
import { cn } from "@/lib/utils";
import { shopifyAdminUrl, FALLBACK_SHOP_DOMAIN } from "@/lib/order/shopify-admin-url";

function PaymentStatusPill({ status }: { status?: PaymentStatus }) {
  const t = useT();
  const cfg: Record<PaymentStatus, { className: string; labelKey: string }> = {
    paid: { className: "bg-success-soft text-success", labelKey: "order.paymentStatus.paid" },
    unpaid: { className: "bg-muted text-ink-muted", labelKey: "order.paymentStatus.unpaid" },
    partial: { className: "bg-warning-soft text-warning", labelKey: "order.paymentStatus.partial" },
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
  onOpenDetail?: (order: OrderSummary) => void;
  onPlace?: (order: OrderSummary) => void;
  onOpenPayment?: (order: OrderSummary) => void;
  /**
   * 行末「补充货源」➕ 回调：未关联的 line 触发。承载 outerVariantId/title/sku，
   * 由调用方决定是跳转 SKU 对齐页还是打开就地绑定抽屉。
   */
  onNeedBindSource?: (line: {
    outerVariantId?: string;
    title?: string;
    sku?: string;
  }) => void;
  placingId?: string;
}

export function OrderTable({
  orders,
  selectedOrderId,
  shopDomain,
  onRowClick,
  onOpenDetail,
  onPlace,
  onOpenPayment,
  onNeedBindSource,
  placingId,
}: OrderTableProps) {
  const t = useT();
  if (orders.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-hairline bg-surface px-4 py-10 text-center text-sm text-ink-muted">
        {t("order.empty")}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-hairline bg-surface">
      <Table className="min-w-[960px] table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[200px]">{t("order.table.info")}</TableHead>
            <TableHead className="w-[320px]">{t("order.table.products")}</TableHead>
            <TableHead className="w-[110px]">{t("order.table.amount")}</TableHead>
            <TableHead className="w-[110px]">{t("order.table.status")}</TableHead>
            <TableHead className="w-[100px]">{t("order.table.paymentStatus")}</TableHead>
            <TableHead className="w-[110px]">{t("order.table.expectedShipAt")}</TableHead>
            <TableHead className="w-[140px] text-right">{t("order.table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((o) => {
            const isSelected = selectedOrderId === o.id;
            const lineItems = o.lineItems ?? [];
            return (
              <TableRow
                key={o.id}
                onClick={() => {
                  onRowClick?.(o);
                }}
                data-focused={isSelected ? "true" : undefined}
                className={cn(
                  "cursor-pointer align-top",
                  isSelected && "!bg-surface-selected !ring-1 !ring-inset !ring-brand"
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

                {/* 商品（每行 lineItem 独立一条：图 + 标题 + SKU + 数量 + 未关联则 ➕） */}
                <TableCell className="align-top">
                  {lineItems.length > 0 ? (
                    <ul className="space-y-1.5">
                      {lineItems.map((it, i) => {
                        const initial =
                          (it.title ?? "?").trim().slice(0, 1).toUpperCase() || "?";
                        return (
                          <li
                            key={i}
                            className="flex items-center gap-2"
                            title={it.title ?? undefined}
                          >
                            {it.image ? (
                              <img
                                src={it.image}
                                alt={it.title ?? ""}
                                className="h-7 w-7 shrink-0 rounded-md border border-hairline object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-muted text-[10px] font-semibold text-ink-muted">
                                {initial}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-medium leading-tight text-ink">
                                {it.title ?? "—"}
                              </p>
                              {it.sku ? (
                                <p className="truncate text-[10px] leading-tight text-ink-subtle">
                                  {t("order.table.skuLabel")}: {it.sku}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-ink-muted">
                              x{it.qty ?? 1}
                            </span>
                            {!it.linkedOffer && onNeedBindSource && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNeedBindSource({
                                    outerVariantId: it.outerVariantId,
                                    title: it.title,
                                    sku: it.sku,
                                  });
                                }}
                                title={t("order.table.bindSource")}
                                aria-label={t("order.table.bindSource")}
                                className="ml-0.5 h-7 w-7 shrink-0 p-0"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="space-y-1">
                      <span className="inline-flex items-center rounded-full border border-dashed border-hairline bg-muted px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
                        {t("order.table.productPending")}
                      </span>
                      <a
                        href={shopifyAdminUrl(o.shopifyOrderId, shopDomain ?? FALLBACK_SHOP_DOMAIN)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-link hover:text-link-hover hover:underline"
                      >
                        {t("order.drawer.shopify")}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}
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
                  <ProcurementStatusMeta order={o} />
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
                    className="inline-flex items-center gap-1.5 whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* 待下单 → 下单按钮 */}
                    {o.status === "pendingOrder" && onPlace && (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={placingId === o.id}
                        onClick={() => onPlace(o)}
                      >
                        {t("order.action.placeBtn")}
                      </Button>
                    )}
                    {/* 待支付 → 支付按钮 */}
                    {o.status === "pendingPayment" && onOpenPayment && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onOpenPayment(o)}
                      >
                        {t("order.action.payBtn")}
                      </Button>
                    )}
                    {/* 详情按钮（统一开抽屉；跳 Shopify Admin 走订单信息列的 "Shopify: 7654" 链接） */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenDetail?.(o)}
                    >
                      {t("order.viewDetail")}
                    </Button>
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