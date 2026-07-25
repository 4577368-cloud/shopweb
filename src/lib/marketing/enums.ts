// 运营中心 · 筛选枚举（pipispy「Others」参考表子集，设计 §2.8）。
// 说明：真实环境由 tangbuy-plugin 维护 marketing_pipispy_reference，前端只读 GET /api/plugin/marketing/reference/enums。
//      本文件为原型期代表性子集（mock），接后端后改为读枚举接口、且请求仍用原始 code。

export interface EnumItem {
  code: string;
  label: string;
}

/** 国家/地区（others-region 子集）。 */
export const REGIONS: EnumItem[] = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "IT", label: "Italy" },
  { code: "ES", label: "Spain" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
];

/** 广告商品类目（others-product-category 子集）。 */
export const AD_CATEGORIES: EnumItem[] = [
  { code: "beauty", label: "Beauty & Personal Care" },
  { code: "pet", label: "Pet Supplies" },
  { code: "home", label: "Home & Kitchen" },
  { code: "electronics", label: "Electronics" },
  { code: "fitness", label: "Fitness & Sports" },
  { code: "toys", label: "Toys & Games" },
  { code: "apparel", label: "Apparel & Accessories" },
  { code: "garden", label: "Garden & Outdoor" },
  { code: "auto", label: "Automotive" },
  { code: "baby", label: "Baby & Mother" },
];

/** TikTok Shop 店铺类目（others-product-category-tt-shop，与广告类目分表）。 */
export const TTS_CATEGORIES: EnumItem[] = [
  { code: "beauty", label: "Beauty" },
  { code: "women", label: "Women's Fashion" },
  { code: "men", label: "Men's Fashion" },
  { code: "home", label: "Home & Living" },
  { code: "food", label: "Food & Beverage" },
  { code: "pet", label: "Pet Supplies" },
  { code: "tech", label: "Tech & Electronics" },
  { code: "kids", label: "Kids & Baby" },
];

/** 店型（others-ad-shop-type 子集）。 */
export const SHOP_TYPES: EnumItem[] = [
  { code: "shopify", label: "Shopify" },
  { code: "shoplazza", label: "Shoplazza" },
  { code: "shopline", label: "Shopline" },
  { code: "shopyy", label: "Shopyy" },
  { code: "magento", label: "Magento" },
  { code: "woocommerce", label: "WooCommerce" },
  { code: "squarespace", label: "Squarespace" },
  { code: "wix", label: "Wix" },
];

/** 广告 CTA 按钮（others-button 子集）。 */
export const CTA_BUTTONS: EnumItem[] = [
  { code: "shop_now", label: "Shop Now" },
  { code: "learn_more", label: "Learn More" },
  { code: "sign_up", label: "Sign Up" },
  { code: "download", label: "Download" },
  { code: "get_offer", label: "Get Offer" },
  { code: "contact", label: "Contact Us" },
  { code: "book", label: "Book Now" },
];

export const regionLabel = (code: string) => REGIONS.find((r) => r.code === code)?.label ?? code;
export const categoryLabel = (code: string) => AD_CATEGORIES.find((c) => c.code === code)?.label ?? code;
export const ttsCategoryLabel = (code: string) => TTS_CATEGORIES.find((c) => c.code === code)?.label ?? code;
export const shopTypeLabel = (code: string) => SHOP_TYPES.find((s) => s.code === code)?.label ?? code;
export const ctaLabel = (code: string) => CTA_BUTTONS.find((c) => c.code === code)?.label ?? code;

/** 平台展示元数据（设计 §4.2）。 */
export const PLATFORM_META: Record<
  "tiktok" | "facebook" | "meta",
  { label: string; dot: string; text: string }
> = {
  tiktok: { label: "TikTok", dot: "#FE2C55", text: "#FE2C55" },
  facebook: { label: "Facebook", dot: "#1877F2", text: "#1877F2" },
  meta: { label: "Meta Library", dot: "#0668E1", text: "#0668E1" },
};
