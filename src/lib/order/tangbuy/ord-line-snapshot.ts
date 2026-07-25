/**
 * 商家订单中心可消费的 Tangbuy 子单快照（宽表 `ads_ops_ord_line_rel_td` 子集）。
 * 由 tangbuy-plugin 经 `listOrderDetail` + 采购系统 mapper 产出；禁止包含 pur_prc / 盈亏 / 买手等内部字段。
 *
 * 契约来源：`/Users/panda/Documents/采购系统/tangbuy-procurement-api/app/integrations/tangbuy_admin/mapper.py`
 */

export interface MerchantTimelineEvent {
  time: string;
  action: string;
  actor?: string;
}

/** BFF 返回、与 plugin 对齐的字段名（snake_case 与宽表一致） */
export interface MerchantOrdLineSnapshot {
  ord_line_no?: string;
  ord_no?: string;
  out_ord_no?: string;
  ord_line_stat?: number;
  ord_line_stat_nm?: string;
  ord_stat?: number;
  rtn_stat?: number;
  abn_type_cd?: number;
  item_nm?: string;
  item_img?: string;
  item_url?: string;
  shop_pltf_cd?: string;
  ord_cnt?: number;
  pay_time?: string;
  pur_no?: string;
  pur_time?: string;
  sign_time?: string;
  exprs_no?: string;
  exprs_nm?: string;
  pkg_rcv_cntry?: string;
  usr_cntry_nm?: string;
  usr_rmk?: string;
  store_source?: string;
  item_no?: string;
  timeline?: MerchantTimelineEvent[];
}
