/** Central app branding — Tangbuy AI Sourcing */

export const APP_NAME = "Tangbuy";
export const APP_TAGLINE = "AI Sourcing";
export const APP_FULL_NAME = "Tangbuy AI Sourcing";
export const APP_DESCRIPTION =
  "Shopify 商家智能货源匹配工作台 — 图搜关联、SKU 对齐、物流报价与上架";

/** Full horizontal brand logo (source: docs/logo60-svg.svg; spec max-height 48px in chrome). */
export const BRAND_LOGO_FULL = "/brand/logo60-svg.svg";

/** Browser tab / PWA icon (source: docs/logo-60.svg). */
export const BRAND_FAVICON = "/brand/logo-60.svg";

/** @deprecated Use {@link APP_TAGLINE} */
export const APP_SUBTITLE = APP_TAGLINE;

/** Tangbuy dropshipping portal — same Tangbuy account, web workspace. */
export const TANGBUY_DROPSHIPPING_URL = "https://dropshipping.tangbuy.com";

/** Shopify App Store listing for Tangbuy Dropshipping (companion app). */
export const TANGBUY_DROPSHIPPING_APP_STORE_URL =
  "https://apps.shopify.com/tangbuy-dropshipping";

/** Official marketing site — copy reference / optional footer only. */
export const TANGBUY_OFFICIAL_URL = "https://www.tangbuy.com";

export function tangbuyDropshippingWebUrl(opts?: {
  from?: string;
  shop?: string;
}): string {
  const url = new URL(TANGBUY_DROPSHIPPING_URL);
  url.searchParams.set("from", opts?.from ?? "ai-sourcing");
  if (opts?.shop?.trim()) url.searchParams.set("shop", opts.shop.trim());
  return url.toString();
}

export function tangbuyDropshippingAppStoreUrl(locale?: string): string {
  const url = new URL(TANGBUY_DROPSHIPPING_APP_STORE_URL);
  if (locale === "zh") url.searchParams.set("locale", "zh-CN");
  else if (locale === "fr") url.searchParams.set("locale", "fr");
  else if (locale === "es") url.searchParams.set("locale", "es");
  return url.toString();
}
