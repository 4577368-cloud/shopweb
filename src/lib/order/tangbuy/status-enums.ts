/**
 * Tangbuy 状态枚举 — 自采购系统 `tangbuy-procurement-web/src/lib/tangbuy/status-enums.ts` 引入。
 * 字段名与数仓宽表 / Admin listOrderDetail 映射一致。
 */
import type { ProcurementQueue } from "./procurement-queue";

export interface TangbuyStatusEntry {
  code: number;
  label: string;
  orderQueue?: ProcurementQueue;
  exception?: boolean;
}

export const TANGBUY_ORD_STAT: TangbuyStatusEntry[] = [
  { code: 0, label: "待付款", orderQueue: "pending_payment" },
  { code: 1, label: "待下单", orderQueue: "pending_procurement" },
  { code: 2, label: "处理中", orderQueue: "pending_procurement" },
  { code: 3, label: "转单中" },
  { code: 4, label: "取消订购", orderQueue: "reverse", exception: true },
  { code: 5, label: "邮费补款", orderQueue: "pending_payment" },
  { code: 6, label: "风控中", orderQueue: "exception", exception: true },
  { code: 7, label: "撤单退款", orderQueue: "reverse", exception: true },
  { code: 8, label: "支付中", orderQueue: "pending_payment" },
  { code: 9, label: "已完成", orderQueue: "dispatched" },
];

export const TANGBUY_DS_ORD_STAT: TangbuyStatusEntry[] = [
  { code: 1, label: "待处理", orderQueue: "pending_procurement" },
  { code: 2, label: "待支付", orderQueue: "pending_payment" },
  { code: 3, label: "备货中", orderQueue: "ordered" },
  { code: 4, label: "待发货", orderQueue: "ordered" },
  { code: 5, label: "待送达", orderQueue: "shipped" },
  { code: 6, label: "已完结", orderQueue: "dispatched" },
  { code: 9, label: "已取消", orderQueue: "reverse", exception: true },
  { code: 10, label: "已退款", orderQueue: "reverse", exception: true },
  { code: 11, label: "已失效", orderQueue: "exception", exception: true },
];

/** Admin item.goodsStatus → 宽表 ord_line_stat */
export const TANGBUY_ORD_LINE_STAT: TangbuyStatusEntry[] = [
  { code: -2, label: "支付中", orderQueue: "pending_payment" },
  { code: -1, label: "待支付", orderQueue: "pending_payment" },
  { code: 0, label: "待接单", orderQueue: "pending_procurement" },
  { code: 2, label: "待补款", orderQueue: "pending_payment" },
  { code: 5, label: "已发货", orderQueue: "shipped" },
  { code: 6, label: "分开发货", orderQueue: "shipped" },
  { code: 8, label: "已签收", orderQueue: "shipped" },
  { code: 9, label: "已到货", orderQueue: "in_warehouse" },
  { code: 10, label: "已入库", orderQueue: "in_warehouse" },
  { code: 11, label: "作废", orderQueue: "reverse", exception: true },
  { code: 14, label: "异常待确认", orderQueue: "exception", exception: true },
  { code: 22, label: "已订购", orderQueue: "ordered" },
  { code: 23, label: "处理中", orderQueue: "pending_procurement" },
  { code: 24, label: "取消订购", orderQueue: "reverse", exception: true },
  { code: 25, label: "异常订单", orderQueue: "exception", exception: true },
  { code: 28, label: "出库中", orderQueue: "in_warehouse" },
  { code: 29, label: "出库打包完毕", orderQueue: "in_warehouse" },
  { code: 30, label: "寄送海外", orderQueue: "dispatched" },
  { code: 31, label: "已收到货", orderQueue: "dispatched" },
  { code: 33, label: "风控审核", orderQueue: "exception", exception: true },
  { code: 37, label: "等待出库", orderQueue: "in_warehouse" },
  { code: 54, label: "1688待生成", orderQueue: "pending_procurement" },
  { code: 55, label: "1688待支付", orderQueue: "pending_payment" },
  { code: 58, label: "仓库处理中", orderQueue: "in_warehouse" },
];

function lookupLabel(table: TangbuyStatusEntry[], code: number | undefined | null): string | undefined {
  if (code === undefined || code === null) return undefined;
  return table.find((x) => x.code === code)?.label;
}

export function ordLineStatLabel(code: number | undefined | null): string | undefined {
  return lookupLabel(TANGBUY_ORD_LINE_STAT, code);
}
