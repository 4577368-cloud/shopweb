import type { OrderStatus } from "../types";
import type { MerchantOrdLineSnapshot } from "./ord-line-snapshot";
import {
  merchantPhaseToOrderStatus,
  resolveMerchantFulfillmentPhase,
  type MerchantFulfillmentPhase,
} from "./merchant-fulfillment-phase";
import { resolveProcurementQueue, type ProcurementQueue } from "./procurement-queue";

export type ProcurementExceptionTag =
  | "return_in_progress"
  | "exchange_in_progress"
  | "refused_sign"
  | "exception_handling"
  | "frozen"
  | "canceled";

export interface MerchantProcurementStatus {
  status: OrderStatus;
  phase: MerchantFulfillmentPhase;
  queue?: ProcurementQueue;
  lineStatusLabel?: string;
  exceptionTag?: ProcurementExceptionTag;
}

const RETURN_GOODS = new Set([3, 16, 18, 20, 26, 43, 51]);
const EXCHANGE_GOODS = new Set([4, 17, 19, 21, 27, 44, 52]);

function resolveExceptionTag(row: MerchantOrdLineSnapshot): ProcurementExceptionTag | undefined {
  const goods = row.ord_line_stat;
  const rtn = row.rtn_stat ?? 0;
  if (goods === 39 || goods === 40) return "refused_sign";
  if (goods === 35 || goods === 38) return "frozen";
  if (RETURN_GOODS.has(goods ?? -999)) return "return_in_progress";
  if (EXCHANGE_GOODS.has(goods ?? -999)) return "exchange_in_progress";
  if (goods === 25 || goods === 41 || goods === 42 || goods === 14 || goods === 33) {
    return "exception_handling";
  }
  if (rtn && Number(rtn) !== 0) return "return_in_progress";
  if (goods === 24 || goods === 11) return "canceled";
  return undefined;
}

/** Admin 子单 → 商家订单中心状态（履约阶段模型，优先于 Shopify 头启发式） */
export function deriveMerchantStatusFromProcurement(
  row: MerchantOrdLineSnapshot,
): MerchantProcurementStatus {
  const goods = row.ord_line_stat;
  const exceptionTag = resolveExceptionTag(row);
  let phase = resolveMerchantFulfillmentPhase(row);
  if (exceptionTag === "canceled") phase = "canceled";

  const status = merchantPhaseToOrderStatus(phase, goods);
  const queue = resolveProcurementQueue(row);

  return {
    status,
    phase,
    queue,
    lineStatusLabel: phase,
    exceptionTag,
  };
}
