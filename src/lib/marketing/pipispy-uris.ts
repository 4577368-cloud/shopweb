/** pipispy data API paths (POST body `{ uri, params }` via tangbuy-plugin). */
export const PIPISPY_URI = {
  competition: "/v3/api/open/store/detail/competition",
  products: "/v3/api/open/store/detail/competition/products",
  rankList: "/v3/api/open/rank/ad-product/list",
  productsSearch: "/v3/api/open/ppspy/ad-products/search",
  productDetail: "/v3/api/open/ppspy/ad-products/detail",
  tiktokShopList: "/v3/api/open/tiktok-shop/shop/list",
  aiImageSubmit: "/v3/api/open/ai-search/image/submit",
  aiImageStatus: "/v3/api/open/ai-search/image/status",
  aiImageResult: "/v3/api/open/ai-search/image/resultSummary",
} as const;
