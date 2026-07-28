# Shopify App Listing — Tangbuy AI Sourcing (60s)

Partner / App Store checklist for **this** app (separate listing from [Tangbuy Dropshipping](https://apps.shopify.com/tangbuy-dropshipping)).

## Positioning

| | This app | Companion |
|--|----------|-----------|
| Listing | Tangbuy AI Sourcing / 60s Sourcing | Tangbuy Dropshipping |
| Job | Authorize → source → list → SKU / logistics config → sync | Orders, fulfillment, tracking, inquiry |
| Account | Same Tangbuy account | Same Tangbuy account |
| In-app handoff | `/upgrade` + sync complete → App Store install card | — |

## Recommended OAuth scopes (narrow)

Request only what listing / product config needs. **Do not** request order or fulfillment scopes on this app.

| Scope | Why |
|-------|-----|
| `read_products` | Mirror shop catalog, binding UI |
| `write_products` | Title / price / status / publish writes from sourcing |
| `read_product_listings` (if needed) | Channel listing visibility |
| `read_locations` (only if required by shipping template flows) | Prefer omit until needed |

**Explicitly omit (belong to Dropshipping):**

- `read_orders` / `write_orders`
- `read_fulfillments` / `write_fulfillments`
- `read_assigned_fulfillment_orders` / `write_*_fulfillment_orders`
- `read_shipping` / `write_shipping` (unless a future logistics write-back truly requires it)
- `read_customers` / `write_customers`

Actual scopes are configured in **Shopify Partner → App → API access** and enforced by `tangbuy-plugin` install URL — keep Partner dashboard aligned with this doc.

## Listing disclosure (companion)

Paste into App Store listing **Description** / **Details** (EN example):

> Tangbuy AI Sourcing helps you find suppliers and list products on Shopify quickly (sourcing, SKU alignment, and logistics prep).  
> For order management and dropshipping fulfillment, install our companion app **Tangbuy Dropshipping** ([App Store](https://apps.shopify.com/tangbuy-dropshipping)) — same Tangbuy account.  
> This app does not process store orders; that workflow lives in Tangbuy Dropshipping.

中文示例：

> Tangbuy AI Sourcing（60s Sourcing）帮助你在 Shopify 快速完成货源匹配、上架与 SKU / 物流准备。  
> 订单管理与一件代发履约请安装配套应用 **Tangbuy Dropshipping**（同一 Tangbuy 账号）。  
> 本应用不处理店铺订单；经营与履约在 Tangbuy Dropshipping。

## In-product handoff (already shipped)

- Primary CTA: `https://apps.shopify.com/tangbuy-dropshipping`
- Secondary: `https://dropshipping.tangbuy.com?from=ai-sourcing`
- Footer optional: `https://www.tangbuy.com`
- Soft recommend only — never gate core sourcing features on installing Dropshipping
- Do **not** promote companion apps from Admin / Theme / Checkout extensions

## App URL / OAuth

- App URL / embedded home: production frontend (e.g. `https://ai.tangbuy.com`)
- Install start: `/api/plugin/shopify/auth/install` (rewritten to plugin)
- Callback: configured on Render `tangbuy-plugin` (see [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md))

## Review hygiene

- Listing permissions text must match requested scopes (products, not orders)
- Authorize UI copy must not claim “order access” for this app
- Handoff must remain optional
