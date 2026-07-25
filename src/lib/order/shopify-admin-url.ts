// 订单中心 · Shopify Admin URL 工具（统一三处重复定义）。
// 占位店铺域名（独立站形态跳 Shopify Admin 新窗口；嵌入式走 App Bridge Redirect.dispatch）。
export const FALLBACK_SHOP_DOMAIN = "your-store.myshopify.com";

export function shopifyAdminUrl(
  shopifyOrderId: string,
  domain?: string
): string {
  return `https://${domain || FALLBACK_SHOP_DOMAIN}/admin/orders/${shopifyOrderId}`;
}
