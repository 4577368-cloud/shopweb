"use client";

import { useT } from "@/i18n/LocaleProvider";
import { parseMoney } from "@/lib/order/payment";
import type { OrderSummary } from "@/lib/order/types";
import { sumGoodsAmountUsd } from "@/lib/order/place-logistics-api";

export function PlaceOrderStepItems({ order }: { order: OrderSummary }) {
  const t = useT();
  const lines = order.lineItems ?? [];
  const goodsTotal = sumGoodsAmountUsd(order);

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-ink-muted">
        {t("order.placeWizard.step1Hint", {
          account: "—",
          shopOrder: order.shopOrderNo,
        })}
      </p>

      <div>
        <h3 className="mb-2 text-[13px] font-semibold text-ink">
          {t("order.placeWizard.dropshipSection")}
        </h3>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-hairline">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-surface-muted text-ink-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">
                  {t("order.placeWizard.colSku")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("order.placeWizard.colCost")}
                </th>
                <th className="px-3 py-2 font-medium">
                  {t("order.placeWizard.colQty")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("order.placeWizard.colSubtotal")}
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-ink-subtle"
                  >
                    {t("order.drawer.noProduct")}
                  </td>
                </tr>
              ) : (
                lines.map((line, idx) => {
                  const unit =
                    parseMoney(line.linkedOffer?.procurementPrice) ??
                    parseMoney(line.unitCost) ??
                    0;
                  const sub = Math.round(unit * (line.qty || 1) * 100) / 100;
                  return (
                    <tr
                      key={`${line.outerVariantId ?? line.sku}-${idx}`}
                      className="border-t border-hairline"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2.5">
                          {line.image || line.linkedOffer?.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={line.image || line.linkedOffer?.imageUrl}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-md object-cover bg-muted"
                            />
                          ) : (
                            <div className="h-12 w-12 shrink-0 rounded-md bg-muted" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">
                              {line.linkedOffer?.title || line.title}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
                              {line.sku || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink">
                        {t("order.placeWizard.unitCostGte1", {
                          price: `$${unit.toFixed(2)}`,
                        })}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-ink">
                        {line.qty}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                        ${sub.toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 text-[13px]">
        <span className="text-ink-muted">
          {t("order.placeWizard.goodsTotal")}
        </span>
        <span className="font-semibold tabular-nums text-ink">
          ${goodsTotal.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
