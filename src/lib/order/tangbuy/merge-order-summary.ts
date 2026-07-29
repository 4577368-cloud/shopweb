import type { DestinationCountry, OrderSummary } from "../types";
import type { MerchantOrdLineSnapshot } from "./ord-line-snapshot";
import {
  isShopifyAwaitingCustomerPayment,
} from "./merchant-fulfillment-phase";
import { deriveMerchantStatusFromProcurement } from "./resolve-merchant-status";

function countryFromSnapshot(row: MerchantOrdLineSnapshot): DestinationCountry {
  const name = (row.pkg_rcv_cntry ?? row.usr_cntry_nm ?? "").trim();
  if (!name) return { code: "", name: "—" };
  return { code: "", name };
}

/**
 * 将 BFF 下发的采购快照合并进订单摘要（不覆盖 Shopify 标识字段）。
 */
export function applyProcurementSnapshot(
  base: OrderSummary,
  row: MerchantOrdLineSnapshot,
  opts?: { shopifyFinancialStatus?: string | null },
): OrderSummary {
  if (isShopifyAwaitingCustomerPayment(opts?.shopifyFinancialStatus)) {
    const country = countryFromSnapshot(row);
    const hasCountry = country.name !== "—";
    return {
      ...base,
      status: "pendingOrder",
      merchantFulfillmentPhase: "awaiting_order_payment",
      tangbuyOrderNo: row.ord_no ?? row.ord_line_no ?? base.tangbuyOrderNo,
      destinationCountry: hasCountry ? country : base.destinationCountry,
      procurementLineStatus: row.ord_line_stat,
      procurementLineStatusLabel: "awaiting_order_payment",
    };
  }

  const proc = deriveMerchantStatusFromProcurement(row);
  const country = countryFromSnapshot(row);
  const hasCountry = country.name !== "—";

  return {
    ...base,
    status: proc.status,
    tangbuyOrderNo: row.ord_no ?? row.ord_line_no ?? base.tangbuyOrderNo,
    supplierOrderNo: row.pur_no ?? base.supplierOrderNo,
    destinationCountry: hasCountry ? country : base.destinationCountry,
    procurementLineStatus: row.ord_line_stat,
    procurementLineStatusLabel: proc.lineStatusLabel,
    merchantFulfillmentPhase: proc.phase,
    procurementExceptionTag: proc.exceptionTag,
    procurementQueue: proc.queue,
    carrier: row.exprs_nm ?? base.carrier,
    intlTrackingNo: row.exprs_no ?? base.intlTrackingNo,
    signedAt: row.sign_time ?? base.signedAt,
    expectedShipAt: row.pur_time ?? base.expectedShipAt,
    remark: row.usr_rmk?.trim() || base.remark,
  };
}
