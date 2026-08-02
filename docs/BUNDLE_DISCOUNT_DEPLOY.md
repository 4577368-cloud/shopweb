# Bundle / Combo Discount Function — deploy runbook

Partner / ops **one-time** setup so checkout discounts from 60s metafields apply.
Does **not** change Tangbuy procurement or `OrderBindingResolver` expand logic.

## What it reads

| Source | Metafield | Behavior |
|--------|-----------|----------|
| Track A Fixed Kit parent | `tangbuy_bundle.discount_percent` | % off parent cart line |
| Track B qty combo | `tangbuy_combo.config` (`kind=qty_discount`) | % off when cart qty ≥ threshold |
| Track B variant pair | same (`kind=variant_pair`) | % off when both variants are in cart |

Gift free-line (`tangbuy_gift.rule`) is Phase 2 — rules are saved from 60s first.

## Prerequisites

- Shopify Partner app = **60s Sourcing** (`shopify.app.toml` `client_id`)
- CLI: `@shopify/cli` + logged-in Partner account
- Dev/prod store with Bundles / Functions eligible checkout
- Extension code: `extensions/bundle-discount/`

## Build & deploy

```bash
cd /path/to/shopify_qianru
cd extensions/bundle-discount && npm install && cd ../..
shopify app deploy
```

CLI builds JS → `extensions/bundle-discount/dist/function.wasm`.
Confirm `shopify.app.toml` stays aligned; Function targets are
`cart.lines.discounts.generate.run` (+ delivery stub) on API `2026-01`.

## Enable Automatic App Discount (Admin)

1. Shopify Admin → **Discounts** → **Create discount**
2. Choose **App discount** → **Tangbuy Bundle Discount**
3. Method: **Automatic** (no code)
4. Discount classes: enable **Product** (required)
5. Combinations: allow with shipping/order as needed; save & activate

Without this step, metafields are written but checkout never invokes the Function.

## Verify

1. 60s: create Track A kit with discount % > 0, or Track B qty combo.
2. Storefront: add qualifying product(s) to cart → checkout shows discount message
   (`Kit discount` / `Quantity discount` / `Combo discount`).
3. Tangbuy ops order: parent kit still expands to component source lines at **source cost**
   (not discounted retail).

## Rollback

- Deactivate / delete the Automatic app discount in Admin, **or**
- Redeploy with empty Function / remove extension via Partner dashboard.

## Scope note

If deploy fails on Function scopes, add product-discount Function permission in Partner
Dashboard → App → API access, then retry `shopify app deploy`.
