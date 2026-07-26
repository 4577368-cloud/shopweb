/** pipispy data API paths (POST body `{ uri, params }` via tangbuy-plugin). */
export const PIPISPY_URI = {
  competition: "/v3/api/open/store/detail/competition",
  products: "/v3/api/open/store/detail/competition/products",
  rankList: "/v3/api/open/rank/ad-product/list",
  productsSearch: "/v3/api/open/ppspy/ad-products/search",
  productDetail: "/v3/api/open/ppspy/ad-products/detail",
  tiktokShopList: "/v3/api/open/tiktok-shop/shop/list",
  // TikTok Shop 店铺详情（单店富 dossier：ad_cost/root_path/goods_ad_rate/commission/landing/desc；1 积分/次，3 天内同 id 免费）
  tiktokShopDetail: "/v3/api/open/tiktok-shop/shop/detail",
  aiImageSubmit: "/v3/api/open/ai-search/image/submit",
  aiImageStatus: "/v3/api/open/ai-search/image/status",
  aiImageResult: "/v3/api/open/ai-search/image/resultSummary",
  // 创意打法库（公开广告库，关键词可空 → 无需输入即满屏高价值创意）
  adspyList: "/v3/api/open/adspy/list",
  // 含已停投：Meta 公开广告库（补全创意完整生命周期）
  adLibraryAds: "/v3/api/open/ad-library/ads",
  // 竞店检索（store/list，域名/店名 → 13 字符 ID 解析，1 积分/条）
  storeSearch: "/v3/api/open/store/list",
  // 竞店充实（store/detail 族，享 3 天免费窗口，基于 store id）
  storeAdTrend: "/v3/api/open/store/ad-trend",
  storeLongest: "/v3/api/open/store/longest-run-ads",
  storeMostUsed: "/v3/api/open/store/most-used-ads",
  storeFbPages: "/v3/api/open/store/fb-pages",
  // 店铺数据分析（store/data-analysis，截图「数据分析」整块，一次调用全拿，3 天免费）
  storeDataAnalysis: "/v3/api/open/store/data-analysis",
  storeRegionAnalysis: "/v3/api/open/store/region-analysis",
  storeDeliveryAnalysis: "/v3/api/open/store/delivery-analysis",
} as const;
