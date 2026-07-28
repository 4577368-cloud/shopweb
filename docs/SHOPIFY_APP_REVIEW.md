# Shopify App Review — Tangbuy AI Sourcing (60s)

Companion to [`SHOPIFY_APP_LISTING_SCOPES.md`](./SHOPIFY_APP_LISTING_SCOPES.md). Use this before submitting App Review.

## Pricing & monetization (locked)

| Field | Value |
|-------|-------|
| App Store pricing | **Free** |
| In-app purchases / subscriptions | **None** |
| Shopify Billing API | **Not used** |
| Credits / recharge / PayPal in this app | **Removed** (`/account/bills`, `/account/credits` redirect to shops) |
| Companion Dropshipping | Soft recommend only via `/upgrade` — never gates sourcing |

Paste into listing **Pricing**: Free. In **App details**, state that the app does not sell credits or subscriptions.

## Scopes (must match Partner + `shopify.app.toml`)

- `read_products`, `write_products` only
- No order / fulfillment / customer scopes

## Mandatory webhooks

Configured in `shopify.app.toml` → plugin:

| Topic | Endpoint |
|-------|----------|
| `app/uninstalled` | `POST /api/plugin/shopify/webhooks` |
| `products/create`, `products/update`, `products/delete` | same |
| `customers/data_request`, `customers/redact`, `shop/redact` | `POST /api/plugin/shopify/webhooks/compliance` |

Behavior:

- **HMAC** verified on all webhook bodies (invalid → 401)
- **app/uninstalled** — clear offline token, mark auth `UNINSTALLED`
- **customers/** — acknowledge; this app stores no customer PII
- **shop/redact** — purge shop mirror, bindings, templates, acceptances, `user_shop` rows

## Listing copy checklist

- [ ] Permissions text mentions product catalog sync + optional title/price/status writes — **not** orders
- [ ] Description includes companion Dropshipping disclosure (see scopes doc)
- [ ] Pricing = Free; no IAP screenshots
- [ ] Privacy policy URL live; contact email reachable
- [ ] Embedded app URL = `https://ai.tangbuy.com` with `embedded=true`
- [ ] Partner `client_id` / `NEXT_PUBLIC_SHOPIFY_API_KEY` set (not placeholders)

## Dual-host E2E matrix

Run each row on **Embedded (Admin iframe)** and **Standalone (`ai.tangbuy.com`)**.

| Capability | Embedded | Standalone |
|------------|----------|------------|
| Install / OAuth (top-level consent) | ☐ | ☐ |
| Silent provision / session-token exchange | ☐ | N/A (cookie login) |
| Products mirror + image bind + write-back | ☐ | ☐ |
| SKU align confirm | ☐ | ☐ |
| Logistics analyze / accept / reopen (survives refresh) | ☐ | ☐ |
| Sync summary matches live counts | ☐ | ☐ |
| Upgrade handoff does not block | ☐ | ☐ |
| 401 recovery (token refresh / re-exchange) | ☐ | ☐ |
| Multi-shop switcher | Hidden / single shop | ☐ |
| Uninstall → token dead; `shop/redact` cleans data | ☐ | ☐ |

## Screen-recording path (reviewers)

1. Install from Partner test distribution → open in Admin  
2. Products: sync mirror → bind one source → optional price write  
3. SKU: confirm one mapping  
4. Logistics: save template → accept one line → reload still confirmed  
5. Sync: show ceremony numbers  
6. Optional: open `/upgrade` companion card (do not require install)

## Out of scope for this listing

- Operations center / order center  
- Shopify Billing / credits  
- Admin Theme / Checkout extensions promoting companions  

## Extending the app later

Any new Feature must follow [`EMBEDDED_HOST_TEMPLATE.md`](./EMBEDDED_HOST_TEMPLATE.md) (Host adapters + dual-host checklist). Do not reintroduce monetization or order scopes into this listing.